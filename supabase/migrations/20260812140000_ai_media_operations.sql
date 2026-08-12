-- Durable AI media operations (video/image async). Additive only.
-- DO NOT apply to production as part of this PR without review.

create table if not exists ai_media_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  provider text not null,
  model text not null,
  provider_operation_id text not null,
  media_type text not null check (media_type in ('image', 'video')),
  status text not null check (status in ('submitted', 'polling', 'completed', 'failed')),
  duration_seconds numeric,
  resolution text,
  estimated_cost_usd numeric(12, 6) not null default 0,
  artifact_storage_path text,
  safe_error text,
  poll_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ai_media_operations enable row level security;

create index if not exists ai_media_operations_tenant_idx
  on ai_media_operations (tenant_id, created_at desc);

create unique index if not exists ai_media_operations_provider_op_uidx
  on ai_media_operations (provider, provider_operation_id);

create policy ai_media_operations_tenant_read on ai_media_operations for select
  using (
    exists (
      select 1 from tenant_members m
      where m.tenant_id = ai_media_operations.tenant_id
        and m.user_id = (select auth.uid())
    )
  );

revoke all on ai_media_operations from public, anon;
grant select on ai_media_operations to authenticated;
grant select, insert, update, delete on ai_media_operations to service_role;
