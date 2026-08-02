-- BYOK / provider routing foundation. Additive only. No raw API key is
-- ever stored in these tables — encrypted_secret_ref is a reference into
-- packages/byok's vault abstraction, never the key itself.

create table if not exists tenant_provider_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_key text not null,
  billing_mode text not null default 'stratxcel_managed' check (billing_mode in ('customer_owned', 'stratxcel_managed', 'hybrid')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'valid', 'invalid', 'revoked')),
  encrypted_secret_ref text,
  capabilities jsonb not null default '{}'::jsonb,
  monthly_limit_cents integer,
  per_mission_limit_cents integer,
  fallback_policy jsonb not null default '{}'::jsonb,
  last_validated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tenant_provider_connections enable row level security;
create unique index if not exists tenant_provider_connections_tenant_provider_idx
  on tenant_provider_connections (tenant_id, provider_key)
  where revoked_at is null;
create policy tenant_provider_connections_tenant_read on tenant_provider_connections for select
  using (exists (select 1 from tenant_members m where m.tenant_id = tenant_provider_connections.tenant_id and m.user_id = (select auth.uid())));

create table if not exists provider_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider_key text not null,
  mission_id uuid references missions(id) on delete set null,
  capability text not null,
  units numeric not null default 0,
  cost_cents integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table provider_usage_events enable row level security;
create index if not exists provider_usage_events_tenant_idx on provider_usage_events (tenant_id, created_at desc);
create policy provider_usage_events_tenant_read on provider_usage_events for select
  using (exists (select 1 from tenant_members m where m.tenant_id = provider_usage_events.tenant_id and m.user_id = (select auth.uid())));

-- Development secret vault: AES-256-GCM ciphertext only, keyed by a
-- server-only encryption key (BYOK_VAULT_ENCRYPTION_KEY) that never
-- touches this database. This table is never read by anything except
-- packages/byok's vault adapter using the service-role client — no RLS
-- read policy exists for `authenticated`, deliberately, since a ciphertext
-- blob has no legitimate client-facing use. Swappable later for a real
-- cloud secret manager (AWS Secrets Manager, GCP Secret Manager, etc.)
-- behind the same SecretVault interface without changing what a
-- "ref" looks like to callers (an opaque string).
create table if not exists vault_secrets (
  id uuid primary key default gen_random_uuid(),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  created_at timestamptz not null default now()
);
alter table vault_secrets enable row level security;
-- No policies at all: RLS enabled with zero policies means even
-- `authenticated` gets nothing — only service_role (which bypasses RLS)
-- can touch this table.

grant select, insert, update, delete on tenant_provider_connections, provider_usage_events, vault_secrets to service_role;
grant select on tenant_provider_connections, provider_usage_events to authenticated;
