-- ==============================================================================
-- Migration: 20260828040000_social_autopilot_visual_archetype_preferences.sql
-- Description: Persists a Growth/Business tenant's 1-3 preferred visual
-- archetypes for the subscription-gated Social Autopilot visual-archetype
-- system (Spotify-style "choose your visual taste" onboarding).
--
-- Deliberately its own small table, tenant-scoped by primary key, rather
-- than a column on social_autopilot_authorizations: an authorization row
-- is tied to one subscription_id + entitlement_id
-- (unique(tenant_id, subscription_id, entitlement_id)) and gets recreated
-- across cancel/reactivate or renewal-driven entitlement regeneration --
-- visual taste is a tenant-level preference that must survive that
-- lifecycle, not be re-onboarded every billing cycle. It is also not a
-- quota or subscription-truth table (no limits, no usage, no pricing) --
-- entitlement/quota truth stays exclusively in usage_entitlements /
-- subscriptions, unchanged by this migration.
--
-- The valid-archetype CHECK constraint enumerates the same 12 canonical
-- archetype IDs as lib/social/archetype-registry.ts (the single source of
-- truth every other system -- renderer, router, UI, prompts, tests --
-- consumes). Follows the exact widen-when-a-13th-archetype-ships pattern
-- already proven twice in this codebase
-- (20260823140000_widen_usage_entitlements_metric_check.sql and this
-- session's own 20260828030000 migration).
-- ==============================================================================

-- Postgres refuses a subquery directly inside a CHECK constraint
-- expression ("cannot use subquery in check constraint") -- a subquery
-- inside a function body it calls is fine, so the no-duplicates rule is
-- expressed via this small immutable helper instead of inline SQL.
create or replace function social_autopilot_array_has_duplicates(arr text[])
returns boolean
language sql
immutable
as $fn$
  select cardinality(arr) <> cardinality(array(select distinct unnest(arr)));
$fn$;

create table if not exists social_autopilot_visual_preferences (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  -- Empty array is a valid, expected state: "Growth/Business tenant has not
  -- completed archetype onboarding yet" -- routing falls back safely
  -- (BASIC_ESSENTIAL) rather than treating this as an error. Minimum 1 is
  -- an application-level rule for "onboarding considered complete", not a
  -- DB constraint, precisely so this default is representable.
  preferred_archetypes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint social_autopilot_visual_preferences_valid_archetypes check (
    preferred_archetypes <@ array[
      'BASIC_ESSENTIAL', 'SPLIT_BANNER', 'FLOATING_CARD', 'EDITORIAL_FRAME',
      'MINIMAL_FOOTER_STRIP', 'ELEVATED_BADGE', 'DUAL_TONE_SIDEBAR', 'FROSTED_GLASS_CENTER',
      'TYPOGRAPHIC_HERO', 'POLAROID_LIFESTYLE', 'CLINICAL_TRUST', 'NEON_NIGHTLIFE'
    ]::text[]
  ),
  constraint social_autopilot_visual_preferences_max_three check (
    cardinality(preferred_archetypes) <= 3
  ),
  constraint social_autopilot_visual_preferences_no_duplicates check (
    not social_autopilot_array_has_duplicates(preferred_archetypes)
  )
);

alter table social_autopilot_visual_preferences enable row level security;

create index if not exists social_autopilot_visual_preferences_tenant_idx
  on social_autopilot_visual_preferences (tenant_id);

create policy social_autopilot_visual_preferences_tenant_read on social_autopilot_visual_preferences for select
  using (exists (
    select 1 from tenant_members m
    where m.tenant_id = social_autopilot_visual_preferences.tenant_id
      and m.user_id = (select auth.uid())
  ));

-- Writes go exclusively through server-validated code (never trust a
-- frontend-submitted archetype list directly) -- same access shape as
-- usage_entitlements: service_role for all mutation, authenticated for
-- read-your-own-tenant only.
revoke all on social_autopilot_visual_preferences from public, anon;
grant select, insert, update, delete on social_autopilot_visual_preferences to service_role;
grant select on social_autopilot_visual_preferences to authenticated;

comment on table social_autopilot_visual_preferences is 'Growth/Business tenant''s saved 1-3 preferred visual archetypes (Spotify-style onboarding). Empty array = onboarding not yet completed; router falls back to a safe deterministic default. Never written from client input without server-side tier + registry validation.';
comment on column social_autopilot_visual_preferences.preferred_archetypes is 'Ordered list of archetype IDs, 0-3 entries, each a valid id from lib/social/archetype-registry.ts, no duplicates. Order is preference rank (1st = most preferred) for onboarding UI display; automated routing still rotates fairly across all selected, not just the first.';
