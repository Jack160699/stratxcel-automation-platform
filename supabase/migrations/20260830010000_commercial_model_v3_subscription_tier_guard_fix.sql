-- Fix Plan Tier and Force Content Generation mission: a real, previously-
-- undiscovered production defect found while trying to move a subscription
-- onto the current commercial model's real top tier (advanced_growth).
--
-- The "commercial model v3 rebuild" migration (20260830000000) shipped a
-- full new application-layer tier catalog (packages/payments-and-wallet/
-- src/plans.ts's PlanTier: free, seo, social, seo_and_social, advanced_seo,
-- advanced_social, advanced_growth, website_landing_page, website_standard,
-- website_custom -- plus the legacy starter/growth/business/launch/
-- custom_growth/scale) but never updated the DATABASE-level guards that
-- constrain subscriptions.plan_tier. Confirmed live against production:
--
-- 1. subscriptions_plan_tier_check (20260809010000_subscription_v1_catalog_
--    alignment.sql) still only allows ('launch','custom_growth','starter',
--    'growth','business','scale') -- every current-model tier is REJECTED
--    at the schema level.
-- 2. subscriptions_new_v1_tier_guard / enforce_new_subscription_v1_tier(),
--    a BEFORE INSERT OR UPDATE OF plan_tier trigger from the same
--    migration, independently rejects anything outside ('starter','growth',
--    'business') with its own raised exception -- fires before the CHECK
--    constraint is even reached.
--
-- Net effect: no subscription, via ANY path (self-service checkout, admin
-- override, or otherwise), can actually ever be set to seo, social,
-- seo_and_social, advanced_seo, advanced_social, or advanced_growth in
-- production today -- the entire v3 commercial model is non-functional at
-- the database layer, independent of anything the application code does.
-- This is a real, live, wide-reaching gap, not scoped to any one tenant --
-- flagged prominently in this mission's report.
--
-- Fix: widen both guards to the full, real, current PlanTier catalog
-- (plans.ts is the single source of truth) rather than removing them --
-- they still reject genuinely unknown/garbage values, just no longer a
-- stale v1-only allow-list.

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_tier_check;

alter table public.subscriptions
  add constraint subscriptions_plan_tier_check
  check (plan_tier in (
    'free', 'seo', 'social', 'seo_and_social', 'advanced_seo', 'advanced_social', 'advanced_growth',
    'website_landing_page', 'website_standard', 'website_custom',
    'launch', 'custom_growth', 'starter', 'growth', 'business', 'scale'
  ));

alter table public.subscriptions
  drop constraint if exists subscriptions_pending_plan_tier_check;

alter table public.subscriptions
  add constraint subscriptions_pending_plan_tier_check
  check (pending_plan_tier is null or pending_plan_tier in (
    'free', 'seo', 'social', 'seo_and_social', 'advanced_seo', 'advanced_social', 'advanced_growth',
    'website_landing_page', 'website_standard', 'website_custom',
    'launch', 'custom_growth', 'starter', 'growth', 'business', 'scale'
  ));

-- Same class of bug, found immediately after fixing the above while
-- provisioning entitlements for the real advanced_growth catalog: the app's
-- own EntitlementMetric type (packages/payments-and-wallet/src/
-- entitlements.ts) has always included image_generation_attempts_monthly
-- and copilot_monthly_uses, but usage_entitlements_metric_check has never
-- allowed either value -- confirmed live, meaning no tenant, on any plan,
-- has ever been able to have a real usage_entitlements row for either
-- metric. Widened to match the real, current EntitlementMetric type.
alter table public.usage_entitlements
  drop constraint if exists usage_entitlements_metric_check;

alter table public.usage_entitlements
  add constraint usage_entitlements_metric_check
  check (metric in (
    'social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance',
    'content_generation_monthly', 'automated_content_monthly',
    'social_autopilot_automated_monthly', 'social_autopilot_manual_monthly',
    'image_generation_attempts_monthly', 'copilot_monthly_uses'
  ));

create or replace function public.enforce_new_subscription_v1_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_tier not in (
    'free', 'seo', 'social', 'seo_and_social', 'advanced_seo', 'advanced_social', 'advanced_growth',
    'website_landing_page', 'website_standard', 'website_custom',
    'launch', 'custom_growth', 'starter', 'growth', 'business', 'scale'
  ) then
    raise exception 'plan_tier must be a real, known commercial-model tier; got %', new.plan_tier
      using errcode = '23514';
  end if;
  return new;
end;
$$;
