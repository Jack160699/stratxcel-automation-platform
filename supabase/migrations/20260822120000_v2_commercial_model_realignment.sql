-- ==============================================================================
-- Migration: 20260822120000_v2_commercial_model_realignment.sql
-- Description: Realigns the self-checkout catalog to the locked StratXcel v2
-- commercial model (Starter ₹2,999 / Growth ₹7,999 / Business ₹15,999,
-- GST-inclusive) and adds two new customer-facing entitlement metrics
-- (content_generation_monthly, automated_content_monthly) representing the
-- new "image/content generations per month" allowance described in the
-- locked brief — a separate concept from social_posts (Social Autopilot's
-- monthly publishing package size, reusing already-generated assets), which
-- is intentionally left unchanged here.
--
-- Follows the exact guarded pg_get_functiondef()-patch discipline established
-- by 20260809010000_subscription_v1_catalog_alignment.sql: read the function
-- as CURRENTLY installed, verify the expected prior fragments are present
-- verbatim, replace only those fragments, and abort rather than guess if the
-- installed body doesn't match what we expect.
--
-- Two functions carry their own copies of price/limit numbers (Postgres
-- cannot import packages/payments-and-wallet/src/plans.ts and entitlements.ts,
-- which are the TS-side source of truth and were updated in lockstep with
-- this migration):
--   1. reconcile_and_fulfill_razorpay_payment_v4 (legacy Payment-Link path)
--   2. reconcile_and_fulfill_razorpay_subscription_charge (AutoPay recurring-charge path)
-- ==============================================================================

-- ------------------------------------------------------------------
-- 1. reconcile_and_fulfill_razorpay_payment_v4
-- ------------------------------------------------------------------
do $v4_realignment$
declare
  v_signature regprocedure := 'public.reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamptz)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_original text;
begin
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(v_definition, E'\r', E'\n');
  v_original := v_definition;

  if position('v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance''];' in v_definition) = 0 then
    raise exception 'refusing v2 realignment: expected v_metrics declaration not found in reconcile_and_fulfill_razorpay_payment_v4';
  end if;
  if position('v_limits_starter int[] := array[12, 1, 100, 0];' in v_definition) = 0
     or position('v_limits_growth int[] := array[25, 1, 500, 1];' in v_definition) = 0
     or position('v_limits_business int[] := array[50, 3, 1500, 1];' in v_definition) = 0 then
    raise exception 'refusing v2 realignment: expected v1-catalog entitlement declarations not found in reconcile_and_fulfill_razorpay_payment_v4';
  end if;
  if position(
$old_branch$if v_plan_tier = 'starter' then
      v_base_price := 499900;
      v_limits := v_limits_starter;
    elsif v_plan_tier = 'growth' then
      v_base_price := 999900;
      v_limits := v_limits_growth;
    elsif v_plan_tier = 'business' then
      v_base_price := 1999900;
      v_limits := v_limits_business;
    elsif v_plan_tier in ('launch', 'custom_growth') then$old_branch$
  in v_definition) = 0 then
    raise exception 'refusing v2 realignment: expected v1-catalog price branch not found in reconcile_and_fulfill_razorpay_payment_v4';
  end if;

  v_definition := replace(v_definition,
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance''];',
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly''];');
  v_definition := replace(v_definition,
    'v_limits_starter int[] := array[12, 1, 100, 0];',
    'v_limits_starter int[] := array[12, 1, 100, 0, 10, 0];');
  v_definition := replace(v_definition,
    'v_limits_growth int[] := array[25, 1, 500, 1];',
    'v_limits_growth int[] := array[25, 1, 500, 1, 20, 10];');
  v_definition := replace(v_definition,
    'v_limits_business int[] := array[50, 3, 1500, 1];',
    'v_limits_business int[] := array[50, 3, 1500, 1, 30, 0];');
  v_definition := replace(v_definition,
$old$if v_plan_tier = 'starter' then
      v_base_price := 499900;
      v_limits := v_limits_starter;
    elsif v_plan_tier = 'growth' then
      v_base_price := 999900;
      v_limits := v_limits_growth;
    elsif v_plan_tier = 'business' then
      v_base_price := 1999900;
      v_limits := v_limits_business;
    elsif v_plan_tier in ('launch', 'custom_growth') then$old$,
$new$if v_plan_tier = 'starter' then
      v_base_price := 299900;
      v_limits := v_limits_starter;
    elsif v_plan_tier = 'growth' then
      v_base_price := 799900;
      v_limits := v_limits_growth;
    elsif v_plan_tier = 'business' then
      v_base_price := 1599900;
      v_limits := v_limits_business;
    elsif v_plan_tier in ('launch', 'custom_growth') then$new$);

  if v_definition = v_original
     or position('v_base_price := 299900;' in v_definition) = 0
     or position('content_generation_monthly' in v_definition) = 0
     or position('legacy_plan_not_payable' in v_definition) = 0
     or position('plan_not_self_checkout' in v_definition) = 0 then
    raise exception 'refusing v2 realignment: reconcile_and_fulfill_razorpay_payment_v4 did not patch exactly';
  end if;

  execute v_definition;
end;
$v4_realignment$;

comment on function public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz)
is 'Hardened payment v4 reconciliation with locked v2 commercial model (Starter ₹2,999 / Growth ₹7,999 / Business ₹15,999); Free, Scale, legacy, unknown, and mismatched payments fail closed.';

-- ------------------------------------------------------------------
-- 2. reconcile_and_fulfill_razorpay_subscription_charge
-- ------------------------------------------------------------------
do $recurring_realignment$
declare
  v_signature regprocedure := 'public.reconcile_and_fulfill_razorpay_subscription_charge(text,text,text,text,bigint,text,text,boolean,text,text,text,text,text,timestamptz,timestamptz,timestamptz)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_original text;
begin
  v_definition := replace(v_definition, E'\r\n', E'\n');
  v_definition := replace(v_definition, E'\r', E'\n');
  v_original := v_definition;

  if position('v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance''];' in v_definition) = 0
     or position('v_limits int[]; v_limits_starter int[] := array[12,1,100,0]; v_limits_growth int[] := array[25,1,500,1]; v_limits_business int[] := array[50,3,1500,1];' in v_definition) = 0 then
    raise exception 'refusing v2 realignment: expected entitlement declarations not found in reconcile_and_fulfill_razorpay_subscription_charge';
  end if;
  if position(
$old_branch$if v_effective_plan = 'starter' then v_catalog_cents := 499900; v_limits := v_limits_starter;
  elsif v_effective_plan = 'growth' then v_catalog_cents := 999900; v_limits := v_limits_growth;
  elsif v_effective_plan = 'business' then v_catalog_cents := 1999900; v_limits := v_limits_business;$old_branch$
  in v_definition) = 0 then
    raise exception 'refusing v2 realignment: expected price branch not found in reconcile_and_fulfill_razorpay_subscription_charge';
  end if;

  v_definition := replace(v_definition,
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance''];',
    'v_metrics text[] := array[''social_posts'', ''meta_ad_campaigns'', ''whatsapp_contacts'', ''website_maintenance'', ''content_generation_monthly'', ''automated_content_monthly''];');
  v_definition := replace(v_definition,
    'v_limits int[]; v_limits_starter int[] := array[12,1,100,0]; v_limits_growth int[] := array[25,1,500,1]; v_limits_business int[] := array[50,3,1500,1];',
    'v_limits int[]; v_limits_starter int[] := array[12,1,100,0,10,0]; v_limits_growth int[] := array[25,1,500,1,20,10]; v_limits_business int[] := array[50,3,1500,1,30,0];');
  v_definition := replace(v_definition,
$old$if v_effective_plan = 'starter' then v_catalog_cents := 499900; v_limits := v_limits_starter;
  elsif v_effective_plan = 'growth' then v_catalog_cents := 999900; v_limits := v_limits_growth;
  elsif v_effective_plan = 'business' then v_catalog_cents := 1999900; v_limits := v_limits_business;$old$,
$new$if v_effective_plan = 'starter' then v_catalog_cents := 299900; v_limits := v_limits_starter;
  elsif v_effective_plan = 'growth' then v_catalog_cents := 799900; v_limits := v_limits_growth;
  elsif v_effective_plan = 'business' then v_catalog_cents := 1599900; v_limits := v_limits_business;$new$);

  if v_definition = v_original
     or position('v_catalog_cents := 299900;' in v_definition) = 0
     or position('content_generation_monthly' in v_definition) = 0 then
    raise exception 'refusing v2 realignment: reconcile_and_fulfill_razorpay_subscription_charge did not patch exactly';
  end if;

  execute v_definition;
end;
$recurring_realignment$;

comment on function public.reconcile_and_fulfill_razorpay_subscription_charge(text, text, text, text, bigint, text, text, boolean, text, text, text, text, text, timestamptz, timestamptz, timestamptz)
is 'AutoPay recurring-charge reconciliation with locked v2 commercial model (Starter ₹2,999 / Growth ₹7,999 / Business ₹15,999); grants content_generation_monthly / automated_content_monthly alongside the pre-existing social_posts / meta_ad_campaigns / whatsapp_contacts / website_maintenance entitlements.';
