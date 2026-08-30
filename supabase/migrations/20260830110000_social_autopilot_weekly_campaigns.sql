-- STRATXCEL weekly-engine brief Section 19/22: a real, persisted,
-- idempotent weekly-campaign checkpoint per tenant. Additive only -- does
-- NOT replace social_autopilot_authorizations' existing period model
-- (period_number/period_target_units), which the current entitlement and
-- billing logic still correctly depends on. This is a new, additional
-- tracking layer: "which real calendar week (Monday-Sunday) is this
-- tenant's autopilot currently operating in, and has a checkpoint for it
-- already been created" -- so a Monday trigger can never create a
-- duplicate campaign for the same week (Section 19: "One Monday should
-- not create duplicate campaigns"), and so the weekly-cycle state is
-- genuinely observable in the database, not just inferred from queue-item
-- scheduled_at values.
create table if not exists social_autopilot_weekly_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  authorization_id uuid not null references social_autopilot_authorizations(id) on delete cascade,
  -- YYYY-MM-DD of the real Monday this week started, in the
  -- authorization's own timezone (resolveCanonicalWeekBounds) -- the
  -- stable idempotency key: every day within the same real week resolves
  -- to the same week_key, so a duplicate insert attempt is caught by the
  -- unique constraint below rather than relying on application logic alone.
  week_key text not null,
  week_start date not null,
  week_end date not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED')),
  -- Real strategy content once a real weekly re-strategizing pass has run
  -- for this week; '{}' (the default) means "checkpoint exists, no
  -- strategy content generated for it yet" -- never fabricated.
  strategy jsonb not null default '{}'::jsonb,
  -- Real prior-week performance data once real platform-analytics
  -- ingestion exists for this tenant; null (the default) is an honest
  -- "no signal available", never a fabricated metric.
  performance_snapshot jsonb,
  performance_signal_status text not null default 'NO_ANALYTICS_AVAILABLE'
    check (performance_signal_status in ('NO_ANALYTICS_AVAILABLE', 'SNAPSHOT_RECORDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, week_key)
);

create index if not exists social_autopilot_weekly_campaigns_tenant_idx
  on social_autopilot_weekly_campaigns (tenant_id, week_key);
create index if not exists social_autopilot_weekly_campaigns_authorization_idx
  on social_autopilot_weekly_campaigns (authorization_id);

alter table social_autopilot_weekly_campaigns enable row level security;

-- Staff read-only, matching the real, already-verified-live
-- social_autopilot_campaign_tasks_staff_read policy pattern (see
-- 20260830070000_hermes_social_autopilot_campaign_tasks.sql) -- not
-- assumed by analogy, the same real pattern reused. Service-role writes
-- bypass RLS by Supabase's own default; no explicit write policy needed.
create policy social_autopilot_weekly_campaigns_staff_read
  on social_autopilot_weekly_campaigns
  for select
  to authenticated
  using (
    exists (
      select 1 from stratxcel_admins a
      where a.user_id = (select auth.uid())
    )
  );
