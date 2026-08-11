-- Additive AI execution usage ledger for cost-aware provider runtime.
-- DO NOT apply to production as part of the provider router PR merge alone without review.
-- Reuses tenant/mission FKs; never stores secrets or raw prompts.

create table if not exists ai_execution_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid references missions(id) on delete set null,
  department text,
  specialist_role text,
  task_class text not null,
  provider text,
  model text,
  attempt_number integer not null default 1,
  fallback_used boolean not null default false,
  fallback_reason text not null default 'none',
  escalation_level integer not null default 0,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  media_units numeric not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  latency_ms integer not null default 0,
  success boolean not null default false,
  error_category text,
  selection_reason text,
  request_id text,
  created_at timestamptz not null default now()
);

alter table ai_execution_usage enable row level security;

create index if not exists ai_execution_usage_tenant_created_idx
  on ai_execution_usage (tenant_id, created_at desc);

create index if not exists ai_execution_usage_tenant_month_idx
  on ai_execution_usage (tenant_id, created_at);

create policy ai_execution_usage_tenant_read on ai_execution_usage for select
  using (
    exists (
      select 1 from tenant_members m
      where m.tenant_id = ai_execution_usage.tenant_id
        and m.user_id = (select auth.uid())
    )
  );

revoke all on ai_execution_usage from public, anon;
grant select on ai_execution_usage to authenticated;
grant select, insert, update, delete on ai_execution_usage to service_role;
