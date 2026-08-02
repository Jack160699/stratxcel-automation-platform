-- Phase 2 platform foundation: multi-tenant auth/RBAC/audit.
-- Additive only. Does not touch social_* tables or stratxcel_admins (the
-- existing single-workspace admin gate keeps working unchanged — tenants
-- are a new, parallel concept that server code adopts incrementally).

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tenants enable row level security;

-- Roles are intentionally a closed set (not a free-text column) so RBAC
-- checks in lib/rbac can exhaustively switch over them.
create table if not exists tenant_members (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
alter table tenant_members enable row level security;
create index if not exists tenant_members_user_idx on tenant_members (user_id);

-- A member can read their own membership rows (needed to resolve "which
-- tenants am I in and with what role" from the client); writes are
-- service-role only (invitations go through a server action, never direct
-- client writes) so there is no with-check clause for insert/update here.
create policy tenant_members_self_read on tenant_members for select
  using (user_id = (select auth.uid()));

create policy tenants_member_read on tenants for select
  using (exists (select 1 from tenant_members m where m.tenant_id = tenants.id and m.user_id = (select auth.uid())));

-- Append-only audit log. No update/delete policy is defined for any role
-- other than service_role's implicit RLS bypass — the table is designed to
-- be write-once from server code and read-back for the audit UI.
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'system', 'hermes', 'integration')),
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table audit_events enable row level security;
create index if not exists audit_events_tenant_idx on audit_events (tenant_id, created_at desc);
create policy audit_events_tenant_read on audit_events for select
  using (exists (select 1 from tenant_members m where m.tenant_id = audit_events.tenant_id and m.user_id = (select auth.uid())));

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
grant select, insert, update, delete on tenants, tenant_members, audit_events to service_role;
grant select on tenants, tenant_members, audit_events to authenticated;
