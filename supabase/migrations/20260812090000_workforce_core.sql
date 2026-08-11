-- WorkforceCore durable planning/review state (additive, tenant-scoped).
create table if not exists workforce_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  version integer not null default 1,
  previous_plan_id uuid references workforce_plans(id),
  objective text not null,
  business_outcome text not null,
  planning_horizon text not null default '30_day',
  entitlement_snapshot jsonb not null default '{}'::jsonb,
  capability_snapshot jsonb not null default '[]'::jsonb,
  strategy_payload jsonb not null default '{}'::jsonb,
  budget_envelope jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  plan_id uuid not null references workforce_plans(id) on delete cascade,
  stage_id text not null,
  department text not null,
  specialist_role text not null,
  objective text not null,
  dependencies jsonb not null default '[]'::jsonb,
  output_kind text not null,
  budget_cents integer not null default 0 check (budget_cents >= 0),
  state text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, stage_id)
);

create table if not exists workforce_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  plan_id uuid not null references workforce_plans(id) on delete cascade,
  stage_id text,
  reviewer_department text not null,
  reviewer_role text not null,
  decision text not null,
  scores jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table workforce_plans enable row level security;
alter table workforce_stages enable row level security;
alter table workforce_reviews enable row level security;

create index if not exists workforce_plans_tenant_mission_idx on workforce_plans (tenant_id, mission_id, created_at desc);
create index if not exists workforce_stages_plan_idx on workforce_stages (plan_id, stage_id);
create index if not exists workforce_reviews_plan_idx on workforce_reviews (plan_id, created_at desc);

create policy workforce_plans_tenant_read on workforce_plans for select
  using (exists (select 1 from tenant_members m where m.tenant_id = workforce_plans.tenant_id and m.user_id = (select auth.uid())));

create policy workforce_stages_tenant_read on workforce_stages for select
  using (exists (select 1 from tenant_members m where m.tenant_id = workforce_stages.tenant_id and m.user_id = (select auth.uid())));

create policy workforce_reviews_tenant_read on workforce_reviews for select
  using (exists (select 1 from tenant_members m where m.tenant_id = workforce_reviews.tenant_id and m.user_id = (select auth.uid())));

revoke all on workforce_plans, workforce_stages, workforce_reviews from public, anon;
grant select on workforce_plans, workforce_stages, workforce_reviews to authenticated;
grant select, insert, update, delete on workforce_plans, workforce_stages, workforce_reviews to service_role;
