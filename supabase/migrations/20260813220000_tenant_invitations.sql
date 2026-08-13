-- Additive tenant invitations. Service role writes; members can read their tenant's invites.

create table if not exists public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'operator', 'viewer')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tenant_invitations_tenant_idx on public.tenant_invitations (tenant_id, created_at desc);

alter table public.tenant_invitations enable row level security;

revoke all on table public.tenant_invitations from public, anon, authenticated;

grant select, insert, update on table public.tenant_invitations to service_role;
