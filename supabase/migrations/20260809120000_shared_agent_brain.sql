-- Shared Stratxcel Brain V1: optional staff access metadata and explicit,
-- scoped durable memories. Both tables are server-only; authorization is
-- resolved in Agent Core from a verified principal, never by the model.

create table if not exists public.platform_staff_agent_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  department text check (department in ('management','sales_crm','marketing_social','operations','customer_support','finance','content','other')),
  access_profile text not null default 'role_default' check (access_profile in ('role_default','full_owner','administrator','sales_crm','marketing_social','operations','finance','audit_read_only','custom')),
  permission_grants text[] not null default '{}',
  permission_denials text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_staff_agent_access is
  'Optional channel-independent Agent access metadata. Platform role remains the hard permission ceiling; department grants nothing.';

alter table public.platform_staff_agent_access enable row level security;
revoke all on public.platform_staff_agent_access from public, anon, authenticated;
grant select, insert, update, delete on public.platform_staff_agent_access to service_role;

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('personal','workspace','agency')),
  owner_auth_user_id uuid references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  memory_key text not null check (char_length(memory_key) between 1 and 120),
  memory_value text not null check (char_length(memory_value) between 1 and 1200),
  source_channel text not null check (source_channel in ('admin_web','client_web','whatsapp')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    (scope = 'personal' and owner_auth_user_id is not null)
    or (scope = 'workspace' and tenant_id is not null)
    or (scope = 'agency' and tenant_id is null)
  )
);

create unique index if not exists agent_memories_active_scope_key_uidx
  on public.agent_memories (scope, coalesce(owner_auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), memory_key)
  where deleted_at is null;
create index if not exists agent_memories_owner_idx on public.agent_memories (owner_auth_user_id, updated_at desc) where deleted_at is null;
create index if not exists agent_memories_tenant_idx on public.agent_memories (tenant_id, updated_at desc) where deleted_at is null;

comment on table public.agent_memories is
  'Explicit, provenance-bearing Brain memories. No passive extraction and no chain-of-thought storage.';

alter table public.agent_memories enable row level security;
revoke all on public.agent_memories from public, anon, authenticated;
grant select, insert, update, delete on public.agent_memories to service_role;
