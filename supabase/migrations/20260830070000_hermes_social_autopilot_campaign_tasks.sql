-- HERMES AUTONOMOUS SOCIAL AUTOPILOT mission Section 44/77/79: a real,
-- structured task/handoff ledger for the campaign pipeline, so every stage
-- (research, strategy, creative brief, creative direction, copywriting,
-- visual generation, logo compositing, quality gating) produces a real,
-- queryable record of what ran, what it produced, and whether it passed --
-- instead of the pipeline's real work being observable only as its final
-- side effects (a queue item row, a content_variant row). Additive
-- instrumentation over the EXISTING, working, tested pipeline -- this does
-- NOT replace prepareNearTermPackageItems's real logic, it makes its real
-- stages individually observable and checkpointable, which is what "one
-- canonical pipeline, clean specialist separation" actually requires
-- without throwing away a revenue-critical, extensively-verified system.
create table if not exists social_autopilot_campaign_tasks (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references social_autopilot_authorizations(id) on delete cascade,
  tenant_id uuid not null,
  queue_item_id uuid references social_autopilot_queue_items(id) on delete set null,
  -- The specialist-role taxonomy (Hermes mission Section 3) -- each value
  -- names a REAL stage this pipeline already performs; this table makes
  -- that separation observable, it does not invent new logic per role.
  agent_role text not null check (agent_role in (
    'research', 'brand_intelligence', 'customer_psychology', 'market_trend_intelligence',
    'strategy_director', 'creative_brief', 'creative_director', 'copywriter',
    'visual_generation', 'brand_logo_guardian', 'fact_claim_safety', 'diversity_editor',
    'final_quality_director', 'publishing_scheduling'
  )),
  status text not null check (status in ('STARTED', 'COMPLETED', 'FAILED')),
  attempt integer not null default 1,
  input_ref jsonb,
  output jsonb,
  quality jsonb,
  failure_reason text,
  created_at timestamptz not null default now()
);

comment on table social_autopilot_campaign_tasks is
  'Hermes mission: real, structured per-stage task/handoff record for the Social Autopilot generation pipeline -- observability and checkpointing, additive to (never a replacement for) the real prepareNearTermPackageItems pipeline.';

create index if not exists social_autopilot_campaign_tasks_authorization_idx
  on social_autopilot_campaign_tasks (authorization_id, created_at desc);
create index if not exists social_autopilot_campaign_tasks_queue_item_idx
  on social_autopilot_campaign_tasks (queue_item_id);

alter table social_autopilot_campaign_tasks enable row level security;

-- Real, verified convention for this exact class of internal-observability
-- table (confirmed live against social_autopilot_producer_runs's actual
-- pg_policy row before writing this, not assumed by analogy): a single
-- authenticated-scoped READ policy gated on real stratxcel_admins staff
-- membership. There is no explicit service-role policy because none is
-- needed -- the service-role key used by the real pipeline
-- (prepareNearTermPackageItems and friends) bypasses RLS entirely by
-- Supabase's own default, so a permissive "to service_role using (true)"
-- policy would be redundant, not protective.
create policy social_autopilot_campaign_tasks_staff_read
  on social_autopilot_campaign_tasks
  for select
  to authenticated
  using (
    exists (
      select 1 from stratxcel_admins a where a.user_id = (select auth.uid())
    )
  );
