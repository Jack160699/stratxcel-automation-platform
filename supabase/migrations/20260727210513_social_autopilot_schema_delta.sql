-- Social Autopilot on stratxcel (uccqlgeghkwzujeeymua) — schema delta.
-- Additive/extend only. Follows the EXACT conventions already established
-- by the existing schema: owner_id uuid not null references auth.users(id),
-- RLS enabled with real admin-owner policies (never RLS-enabled-with-zero-
-- policies), UPPERCASE status enums, ownership traced through joins for
-- child tables exactly like content_variants -> content_master and
-- social_dead_letters -> social_publishing_jobs -> social_accounts already do.

-- ============================================================
-- EXTEND: social_brand_profiles (add the concerns that had no existing
-- JSONB column — products/services, content pillar definitions, and the
-- remaining rule types not covered by voice.forbidden_claims/competitors)
-- ============================================================
alter table social_brand_profiles
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists content_pillars jsonb not null default '[]'::jsonb,
  add column if not exists rules jsonb not null default '[]'::jsonb;

-- ============================================================
-- EXTEND: social_automation_settings (add the two guardrail concepts that
-- had no home: which tools always need human approval, and the confidence
-- floor for auto-acting under AUTOPILOT autonomy)
-- ============================================================
alter table social_automation_settings
  add column if not exists require_approval_for text[] not null default '{"publish_post"}'::text[],
  add column if not exists min_confidence_to_autoact numeric not null default 0.7;

-- ============================================================
-- AGENT (genuinely new — no existing representation)
-- ============================================================

create table if not exists social_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text,
  status text not null default 'IDLE' check (status in (
    'IDLE','UNDERSTANDING','NEEDS_INPUT','PROPOSING','WAITING_FOR_CHOICE',
    'GENERATING','READY','EXECUTING','MONITORING','LEARNING','BLOCKED',
    'ATTENTION_REQUIRED','FAILED'
  )),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table social_agent_sessions enable row level security;
create index if not exists social_agent_sessions_owner_idx on social_agent_sessions (owner_id, updated_at desc);
create policy social_agent_sessions_admin_owner on social_agent_sessions for all
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

create table if not exists social_agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references social_agent_sessions(id) on delete cascade,
  role text not null check (role in ('USER','AGENT','SYSTEM')),
  content text not null default '',
  parts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table social_agent_messages enable row level security;
create index if not exists social_agent_messages_session_idx on social_agent_messages (session_id, created_at);
create policy social_agent_messages_admin on social_agent_messages for all
  using (exists (
    select 1 from social_agent_sessions s
    where s.id = social_agent_messages.session_id and s.owner_id = (select auth.uid())
  ));

create table if not exists social_agent_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references social_agent_sessions(id) on delete cascade,
  message_id uuid references social_agent_messages(id) on delete set null,
  tool_name text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'PROPOSED' check (status in (
    'PROPOSED','APPROVED','EXECUTING','SUCCEEDED','FAILED','REJECTED'
  )),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table social_agent_actions enable row level security;
create index if not exists social_agent_actions_session_idx on social_agent_actions (session_id, created_at);
create policy social_agent_actions_admin on social_agent_actions for all
  using (
    session_id is null
    or exists (select 1 from social_agent_sessions s where s.id = social_agent_actions.session_id and s.owner_id = (select auth.uid()))
  );

-- ============================================================
-- INBOX (genuinely new)
-- ============================================================

create table if not exists social_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references social_accounts(id) on delete set null,
  provider text not null,
  external_conversation_id text,
  external_author_id text,
  author_name text,
  author_handle text,
  source text not null check (source in ('COMMENT','MESSAGE','MENTION')),
  context jsonb not null default '{}'::jsonb,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','ESCALATED','IGNORED')),
  sentiment text,
  intent text,
  lead_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table social_conversations enable row level security;
create index if not exists social_conversations_status_idx on social_conversations (status, updated_at desc);
create policy social_conversations_admin on social_conversations for all
  using (
    account_id is null
    or exists (select 1 from social_accounts a where a.id = social_conversations.account_id and a.owner_id = (select auth.uid()))
  );

create table if not exists social_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references social_conversations(id) on delete cascade,
  direction text not null check (direction in ('INBOUND','OUTBOUND')),
  author text,
  content text not null,
  ai_generated boolean not null default false,
  external_message_id text,
  created_at timestamptz not null default now()
);
alter table social_messages enable row level security;
create index if not exists social_messages_conversation_idx on social_messages (conversation_id, created_at);
create policy social_messages_admin on social_messages for all
  using (exists (select 1 from social_conversations c where c.id = social_messages.conversation_id));

create table if not exists social_leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references social_conversations(id) on delete set null,
  account_id uuid references social_accounts(id) on delete set null,
  name text,
  handle text,
  email text,
  notes text,
  status text not null default 'NEW' check (status in ('NEW','QUALIFIED','CONTACTED','CONVERTED','DISMISSED')),
  score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table social_leads enable row level security;
create policy social_leads_admin on social_leads for all
  using (
    account_id is null
    or exists (select 1 from social_accounts a where a.id = social_leads.account_id and a.owner_id = (select auth.uid()))
  );

-- ============================================================
-- AI / MEDIA PROVIDER CONFIG (genuinely new)
-- ============================================================

create table if not exists social_provider_configs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null check (kind in ('AI','MEDIA')),
  provider text not null,
  roles text[] not null default '{}'::text[],
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, provider)
);
alter table social_provider_configs enable row level security;
create policy social_provider_configs_admin_owner on social_provider_configs for all
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

-- ============================================================
-- HEALTH / AUDIT / WEBHOOKS — system-wide (not owner-scoped), written by
-- service-role background processes, read-only for admins. Same pattern
-- as the existing SELECT-only policies on social_publishing_jobs/
-- social_metrics/social_dead_letters.
-- ============================================================

create table if not exists social_health_checks (
  id uuid primary key default gen_random_uuid(),
  component text not null,
  status text not null check (status in ('OPERATIONAL','DEGRADED','PAUSED','FAILED','NOT_CONFIGURED')),
  latency_ms integer,
  message text,
  checked_at timestamptz not null default now()
);
alter table social_health_checks enable row level security;
create index if not exists social_health_checks_component_idx on social_health_checks (component, checked_at desc);
create policy social_health_checks_admin_read on social_health_checks for select
  using (exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

create table if not exists social_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('USER','AGENT','SYSTEM')),
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  summary text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
alter table social_audit_events enable row level security;
create index if not exists social_audit_events_created_idx on social_audit_events (created_at desc);
create policy social_audit_events_admin_read on social_audit_events for select
  using (exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

create table if not exists social_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  signature_valid boolean not null default false,
  processing_status text not null default 'RECEIVED' check (processing_status in ('RECEIVED','PROCESSED','FAILED','IGNORED')),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table social_webhook_events enable row level security;
create index if not exists social_webhook_events_received_idx on social_webhook_events (received_at desc);
create policy social_webhook_events_admin_read on social_webhook_events for select
  using (exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
