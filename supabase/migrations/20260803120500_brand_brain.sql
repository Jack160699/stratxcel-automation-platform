-- Versioned Brand Brain: every edit creates a new row rather than mutating
-- the previous one, so mission execution can pin "the Brand Brain as of
-- version N" even if the customer edits it mid-mission. current_version on
-- brand_brains is the only mutable pointer.
create table if not exists brand_brains (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  current_version integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table brand_brains enable row level security;

create table if not exists brand_brain_versions (
  tenant_id uuid not null references tenants(id) on delete cascade,
  version integer not null,
  content jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (tenant_id, version)
);
alter table brand_brain_versions enable row level security;
create index if not exists brand_brain_versions_tenant_idx on brand_brain_versions (tenant_id, version desc);

create policy brand_brains_tenant_read on brand_brains for select
  using (exists (select 1 from tenant_members m where m.tenant_id = brand_brains.tenant_id and m.user_id = (select auth.uid())));
create policy brand_brain_versions_tenant_read on brand_brain_versions for select
  using (exists (select 1 from tenant_members m where m.tenant_id = brand_brain_versions.tenant_id and m.user_id = (select auth.uid())));

grant select, insert, update, delete on brand_brains, brand_brain_versions to service_role;
grant select on brand_brains, brand_brain_versions to authenticated;
