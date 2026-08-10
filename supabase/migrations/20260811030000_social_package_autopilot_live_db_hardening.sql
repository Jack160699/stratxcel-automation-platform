-- Social Package Autopilot: live-DB hardening (additive only).
--
-- The first three package-autopilot migrations are already applied on the
-- real Stratxcel production database and MUST NOT be edited:
--   20260810195000_social_package_autopilot_authorization.sql
--   20260811000000_social_package_autopilot_producer.sql
--   20260811020000_social_package_autopilot_brand_media_binding.sql
--
-- This migration only:
--   1. Drops the obsolete UNIQUE (authorization_id, package_sequence)
--      constraint that blocks period-2+ renewals (package_sequence resets
--      each service period under the recurring model).
--   2. Preserves the period-aware unique index
--      social_autopilot_queue_items_period_sequence_key
--      (authorization_id, period_number, package_sequence).
--   3. Adds covering indexes for new package FK hot-paths flagged by the
--      Supabase performance advisor (CREATE INDEX IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- 1. Drop ONLY the obsolete two-column uniqueness.
--
-- Production constraint name (Postgres makeObjectName truncation to 63 chars,
-- preserving the `_key` label):
--   social_autopilot_queue_items_authorization_id_package_seque_key
--
-- Idempotent: drops by exact known name AND by exact two-column definition,
-- never touching the period-aware unique index.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'social_autopilot_queue_items'
      and c.conname = 'social_autopilot_queue_items_authorization_id_package_seque_key'
  ) then
    alter table social_autopilot_queue_items
      drop constraint social_autopilot_queue_items_authorization_id_package_seque_key;
  end if;

  -- Belt-and-suspenders: any remaining UNIQUE (authorization_id, package_sequence)
  -- constraint (alternate name / restored dump) is also obsolete.
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'social_autopilot_queue_items'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) = 'UNIQUE (authorization_id, package_sequence)'
  loop
    execute format(
      'alter table social_autopilot_queue_items drop constraint if exists %I',
      r.conname
    );
  end loop;
end $$;

-- Preserve / ensure the period-aware uniqueness (already created by
-- 20260811000000; IF NOT EXISTS keeps this re-runnable).
create unique index if not exists social_autopilot_queue_items_period_sequence_key
  on social_autopilot_queue_items (authorization_id, period_number, package_sequence);

-- ---------------------------------------------------------------------------
-- 2. Covering indexes for new package FK hot-paths (advisor-flagged).
--    Skip columns already sufficiently covered as the leading column of an
--    existing unique/composite index.
-- ---------------------------------------------------------------------------

-- social_autopilot_authorizations:
--   unique (tenant_id, subscription_id, entitlement_id) covers tenant_id as
--   leading column only — brand/entitlement/subscription each need their own.
create index if not exists social_autopilot_authorizations_brand_profile_id_idx
  on social_autopilot_authorizations (brand_profile_id);
create index if not exists social_autopilot_authorizations_entitlement_id_idx
  on social_autopilot_authorizations (entitlement_id);
create index if not exists social_autopilot_authorizations_subscription_id_idx
  on social_autopilot_authorizations (subscription_id);

-- social_autopilot_queue_items:
--   period_sequence_key leads with authorization_id; due_idx / content_unit_idx
--   do not cover these FK columns.
create index if not exists social_autopilot_queue_items_account_id_idx
  on social_autopilot_queue_items (account_id);
create index if not exists social_autopilot_queue_items_content_master_id_idx
  on social_autopilot_queue_items (content_master_id);
create index if not exists social_autopilot_queue_items_publishing_job_id_idx
  on social_autopilot_queue_items (publishing_job_id);
create index if not exists social_autopilot_queue_items_tenant_id_idx
  on social_autopilot_queue_items (tenant_id);
create index if not exists social_autopilot_queue_items_variant_id_idx
  on social_autopilot_queue_items (variant_id);
