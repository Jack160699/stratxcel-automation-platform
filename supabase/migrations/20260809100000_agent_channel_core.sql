-- Additive migration: WhatsApp Agent Channel core schema (backend foundation only).
--
-- NOT APPLIED to any Supabase project by this branch. Created locally as part of
-- feat/whatsapp-agent-core-backend. Adds:
--   1. whatsapp_channel_principals   — verified staff/client identity bound to a phone
--   2. whatsapp_channel_pairing_codes — one-time, short-lived, hashed pairing codes
--   3. agent_sessions / agent_messages / agent_runs / agent_run_events — channel-independent
--      agent session/telemetry storage (additive, does not touch the existing
--      lib/social/agent session tables, which remain Social-Autopilot/OwnerContext-specific)
--   4. agent_action_confirmations    — single-use, principal+action+input-bound mutation confirmations
--
-- Every table here is service-role-only (RLS enabled, no authenticated/anon grants).
-- All client-facing access must go through authenticated server routes that resolve
-- the caller's own identity server-side — never direct table access from the browser.
-- This mirrors public.platform_admin_events / public.platform_staff_users in
-- 20260806006500_platform_staff_and_audit_completion_hardening.sql.

-- =========================================================================
-- 1. whatsapp_channel_principals
-- =========================================================================

create table if not exists public.whatsapp_channel_principals (
  id uuid primary key default gen_random_uuid(),
  normalized_phone text not null,
  principal_type text not null check (principal_type in ('staff', 'client')),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  verified_at timestamptz not null default now(),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  -- Client principals must always be tenant-scoped; staff may be null (platform staff
  -- are not scoped to one tenant today — see platform_staff_users).
  constraint whatsapp_channel_principals_client_requires_tenant
    check (principal_type <> 'client' or tenant_id is not null)
);

comment on table public.whatsapp_channel_principals is
  'Verified binding of a WhatsApp phone number to a Stratxcel staff or client identity. '
  'One row per (auth_user_id, tenant_id, principal_type) history entry; only one row per '
  'normalized_phone may be status=active at a time (see unique index below), so active '
  'phone ownership can never be ambiguous.';

-- At most one ACTIVE principal per phone number, across staff and client alike.
create unique index if not exists whatsapp_channel_principals_active_phone_uidx
  on public.whatsapp_channel_principals (normalized_phone)
  where status = 'active';

create index if not exists whatsapp_channel_principals_auth_user_idx
  on public.whatsapp_channel_principals (auth_user_id);

create index if not exists whatsapp_channel_principals_tenant_idx
  on public.whatsapp_channel_principals (tenant_id)
  where tenant_id is not null;

alter table public.whatsapp_channel_principals enable row level security;
revoke all on public.whatsapp_channel_principals from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_channel_principals to service_role;

-- =========================================================================
-- 2. whatsapp_channel_pairing_codes
-- =========================================================================

create table if not exists public.whatsapp_channel_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  -- Server-generated, cryptographically random code. Plaintext is returned exactly
  -- once to the authenticated caller that requested it (over HTTPS) and is NEVER
  -- persisted or logged — only its hash is stored.
  code_hash text not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  principal_type text not null check (principal_type in ('staff', 'client')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint whatsapp_channel_pairing_codes_client_requires_tenant
    check (principal_type <> 'client' or tenant_id is not null)
);

comment on table public.whatsapp_channel_pairing_codes is
  'One-time, short-lived (~10 minute) pairing challenges. code_hash = sha256(code); '
  'plaintext code is never stored or audited. A code is consumed transactionally by '
  'consumePairingChallenge() (packages/agent-core) via a single conditional UPDATE.';

create index if not exists whatsapp_channel_pairing_codes_code_hash_idx
  on public.whatsapp_channel_pairing_codes (code_hash);

create index if not exists whatsapp_channel_pairing_codes_active_idx
  on public.whatsapp_channel_pairing_codes (auth_user_id)
  where used_at is null;

alter table public.whatsapp_channel_pairing_codes enable row level security;
revoke all on public.whatsapp_channel_pairing_codes from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_channel_pairing_codes to service_role;

-- =========================================================================
-- 3. Channel-independent agent session / run telemetry
-- =========================================================================
-- Additive general tables. Deliberately separate from the existing Social
-- Autopilot agent session tables (which are OwnerContext/single-tenant specific
-- and out of scope to repurpose — see docs/architecture/WHATSAPP_AGENT_CHANNEL.md).
-- No model chain-of-thought is ever stored here — only operational telemetry
-- (user text, final assistant text, and tool invocation metadata).

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  principal_kind text not null check (principal_kind in ('staff', 'client')),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  channel text not null check (channel in ('admin_web', 'client_web', 'whatsapp')),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint agent_sessions_client_requires_tenant
    check (principal_kind <> 'client' or tenant_id is not null)
);

create index if not exists agent_sessions_auth_user_idx on public.agent_sessions (auth_user_id);
create index if not exists agent_sessions_tenant_idx on public.agent_sessions (tenant_id) where tenant_id is not null;

alter table public.agent_sessions enable row level security;
revoke all on public.agent_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.agent_sessions to service_role;

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tool_name text,
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_session_idx on public.agent_messages (session_id, created_at);

alter table public.agent_messages enable row level security;
revoke all on public.agent_messages from public, anon, authenticated;
grant select, insert, update, delete on public.agent_messages to service_role;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  channel text not null check (channel in ('admin_web', 'client_web', 'whatsapp')),
  -- Meta providerMessageId, for WhatsApp-originated runs only. NULL for web channels.
  provider_message_id text,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'blocked')),
  tool_calls_count integer not null default 0,
  error_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on column public.agent_runs.provider_message_id is
  'Meta WhatsApp providerMessageId. At most one agent run may exist per providerMessageId '
  '(see unique index below) — a redelivered webhook event can never execute a tool twice, '
  'create two confirmations, or produce two logical agent results.';

-- Idempotency: same providerMessageId -> at most one agent run.
create unique index if not exists agent_runs_provider_message_id_uidx
  on public.agent_runs (provider_message_id)
  where provider_message_id is not null;

create index if not exists agent_runs_session_idx on public.agent_runs (session_id, created_at);

alter table public.agent_runs enable row level security;
revoke all on public.agent_runs from public, anon, authenticated;
grant select, insert, update, delete on public.agent_runs to service_role;

create table if not exists public.agent_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  -- e.g. tool_invoked | tool_result | confirmation_proposed | confirmation_executed |
  --      confirmation_cancelled | failed
  event_type text not null,
  tool_name text,
  -- read | low_mutation | external_mutation | high_risk
  risk text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_run_events_run_idx on public.agent_run_events (run_id, created_at);

alter table public.agent_run_events enable row level security;
revoke all on public.agent_run_events from public, anon, authenticated;
grant select, insert, update, delete on public.agent_run_events to service_role;

-- =========================================================================
-- 4. agent_action_confirmations
-- =========================================================================
-- General confirmation/challenge table for WhatsApp mutating actions. Deliberately
-- NOT a generic "YES approves whatever is pending" table: every row is bound to an
-- exact principal, an exact action_name, and an exact normalized_input snapshot, and
-- is single-use. CONFIRM <code> (see command-parser.ts) must match the stored
-- confirmation_hash exactly and re-executes only the stored action/input — the model
-- never re-interprets what is being confirmed.

create table if not exists public.agent_action_confirmations (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('admin_web', 'client_web', 'whatsapp')),
  action_name text not null,
  normalized_input jsonb not null default '{}'::jsonb,
  -- sha256(display code shown to the user, e.g. "4821"). Plaintext is not persisted.
  confirmation_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists agent_action_confirmations_auth_user_idx
  on public.agent_action_confirmations (auth_user_id)
  where used_at is null and cancelled_at is null;

create index if not exists agent_action_confirmations_hash_idx
  on public.agent_action_confirmations (confirmation_hash);

alter table public.agent_action_confirmations enable row level security;
revoke all on public.agent_action_confirmations from public, anon, authenticated;
grant select, insert, update, delete on public.agent_action_confirmations to service_role;
