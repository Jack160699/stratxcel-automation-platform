-- Additive migration: outbound message audit/correlation for the WhatsApp
-- Agent channel. NOT APPLIED to any Supabase project by this branch — see
-- 20260809100000_agent_channel_core.sql, which this migration follows as a
-- separate additive file rather than editing that one in place, to avoid
-- disturbing its own already-reviewed shape/tests.
--
-- Closes the outbound-delivery gap: a linked staff/client WhatsApp
-- principal is never a crm_leads row (see docs/architecture/
-- WHATSAPP_AGENT_CHANNEL.md), and whatsapp_messages.lead_id is a NOT NULL
-- FK to crm_leads — so an Agent reply cannot be recorded there without
-- fabricating a lead, which this product explicitly refuses to do. This
-- table mirrors whatsapp_messages' idempotency/status-tracking shape
-- (same status vocabulary and no-regression semantics) for principal
-- replies instead, keeping CRM meaning uncorrupted.
--
-- Every table here is service-role-only (RLS enabled, no authenticated/anon
-- grants) — mirrors 20260809100000_agent_channel_core.sql's own pattern.

create table if not exists public.agent_channel_messages (
  id uuid primary key default gen_random_uuid(),
  -- References auth.users, not whatsapp_channel_principals — AgentPrincipal
  -- (packages/agent-core/src/principal.ts) only ever carries authUserId, not
  -- a whatsapp_channel_principals row id (a phone's link row is replaced,
  -- not reused, on every re-pairing — see activateWhatsAppPrincipal), so
  -- authUserId is the stable identity anchor. Matches agent_sessions' own
  -- auth_user_id column for the same reason. Nullable: a pre-link
  -- deterministic reply (e.g. a LINK-ack, or a malformed-command nudge to a
  -- still-unlinked sender) has no resolved identity yet.
  auth_user_id uuid references auth.users(id) on delete set null,
  normalized_phone text not null,
  phone_binding_id uuid references public.whatsapp_phone_bindings(id) on delete set null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  body text not null,
  provider_message_id text,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued', 'submitted', 'sent', 'delivered', 'read', 'failed')),
  status_updated_at timestamptz not null default now(),
  error jsonb,
  created_at timestamptz not null default now()
);

comment on table public.agent_channel_messages is
  'Outbound WhatsApp Agent replies to a linked staff/client channel principal '
  '(or a pre-link deterministic ack) — the channel-principal counterpart to '
  'whatsapp_messages, kept as a separate additive table rather than relaxing '
  'whatsapp_messages.lead_id NOT NULL or fabricating a crm_leads row.';

-- Idempotency: same key (format whatsapp_agent_reply:<providerMessageId>:<n>)
-- can only ever produce one row — mirrors whatsapp_messages_tenant_idempotency_idx.
create unique index if not exists agent_channel_messages_idempotency_uidx
  on public.agent_channel_messages (idempotency_key);

-- Delivery/read status correlation: mirrors
-- whatsapp_messages_tenant_provider_id_idx's pattern, global (not
-- tenant-scoped) since a staff principal has no tenant.
create unique index if not exists agent_channel_messages_provider_id_uidx
  on public.agent_channel_messages (provider_message_id)
  where provider_message_id is not null;

create index if not exists agent_channel_messages_auth_user_idx
  on public.agent_channel_messages (auth_user_id, created_at desc)
  where auth_user_id is not null;

create index if not exists agent_channel_messages_phone_idx
  on public.agent_channel_messages (normalized_phone, created_at desc);

alter table public.agent_channel_messages enable row level security;
revoke all on public.agent_channel_messages from public, anon, authenticated;
grant select, insert, update, delete on public.agent_channel_messages to service_role;
