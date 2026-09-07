-- Master brief Section 15 (Continuous Operations) / Section 9-10 (autonomous
-- sales loop): a real, reusable "run this mission on a schedule" template,
-- instantiated into a real mission via the EXISTING createAndEstimateMission
-- (packages/missions/src/repository.ts) -- never a duplicate mission-
-- creation path. Same security convention as agent_definitions/
-- connector_connections: service_role-only, RLS enabled with zero policies
-- (default-deny; service_role bypasses RLS), staff authorization enforced
-- at the application layer.
--
-- Deliberately does NOT add a new vercel.json cron entry -- this codebase's
-- own established precedent (app/api/internal/search/scheduler/route.ts's
-- Review Bot, see its own top comment) is to piggyback new recurring work
-- onto an existing cron's route rather than request a new slot, given the
-- Hobby-plan project this runs on. This table only stores WHEN a template
-- is next due; the actual firing logic lives in
-- packages/missions/src/recurring.ts, called from that same existing cron.

create table if not exists recurring_mission_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  label text not null,
  goal_text text not null,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly')),
  enabled boolean not null default true,
  next_fire_at timestamptz not null default now(),
  last_fired_at timestamptz,
  last_mission_id uuid references missions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on recurring_mission_templates from public, anon, authenticated;
grant select, insert, update, delete on recurring_mission_templates to service_role;
alter table recurring_mission_templates enable row level security;

create index if not exists recurring_mission_templates_due_idx on recurring_mission_templates (next_fire_at) where enabled = true;
create index if not exists recurring_mission_templates_tenant_idx on recurring_mission_templates (tenant_id);
