-- Search & Discovery runtime. Additive only; do not apply automatically.
create table if not exists search_projects (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  property_url text not null, name text not null, locations jsonb not null default '[]', competitors jsonb not null default '[]',
  enabled boolean not null default true, ownership_verified boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, property_url)
);
create table if not exists search_analysis_runs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references search_projects(id) on delete cascade, run_type text not null check (run_type in ('lightweight','weekly','monthly','manual')),
  trigger_source text not null check (trigger_source in ('manual','scheduler','internal')), state text not null default 'CREATED' check (state in ('CREATED','RUNNING','RETRY_WAIT','COMPLETED','PARTIAL','FAILED')),
  idempotency_key text not null, correlation_id uuid not null default gen_random_uuid(), attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  lease_expires_at timestamptz, heartbeat_at timestamptz, started_at timestamptz, completed_at timestamptz, failure_reason text,
  summary_counts jsonb not null default '{}', provider_availability jsonb not null default '{}', schema_version integer not null default 1,
  created_at timestamptz not null default now(), unique (tenant_id, idempotency_key)
);
create table if not exists search_opportunities (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references search_projects(id) on delete cascade, source_run_id uuid references search_analysis_runs(id) on delete set null,
  fingerprint text not null, category text not null, severity text not null check (severity in ('Critical','High','Medium','Low')),
  priority integer not null default 0 check (priority between 0 and 100), evidence jsonb not null default '{}', affected_url text, affected_query text, affected_location text, platform text,
  business_rationale text not null, proposed_action text not null, status text not null default 'NEW' check (status in ('NEW','ACTIVE','ACTION_PROPOSED','AWAITING_APPROVAL','IN_PROGRESS','RESOLVED','SUPERSEDED')),
  recurrence_count integer not null default 0, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), resolved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (tenant_id, project_id, fingerprint)
);
create table if not exists search_recommendations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  opportunity_id uuid not null references search_opportunities(id) on delete cascade, source_run_id uuid references search_analysis_runs(id) on delete set null,
  fingerprint text not null,
  evidence jsonb not null default '{}', proposed_change jsonb not null default '{}', action_class text not null check (action_class in ('safe_preparatory','approval_required','manual_provider_required')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUPERSEDED','RESOLVED')), created_at timestamptz not null default now(), resolved_at timestamptz,
  unique (tenant_id, opportunity_id, fingerprint)
);
create table if not exists search_actions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  recommendation_id uuid not null references search_recommendations(id) on delete cascade, approval_id uuid references approvals(id) on delete set null,
  action_class text not null check (action_class in ('safe_preparatory','approval_required','manual_provider_required')),
  state text not null default 'PROPOSED' check (state in ('PROPOSED','AWAITING_APPROVAL','APPROVED','REJECTED','IN_PROGRESS','COMPLETED','FAILED','MANUAL_REQUIRED')),
  before_evidence jsonb not null default '{}', after_evidence jsonb not null default '{}', execution_result jsonb not null default '{}',
  created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now(),
  unique (tenant_id, recommendation_id)
);
create table if not exists search_measurement_snapshots (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references search_projects(id) on delete cascade, source_run_id uuid references search_analysis_runs(id) on delete set null,
  source text not null, dimensions jsonb not null default '{}', period_start date, period_end date, values jsonb not null default '{}',
  availability_state text not null check (availability_state in ('connected','not_connected','permission_required','configuration_required','waiting_for_data','error')),
  unavailable_reason text, fingerprint text not null, captured_at timestamptz not null default now(), unique (tenant_id, project_id, fingerprint)
);

alter table search_projects enable row level security;
alter table search_analysis_runs enable row level security;
alter table search_opportunities enable row level security;
alter table search_recommendations enable row level security;
alter table search_actions enable row level security;
alter table search_measurement_snapshots enable row level security;
create policy search_projects_tenant_read on search_projects for select using (exists (select 1 from tenant_members m where m.tenant_id = search_projects.tenant_id and m.user_id = (select auth.uid())));
create policy search_runs_tenant_read on search_analysis_runs for select using (exists (select 1 from tenant_members m where m.tenant_id = search_analysis_runs.tenant_id and m.user_id = (select auth.uid())));
create policy search_opportunities_tenant_read on search_opportunities for select using (exists (select 1 from tenant_members m where m.tenant_id = search_opportunities.tenant_id and m.user_id = (select auth.uid())));
create policy search_recommendations_tenant_read on search_recommendations for select using (exists (select 1 from tenant_members m where m.tenant_id = search_recommendations.tenant_id and m.user_id = (select auth.uid())));
create policy search_actions_tenant_read on search_actions for select using (exists (select 1 from tenant_members m where m.tenant_id = search_actions.tenant_id and m.user_id = (select auth.uid())));
create policy search_snapshots_tenant_read on search_measurement_snapshots for select using (exists (select 1 from tenant_members m where m.tenant_id = search_measurement_snapshots.tenant_id and m.user_id = (select auth.uid())));
revoke all on search_projects, search_analysis_runs, search_opportunities, search_recommendations, search_actions, search_measurement_snapshots from public, anon;
grant select on search_projects, search_analysis_runs, search_opportunities, search_recommendations, search_actions, search_measurement_snapshots to authenticated;
grant select, insert, update, delete on search_projects, search_analysis_runs, search_opportunities, search_recommendations, search_actions, search_measurement_snapshots to service_role;
create index if not exists search_runs_tenant_created_idx on search_analysis_runs (tenant_id, created_at desc);
create index if not exists search_opportunities_tenant_status_idx on search_opportunities (tenant_id, status, priority desc);
create index if not exists search_actions_tenant_state_idx on search_actions (tenant_id, state, created_at desc);
