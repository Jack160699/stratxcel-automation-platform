-- Migration: WhatsApp + CRM completion — consent, templates, real conversations/
-- messages (distinct from the existing shadow-only log), follow-ups,
-- appointments, CRM contact enrichment, and human-handoff priority.
-- Additive only. Does not touch queue_jobs, missions, or any payment table.

-- ============================================================
-- 1. CRM_LEADS — additive enrichment columns + phone-dedupe index
-- ============================================================

alter table crm_leads
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists last_interaction_at timestamptz,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists notes text,
  -- Maintained by application code (normalizePhoneNumber) at write time —
  -- not a generated column, since normalization rules (country-code
  -- defaulting) are a product decision better expressed in TS than in SQL.
  add column if not exists normalized_phone text;

-- One contact per tenant+normalized phone — the actual dedupe guarantee.
-- Historical rows with no normalized_phone (pre-migration) are simply
-- excluded from this constraint rather than backfilled/guessed.
create unique index if not exists crm_leads_tenant_normalized_phone_idx
  on crm_leads (tenant_id, normalized_phone)
  where normalized_phone is not null;

create index if not exists crm_leads_tenant_follow_up_idx
  on crm_leads (tenant_id, next_follow_up_at) where next_follow_up_at is not null;

-- ============================================================
-- 2. CONTACT_CONSENT — truthful, per-channel opt-in/opt-out state
-- ============================================================

create table if not exists contact_consent (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  opted_in boolean not null default false,
  source text,
  captured_at timestamptz,
  evidence text,
  opted_out_at timestamptz,
  opt_out_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table contact_consent enable row level security;
create unique index if not exists contact_consent_lead_channel_idx on contact_consent (tenant_id, lead_id, channel);
create index if not exists contact_consent_tenant_idx on contact_consent (tenant_id);
create policy contact_consent_tenant_read on contact_consent for select
  using (exists (select 1 from tenant_members m where m.tenant_id = contact_consent.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on contact_consent to service_role;
grant select on contact_consent to authenticated;

-- ============================================================
-- 3. WHATSAPP_TEMPLATES — real Meta template sync state, never fabricated
-- ============================================================

create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  phone_binding_id uuid references whatsapp_phone_bindings(id) on delete cascade,
  name text not null,
  language text not null default 'en',
  category text,
  provider_template_id text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'DISABLED', 'PAUSED')),
  components jsonb not null default '[]'::jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table whatsapp_templates enable row level security;
create unique index if not exists whatsapp_templates_tenant_name_lang_idx on whatsapp_templates (tenant_id, name, language);
create policy whatsapp_templates_tenant_read on whatsapp_templates for select
  using (exists (select 1 from tenant_members m where m.tenant_id = whatsapp_templates.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on whatsapp_templates to service_role;
grant select on whatsapp_templates to authenticated;

-- ============================================================
-- 4. WHATSAPP_CONVERSATIONS + WHATSAPP_MESSAGES — real persisted state,
-- distinct from whatsapp_shadow_messages (which only ever records proposed,
-- never-sent responses). This is the actual inbox backing store.
-- ============================================================

create table if not exists whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  phone_binding_id uuid references whatsapp_phone_bindings(id) on delete set null,
  -- 'automated' here means "the shadow-safe conversation pipeline may
  -- propose/act" — real outbound sends still require WHATSAPP_INTEGRATION_
  -- MODE=live, consent, and every other gate in packages/whatsapp; this
  -- column exists to let a human take explicit ownership (human_only/
  -- paused) or mark an active handoff, not to gate real sending by itself.
  automation_mode text not null default 'automated' check (automation_mode in ('automated', 'human_only', 'paused', 'handoff')),
  assigned_staff uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table whatsapp_conversations enable row level security;
create unique index if not exists whatsapp_conversations_tenant_lead_idx on whatsapp_conversations (tenant_id, lead_id);
create index if not exists whatsapp_conversations_tenant_activity_idx on whatsapp_conversations (tenant_id, last_message_at desc);
create policy whatsapp_conversations_tenant_read on whatsapp_conversations for select
  using (exists (select 1 from tenant_members m where m.tenant_id = whatsapp_conversations.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on whatsapp_conversations to service_role;
grant select on whatsapp_conversations to authenticated;

create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null default '',
  media_ref text,
  template_id uuid references whatsapp_templates(id) on delete set null,
  provider_message_id text,
  idempotency_key text,
  status text not null default 'queued' check (status in ('queued', 'submitted', 'sent', 'delivered', 'read', 'failed')),
  status_updated_at timestamptz not null default now(),
  error jsonb,
  created_at timestamptz not null default now()
);
alter table whatsapp_messages enable row level security;
-- Idempotent inbound processing: the same Meta message ID can never be recorded twice for a tenant.
create unique index if not exists whatsapp_messages_tenant_provider_id_idx
  on whatsapp_messages (tenant_id, provider_message_id) where provider_message_id is not null;
-- Idempotent outbound sends: a caller-supplied idempotency key can never double-send.
create unique index if not exists whatsapp_messages_tenant_idempotency_idx
  on whatsapp_messages (tenant_id, idempotency_key) where idempotency_key is not null;
create index if not exists whatsapp_messages_conversation_idx on whatsapp_messages (conversation_id, created_at desc);
create policy whatsapp_messages_tenant_read on whatsapp_messages for select
  using (exists (select 1 from tenant_members m where m.tenant_id = whatsapp_messages.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on whatsapp_messages to service_role;
grant select on whatsapp_messages to authenticated;

-- ============================================================
-- 5. CRM_FOLLOW_UPS — persisted, bounded-retry follow-up scheduling
-- ============================================================

create table if not exists crm_follow_ups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  conversation_id uuid references whatsapp_conversations(id) on delete set null,
  next_action text not null,
  due_at timestamptz not null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'cancelled', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table crm_follow_ups enable row level security;
create index if not exists crm_follow_ups_tenant_due_idx on crm_follow_ups (tenant_id, due_at) where status = 'pending';
create policy crm_follow_ups_tenant_read on crm_follow_ups for select
  using (exists (select 1 from tenant_members m where m.tenant_id = crm_follow_ups.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on crm_follow_ups to service_role;
grant select on crm_follow_ups to authenticated;

-- ============================================================
-- 6. CRM_APPOINTMENTS — persisted booking state, no external calendar sync
-- (none exists in this repository — see docs; this is Stratxcel-internal
-- scheduling state only, never a fabricated "added to your calendar").
-- ============================================================

create table if not exists crm_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz,
  confirmed_at timestamptz,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show')),
  notes text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table crm_appointments enable row level security;
create index if not exists crm_appointments_tenant_idx on crm_appointments (tenant_id, scheduled_for);
create policy crm_appointments_tenant_read on crm_appointments for select
  using (exists (select 1 from tenant_members m where m.tenant_id = crm_appointments.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on crm_appointments to service_role;
grant select on crm_appointments to authenticated;

-- ============================================================
-- 7. HUMAN_HANDOFFS — additive priority column
-- ============================================================

alter table human_handoffs
  add column if not exists priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent'));

-- ============================================================
-- 8. ATOMIC MESSAGE RECORDING — idempotent insert + conversation touch +
-- lead last-interaction touch, in one transaction. Tenant-validated.
-- ============================================================

create or replace function public.record_whatsapp_message(
  p_tenant_id uuid,
  p_lead_id uuid,
  p_phone_binding_id uuid,
  p_direction text, -- 'inbound' | 'outbound'
  p_body text,
  p_provider_message_id text default null,
  p_idempotency_key text default null,
  p_media_ref text default null,
  p_template_id uuid default null,
  p_status text default 'queued'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead record;
  v_conversation record;
  v_message record;
begin
  select * into v_lead from crm_leads where id = p_lead_id for update;
  if not found or v_lead.tenant_id <> p_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'lead_not_found_or_tenant_mismatch');
  end if;

  if p_direction not in ('inbound', 'outbound') then
    return jsonb_build_object('success', false, 'reason', 'invalid_direction');
  end if;

  -- Idempotent short-circuit: a message with this provider_message_id or
  -- idempotency_key already exists for this tenant — return it unchanged
  -- rather than inserting a duplicate.
  if p_provider_message_id is not null then
    select * into v_message from whatsapp_messages where tenant_id = p_tenant_id and provider_message_id = p_provider_message_id;
    if found then
      return jsonb_build_object('success', true, 'already_recorded', true, 'message_id', v_message.id, 'conversation_id', v_message.conversation_id);
    end if;
  end if;
  if p_idempotency_key is not null then
    select * into v_message from whatsapp_messages where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('success', true, 'already_recorded', true, 'message_id', v_message.id, 'conversation_id', v_message.conversation_id);
    end if;
  end if;

  insert into whatsapp_conversations (tenant_id, lead_id, phone_binding_id)
  values (p_tenant_id, p_lead_id, p_phone_binding_id)
  on conflict (tenant_id, lead_id) do update set phone_binding_id = coalesce(excluded.phone_binding_id, whatsapp_conversations.phone_binding_id)
  returning * into v_conversation;

  insert into whatsapp_messages (
    tenant_id, conversation_id, lead_id, direction, body, media_ref, template_id,
    provider_message_id, idempotency_key, status
  ) values (
    p_tenant_id, v_conversation.id, p_lead_id, p_direction, coalesce(p_body, ''), p_media_ref, p_template_id,
    p_provider_message_id, p_idempotency_key, coalesce(p_status, 'queued')
  )
  returning * into v_message;

  update whatsapp_conversations
  set last_message_at = v_message.created_at,
      last_message_preview = left(coalesce(p_body, ''), 200),
      unread_count = case when p_direction = 'inbound' then unread_count + 1 else unread_count end,
      updated_at = now()
  where id = v_conversation.id;

  update crm_leads set last_interaction_at = v_message.created_at, updated_at = now() where id = p_lead_id;

  return jsonb_build_object('success', true, 'already_recorded', false, 'message_id', v_message.id, 'conversation_id', v_conversation.id);
end;
$$;

revoke all on function public.record_whatsapp_message(uuid, uuid, uuid, text, text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_message(uuid, uuid, uuid, text, text, text, text, text, uuid, text) to service_role;

-- ============================================================
-- 9. MESSAGE STATUS UPDATE — idempotent, tenant-scoped, never regresses a
-- terminal state (delivered/read/failed) back to an earlier one out of order.
-- ============================================================

create or replace function public.update_whatsapp_message_status(
  p_tenant_id uuid,
  p_provider_message_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message record;
  v_rank_current int;
  v_rank_new int;
  v_ranks jsonb := '{"queued":0,"submitted":1,"sent":2,"delivered":3,"read":4,"failed":5}'::jsonb;
begin
  if p_status not in ('queued','submitted','sent','delivered','read','failed') then
    return jsonb_build_object('success', false, 'reason', 'invalid_status');
  end if;

  select * into v_message from whatsapp_messages where tenant_id = p_tenant_id and provider_message_id = p_provider_message_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'message_not_found');
  end if;

  v_rank_current := (v_ranks ->> v_message.status)::int;
  v_rank_new := (v_ranks ->> p_status)::int;

  -- Out-of-order status webhooks (Meta doesn't guarantee delivery order) are
  -- tolerated by simply not regressing — 'delivered' arriving after 'read'
  -- is a no-op, not an error.
  if v_rank_new <= v_rank_current and v_message.status <> 'failed' then
    return jsonb_build_object('success', true, 'updated', false, 'status', v_message.status);
  end if;

  update whatsapp_messages set status = p_status, status_updated_at = now() where id = v_message.id;

  return jsonb_build_object('success', true, 'updated', true, 'status', p_status);
end;
$$;

revoke all on function public.update_whatsapp_message_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_whatsapp_message_status(uuid, text, text) to service_role;
