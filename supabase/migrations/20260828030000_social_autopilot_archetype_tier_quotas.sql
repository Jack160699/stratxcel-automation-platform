-- ==============================================================================
-- Migration: 20260828030000_social_autopilot_archetype_tier_quotas.sql
-- Description: Two new customer-facing entitlement metrics for the
-- subscription-gated Social Autopilot visual-archetype system --
-- social_autopilot_automated_monthly (automated-cron generations) and
-- social_autopilot_manual_monthly (on-demand/manual generations) -- with
-- locked v2 commercial model limits (Starter ₹2,999 / Growth ₹7,999):
--   Starter:  automated=12/mo, manual=0/mo  (BASIC_ESSENTIAL only, no manual access)
--   Growth:   automated=30/mo, manual=10/mo (full archetype system + manual control)
--   Business: automated=30/mo, manual=10/mo (inferred -- not separately specified;
--             mirrors Growth since Business is a superset of Growth everywhere
--             else in PLAN_CAPABILITIES; revisit if a different Business figure
--             is decided later)
--
-- Deliberately NEW, DISTINCT metrics rather than repurposing the existing
-- content_generation_monthly / automated_content_monthly pair: those two
-- already serve Creative Studio and Copilot-requested generations too (see
-- packages/payments-and-wallet/src/entitlements.ts's own field comments) with
-- real, different values already live for every current Starter/Growth
-- subscriber. Overloading them for Social Autopilot specifically would have
-- silently changed every existing customer's Creative Studio/Copilot quota
-- as a side effect of this feature -- reusing the exact same canonical
-- mechanism (usage_entitlements + hasEntitlement/recordMetricUsage, same
-- monthly-reset-on-renewal behavior) without touching the OTHER features'
-- real numbers is the "do not duplicate subscription truth" principle
-- applied precisely, not a new parallel quota system.
--
-- Follows the exact guarded pg_get_functiondef()-patch discipline established
-- by 20260809010000_subscription_v1_catalog_alignment.sql and continued by
-- 20260822120000_v2_commercial_model_realignment.sql: read each function as
-- CURRENTLY installed, verify the expected prior fragments are present
-- verbatim, replace only those fragments, and abort rather than guess if the
-- installed body doesn't match what's expected. Three real, money-adjacent
-- RPCs carry their own copies of the metric/limit arrays (Postgres cannot
-- import the TS-side source of truth):
--   1. reconcile_and_fulfill_razorpay_payment_v4 (legacy Payment-Link path)
--   2. reconcile_and_fulfill_razorpay_subscription_charge (AutoPay recurring-charge path)
--   3. redeem_subscription_go_free_code_v1 (GoFree activation path)
-- All three, plus packages/payments-and-wallet/src/entitlements.ts, are
-- updated in lockstep by this migration + its paired TS change.
-- ==============================================================================

-- ------------------------------------------------------------------
-- 0. Widen the metric CHECK constraint first -- every insert below (and
--    every real payment/renewal from this point on) needs it in place.
-- ------------------------------------------------------------------
alter table public.usage_entitlements
  drop constraint if exists usage_entitlements_metric_check;
alter table public.usage_entitlements
  add constraint usage_entitlements_metric_check
  check (metric = any (array[
    'social_posts',
    'meta_ad_campaigns',
    'whatsapp_contacts',
    'website_maintenance',
    'content_generation_monthly',
    'automated_content_monthly',
    'social_autopilot_automated_monthly',
    'social_autopilot_manual_monthly'
  ]));

-- ------------------------------------------------------------------
-- 1. reconcile_and_fulfill_razorpay_payment_v4
-- ------------------------------------------------------------------
do $v4_archetype_quotas$
declare
  v_signature regprocedure := 'public.reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamptz)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_original text;
begin
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(v_definition, E'\r', E'\n');
  v_original := v_definition;

  if position('v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly''];' in v_definition) = 0 then
    raise exception 'refusing archetype-quota realignment: expected v2 v_metrics declaration not found in reconcile_and_fulfill_razorpay_payment_v4';
  end if;
  if position('v_limits_starter int[] := array[12, 1, 100, 0, 10, 0];' in v_definition) = 0
     or position('v_limits_growth int[] := array[25, 1, 500, 1, 20, 10];' in v_definition) = 0
     or position('v_limits_business int[] := array[50, 3, 1500, 1, 30, 0];' in v_definition) = 0 then
    raise exception 'refusing archetype-quota realignment: expected v2-catalog entitlement declarations not found in reconcile_and_fulfill_razorpay_payment_v4';
  end if;

  v_definition := replace(v_definition,
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly''];',
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly'', ''social_autopilot_automated_monthly'', ''social_autopilot_manual_monthly''];');
  v_definition := replace(v_definition,
    'v_limits_starter int[] := array[12, 1, 100, 0, 10, 0];',
    'v_limits_starter int[] := array[12, 1, 100, 0, 10, 0, 12, 0];');
  v_definition := replace(v_definition,
    'v_limits_growth int[] := array[25, 1, 500, 1, 20, 10];',
    'v_limits_growth int[] := array[25, 1, 500, 1, 20, 10, 30, 10];');
  v_definition := replace(v_definition,
    'v_limits_business int[] := array[50, 3, 1500, 1, 30, 0];',
    'v_limits_business int[] := array[50, 3, 1500, 1, 30, 0, 30, 10];');

  if v_definition = v_original
     or position('social_autopilot_automated_monthly' in v_definition) = 0
     or position('social_autopilot_manual_monthly' in v_definition) = 0 then
    raise exception 'refusing archetype-quota realignment: reconcile_and_fulfill_razorpay_payment_v4 did not patch exactly';
  end if;

  execute v_definition;
end;
$v4_archetype_quotas$;

comment on function public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz)
is 'Hardened payment v4 reconciliation with locked v2 commercial model (Starter ₹2,999 / Growth ₹7,999 / Business ₹15,999); grants social_autopilot_automated_monthly / social_autopilot_manual_monthly (visual-archetype generation quotas) alongside the pre-existing social_posts / meta_ad_campaigns / whatsapp_contacts / website_maintenance / content_generation_monthly / automated_content_monthly entitlements.';

-- ------------------------------------------------------------------
-- 2. reconcile_and_fulfill_razorpay_subscription_charge
-- ------------------------------------------------------------------
do $recurring_archetype_quotas$
declare
  v_signature regprocedure := 'public.reconcile_and_fulfill_razorpay_subscription_charge(text,text,text,text,bigint,text,text,boolean,text,text,text,text,text,timestamptz,timestamptz,timestamptz)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_original text;
begin
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(v_definition, E'\r', E'\n');
  v_original := v_definition;

  if position('v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly''];' in v_definition) = 0
     or position('v_limits int[]; v_limits_starter int[] := array[12,1,100,0,10,0]; v_limits_growth int[] := array[25,1,500,1,20,10]; v_limits_business int[] := array[50,3,1500,1,30,0];' in v_definition) = 0 then
    raise exception 'refusing archetype-quota realignment: expected v2 entitlement declarations not found in reconcile_and_fulfill_razorpay_subscription_charge';
  end if;

  v_definition := replace(v_definition,
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly''];',
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly'', ''social_autopilot_automated_monthly'', ''social_autopilot_manual_monthly''];');
  v_definition := replace(v_definition,
    'v_limits int[]; v_limits_starter int[] := array[12,1,100,0,10,0]; v_limits_growth int[] := array[25,1,500,1,20,10]; v_limits_business int[] := array[50,3,1500,1,30,0];',
    'v_limits int[]; v_limits_starter int[] := array[12,1,100,0,10,0,12,0]; v_limits_growth int[] := array[25,1,500,1,20,10,30,10]; v_limits_business int[] := array[50,3,1500,1,30,0,30,10];');

  if v_definition = v_original
     or position('social_autopilot_automated_monthly' in v_definition) = 0
     or position('social_autopilot_manual_monthly' in v_definition) = 0 then
    raise exception 'refusing archetype-quota realignment: reconcile_and_fulfill_razorpay_subscription_charge did not patch exactly';
  end if;

  execute v_definition;
end;
$recurring_archetype_quotas$;

comment on function public.reconcile_and_fulfill_razorpay_subscription_charge(text, text, text, text, bigint, text, text, boolean, text, text, text, text, text, timestamptz, timestamptz, timestamptz)
is 'AutoPay recurring-charge reconciliation with locked v2 commercial model (Starter ₹2,999 / Growth ₹7,999 / Business ₹15,999); grants social_autopilot_automated_monthly / social_autopilot_manual_monthly (visual-archetype generation quotas) alongside the pre-existing social_posts / meta_ad_campaigns / whatsapp_contacts / website_maintenance / content_generation_monthly / automated_content_monthly entitlements. Resets current_usage to 0 on every renewal, which is what makes these quotas monthly.';

-- ------------------------------------------------------------------
-- 3. redeem_subscription_go_free_code_v1
-- ------------------------------------------------------------------
do $gofree_archetype_quotas$
declare
  v_signature regprocedure := 'public.redeem_subscription_go_free_code_v1(text,uuid,text,text,text,uuid,bigint)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_original text;
begin
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(v_definition, E'\r', E'\n');
  v_original := v_definition;

  if position('v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly''];' in v_definition) = 0 then
    raise exception 'refusing archetype-quota realignment: expected v_metrics declaration not found in redeem_subscription_go_free_code_v1';
  end if;
  if position('v_limits := array[12, 1, 100, 0, 10, 0];' in v_definition) = 0
     or position('v_limits := array[25, 1, 500, 1, 20, 10];' in v_definition) = 0
     or position('v_limits := array[50, 3, 1500, 1, 30, 0];' in v_definition) = 0 then
    raise exception 'refusing archetype-quota realignment: expected v2-catalog v_limits assignments not found in redeem_subscription_go_free_code_v1';
  end if;

  v_definition := replace(v_definition,
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly''];',
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly'', ''social_autopilot_automated_monthly'', ''social_autopilot_manual_monthly''];');
  v_definition := replace(v_definition,
    'v_limits := array[12, 1, 100, 0, 10, 0];',
    'v_limits := array[12, 1, 100, 0, 10, 0, 12, 0];');
  v_definition := replace(v_definition,
    'v_limits := array[25, 1, 500, 1, 20, 10];',
    'v_limits := array[25, 1, 500, 1, 20, 10, 30, 10];');
  v_definition := replace(v_definition,
    'v_limits := array[50, 3, 1500, 1, 30, 0];',
    'v_limits := array[50, 3, 1500, 1, 30, 0, 30, 10];');

  if v_definition = v_original
     or position('social_autopilot_automated_monthly' in v_definition) = 0
     or position('social_autopilot_manual_monthly' in v_definition) = 0 then
    raise exception 'refusing archetype-quota realignment: redeem_subscription_go_free_code_v1 did not patch exactly';
  end if;

  execute v_definition;
end;
$gofree_archetype_quotas$;

comment on function public.redeem_subscription_go_free_code_v1(text, uuid, text, text, text, uuid, bigint)
is 'GoFree promo-code subscription activation with locked v2 commercial model; grants social_autopilot_automated_monthly / social_autopilot_manual_monthly (visual-archetype generation quotas) alongside the pre-existing six entitlement metrics.';

-- ------------------------------------------------------------------
-- 4. Backfill -- every currently ACTIVE subscription gets these two new
--    entitlement rows immediately, rather than waiting for its next
--    renewal/reconciliation event. Without this, an existing paying
--    Starter/Growth subscriber would see hasEntitlement() fail closed
--    (no row = no entitlement) for a quota their plan already includes,
--    until their subscription happens to renew.
-- ------------------------------------------------------------------
insert into public.usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
select
  s.tenant_id,
  s.id,
  m.metric,
  m.limit_amount,
  0,
  m.limit_amount,
  0
from public.subscriptions s
cross join lateral (
  values
    ('social_autopilot_automated_monthly', case s.plan_tier when 'starter' then 12 when 'growth' then 30 when 'business' then 30 else null end),
    ('social_autopilot_manual_monthly',    case s.plan_tier when 'starter' then 0  when 'growth' then 10 when 'business' then 10 else null end)
) as m(metric, limit_amount)
where s.status = 'active'
  and s.plan_tier in ('starter', 'growth', 'business')
  and m.limit_amount is not null
on conflict (tenant_id, metric) do nothing;

comment on constraint usage_entitlements_metric_check on public.usage_entitlements
is 'Widened for social_autopilot_automated_monthly / social_autopilot_manual_monthly (visual-archetype generation quotas) -- see 20260828030000_social_autopilot_archetype_tier_quotas.sql.';
