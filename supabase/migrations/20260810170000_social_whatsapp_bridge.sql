-- Channel provenance for Social Copilot sessions started from a verified
-- WhatsApp principal. Core session/action/content tables remain the source of
-- truth; this table is only the channel adapter mapping.
create table if not exists social_whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references social_agent_sessions(id) on delete cascade,
  auth_user_id uuid not null,
  tenant_id uuid references tenants(id) on delete cascade,
  principal_type text not null check (principal_type in ('staff','client')),
  normalized_phone text not null,
  phone_binding_id uuid not null references whatsapp_phone_bindings(id) on delete cascade,
  last_provider_message_id text not null unique,
  last_media_at timestamptz,
  language text not null default 'en' check (language in ('en','hi','hinglish')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table social_whatsapp_sessions enable row level security;
create index if not exists social_whatsapp_sessions_principal_idx on social_whatsapp_sessions(auth_user_id, tenant_id, updated_at desc);
grant select, insert, update, delete on social_whatsapp_sessions to service_role;

-- Provider messages are a permanent idempotency ledger. It also records the
-- deterministic 45-second grouping decision for media sent without captions.
create table if not exists social_whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  session_id uuid not null references social_agent_sessions(id) on delete cascade,
  attachment_id uuid references social_agent_attachments(id) on delete set null,
  auth_user_id uuid not null,
  tenant_id uuid references tenants(id) on delete cascade,
  message_kind text not null,
  grouped boolean not null default false,
  created_at timestamptz not null default now()
);
alter table social_whatsapp_inbound_messages enable row level security;
grant select, insert, update, delete on social_whatsapp_inbound_messages to service_role;

-- Atomic cross-channel claim: exactly one web/WhatsApp approval caller can
-- move a proposed action into execution. Concurrent double taps return false.
create or replace function claim_social_agent_action(p_action_id uuid, p_owner_id uuid, p_target_status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  if p_target_status not in ('EXECUTING','REJECTED') then raise exception 'invalid target status'; end if;
  if current_user <> 'service_role' and auth.uid() is distinct from p_owner_id then return false; end if;
  update social_agent_actions a set status = p_target_status, updated_at = now()
  from social_agent_sessions s
  where a.id = p_action_id and a.session_id = s.id and s.owner_id = p_owner_id and a.status = 'PROPOSED';
  get diagnostics affected = row_count;
  return affected = 1;
end $$;
revoke all on function claim_social_agent_action(uuid,uuid,text) from public;
grant execute on function claim_social_agent_action(uuid,uuid,text) to authenticated, service_role;
