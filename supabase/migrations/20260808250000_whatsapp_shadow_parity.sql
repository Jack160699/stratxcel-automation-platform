-- Migration: verified-bot shadow/parity bridge.
--
-- Purpose: represent the EXISTING verified WhatsApp bot (legacy repo
-- Jack160699/ai-automation-system, live at bot.stratxcel.ai) inside the
-- Stratxcel product layer as an observer/mirror, never as a second sender.
-- Additive only. Does not touch queue_jobs, missions, payments, or any
-- table Phase B4 already hardened — it only adds a `source` marker column
-- to two of them and adds four new tables.

-- ============================================================
-- 1. WHATSAPP_PHONE_BINDINGS — mark the legacy binding, never trust a
--    client-supplied tenant for it (see packages/whatsapp legacy-bridge.ts)
-- ============================================================

alter table whatsapp_phone_bindings
  add column if not exists source text not null default 'native' check (source in ('native', 'legacy_verified_bot')),
  add column if not exists migration_status text not null default 'not_applicable'
    check (migration_status in ('not_applicable', 'shadowing', 'ready_for_review', 'cutover_pending', 'cutover_live')),
  add column if not exists legacy_host text;

-- There is exactly one verified legacy bot; this cannot silently become two.
create unique index if not exists whatsapp_phone_bindings_single_legacy_idx
  on whatsapp_phone_bindings (source)
  where source = 'legacy_verified_bot' and status <> 'revoked';

-- ============================================================
-- 2. WHATSAPP_MESSAGES — distinguish mirrored legacy traffic from native
--    Stratxcel-originated messages in the same inbox.
-- ============================================================

alter table whatsapp_messages
  add column if not exists source text not null default 'native' check (source in ('native', 'legacy_verified_bot'));

-- ============================================================
-- 3. WHATSAPP_SHADOW_EVENTS — raw normalized events mirrored from the
--    legacy bot. Idempotent by (source_system, source_event_id) so a
--    retried/replayed ingest call can never create a duplicate.
-- ============================================================

create table if not exists whatsapp_shadow_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone_binding_id uuid references whatsapp_phone_bindings(id) on delete set null,
  lead_id uuid references crm_leads(id) on delete set null,
  source_system text not null default 'legacy_verified_bot' check (source_system in ('legacy_verified_bot')),
  source_event_id text not null,
  event_type text not null check (event_type in (
    'inbound_message', 'outbound_message', 'delivery_status', 'lead_update',
    'qualification_update', 'human_handoff', 'followup_scheduled',
    'payment_intent_detected', 'bot_reply_decision', 'owner_command'
  )),
  direction text check (direction in ('inbound', 'outbound')),
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
alter table whatsapp_shadow_events enable row level security;
create unique index if not exists whatsapp_shadow_events_source_idx on whatsapp_shadow_events (source_system, source_event_id);
create index if not exists whatsapp_shadow_events_tenant_idx on whatsapp_shadow_events (tenant_id, received_at desc);
create policy whatsapp_shadow_events_tenant_read on whatsapp_shadow_events for select
  using (exists (select 1 from tenant_members m where m.tenant_id = whatsapp_shadow_events.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on whatsapp_shadow_events to service_role;
grant select on whatsapp_shadow_events to authenticated;

-- ============================================================
-- 4. WHATSAPP_PARITY_RECORDS — observed (legacy) vs shadow-proposed
--    (Stratxcel) comparison, one row per comparable legacy event.
-- ============================================================

create table if not exists whatsapp_parity_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone_binding_id uuid references whatsapp_phone_bindings(id) on delete set null,
  shadow_event_id uuid references whatsapp_shadow_events(id) on delete cascade,
  legacy_event_id text not null,
  received_at timestamptz not null default now(),
  input_fingerprint text,
  observed_action text,
  observed_reply_excerpt text,
  shadow_proposed_action text,
  shadow_proposed_reply_excerpt text,
  observed_lead_transition text,
  shadow_lead_transition text,
  observed_handoff boolean,
  shadow_handoff boolean,
  parity_category text not null default 'NOT_COMPARABLE'
    check (parity_category in ('MATCH', 'FUNCTIONAL_MATCH', 'EXPECTED_DIFFERENCE', 'MISMATCH', 'NOT_COMPARABLE', 'ERROR')),
  mismatch_reason text,
  error text,
  compared_at timestamptz,
  created_at timestamptz not null default now()
);
alter table whatsapp_parity_records enable row level security;
create unique index if not exists whatsapp_parity_records_tenant_legacy_idx on whatsapp_parity_records (tenant_id, legacy_event_id);
create index if not exists whatsapp_parity_records_tenant_idx on whatsapp_parity_records (tenant_id, created_at desc);
create policy whatsapp_parity_records_tenant_read on whatsapp_parity_records for select
  using (exists (select 1 from tenant_members m where m.tenant_id = whatsapp_parity_records.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on whatsapp_parity_records to service_role;
grant select on whatsapp_parity_records to authenticated;

-- ============================================================
-- 5. WHATSAPP_MIGRATION_IMPORTS — backfill/import dedupe + audit trail.
--    A rerun of the same importer can never create duplicate CRM rows.
-- ============================================================

create table if not exists whatsapp_migration_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_system text not null default 'legacy_verified_bot',
  source_record_type text not null,
  source_record_id text not null,
  target_table text not null,
  target_record_id uuid,
  imported_at timestamptz not null default now()
);
alter table whatsapp_migration_imports enable row level security;
create unique index if not exists whatsapp_migration_imports_source_idx
  on whatsapp_migration_imports (source_system, source_record_type, source_record_id);
create index if not exists whatsapp_migration_imports_tenant_idx on whatsapp_migration_imports (tenant_id);
create policy whatsapp_migration_imports_tenant_read on whatsapp_migration_imports for select
  using (exists (select 1 from tenant_members m where m.tenant_id = whatsapp_migration_imports.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on whatsapp_migration_imports to service_role;
grant select on whatsapp_migration_imports to authenticated;

-- ============================================================
-- 6. INGEST RPC — idempotent shadow-event insert, plus optional atomic
--    canonical-inbox mirroring. Never calls anything that sends a message;
--    this function only persists. The zero-send guarantee lives in
--    lib/whatsapp/send-outbound.ts (application code), not here — this RPC
--    has no ability to send regardless, since it has no adapter/HTTP access.
--    Tenant/lead/binding ids are parameters supplied by trusted server code
--    that has already resolved them (see legacy-bridge.ts) — this function
--    never derives a tenant from raw client input itself.
-- ============================================================

create or replace function public.ingest_legacy_whatsapp_shadow_event(
  p_tenant_id uuid,
  p_phone_binding_id uuid,
  p_lead_id uuid,
  p_source_event_id text,
  p_event_type text,
  p_direction text default null,
  p_occurred_at timestamptz default now(),
  p_payload jsonb default '{}'::jsonb,
  p_mirror_message boolean default false,
  p_message_direction text default null,
  p_message_body text default null,
  p_provider_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shadow_event record;
  v_conversation record;
  v_message record;
begin
  if p_event_type not in (
    'inbound_message', 'outbound_message', 'delivery_status', 'lead_update',
    'qualification_update', 'human_handoff', 'followup_scheduled',
    'payment_intent_detected', 'bot_reply_decision', 'owner_command'
  ) then
    return jsonb_build_object('success', false, 'reason', 'invalid_event_type');
  end if;

  insert into whatsapp_shadow_events (
    tenant_id, phone_binding_id, lead_id, source_event_id, event_type, direction, occurred_at, payload
  ) values (
    p_tenant_id, p_phone_binding_id, p_lead_id, p_source_event_id, p_event_type, p_direction,
    coalesce(p_occurred_at, now()), coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (source_system, source_event_id) do nothing
  returning * into v_shadow_event;

  if v_shadow_event is null then
    select * into v_shadow_event from whatsapp_shadow_events
    where source_system = 'legacy_verified_bot' and source_event_id = p_source_event_id;
    return jsonb_build_object('success', true, 'already_ingested', true, 'shadow_event_id', v_shadow_event.id);
  end if;

  if p_mirror_message and p_lead_id is not null then
    insert into whatsapp_conversations (tenant_id, lead_id, phone_binding_id, automation_mode)
    values (p_tenant_id, p_lead_id, p_phone_binding_id, 'paused')
    on conflict (tenant_id, lead_id) do update
      set phone_binding_id = coalesce(excluded.phone_binding_id, whatsapp_conversations.phone_binding_id)
    returning * into v_conversation;

    insert into whatsapp_messages (
      tenant_id, conversation_id, lead_id, direction, body, provider_message_id, status, source
    ) values (
      p_tenant_id, v_conversation.id, p_lead_id, coalesce(p_message_direction, 'inbound'),
      coalesce(p_message_body, ''), p_provider_message_id,
      case when coalesce(p_message_direction, 'inbound') = 'inbound' then 'delivered' else 'sent' end,
      'legacy_verified_bot'
    )
    on conflict (tenant_id, provider_message_id) where provider_message_id is not null do nothing
    returning * into v_message;

    if v_message is not null then
      update whatsapp_conversations
      set last_message_at = v_message.created_at,
          last_message_preview = left(coalesce(p_message_body, ''), 200),
          unread_count = case when v_message.direction = 'inbound' then unread_count + 1 else unread_count end,
          updated_at = now()
      where id = v_conversation.id;
      update crm_leads set last_interaction_at = v_message.created_at, updated_at = now() where id = p_lead_id;
    end if;
  end if;

  return jsonb_build_object(
    'success', true, 'already_ingested', false,
    'shadow_event_id', v_shadow_event.id,
    'message_id', v_message.id,
    'conversation_id', v_conversation.id
  );
end;
$$;

revoke all on function public.ingest_legacy_whatsapp_shadow_event(
  uuid, uuid, uuid, text, text, text, timestamptz, jsonb, boolean, text, text, text
) from public, anon, authenticated;
grant execute on function public.ingest_legacy_whatsapp_shadow_event(
  uuid, uuid, uuid, text, text, text, timestamptz, jsonb, boolean, text, text, text
) to service_role;
