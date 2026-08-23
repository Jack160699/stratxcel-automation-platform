-- Fix: usage_entitlements_metric_check never got widened for the two new v2
-- commercial-model entitlement metrics.
--
-- 20260822120000_v2_commercial_model_realignment.sql patched
-- reconcile_and_fulfill_razorpay_payment_v4 and
-- reconcile_and_fulfill_razorpay_subscription_charge (the REAL Razorpay
-- payment reconciliation RPCs) to grant two new metrics --
-- content_generation_monthly and automated_content_monthly -- alongside the
-- pre-existing social_posts / meta_ad_campaigns / whatsapp_contacts /
-- website_maintenance, but never widened usage_entitlements_metric_check to
-- allow those two new values. That migration's own safety comment noted
-- "zero existing subscriptions" at deploy time, so the gap went unnoticed.
--
-- Found live during E2E testing of GoFree subscription activation
-- (redeem_subscription_go_free_code_v1, itself patterned on the same
-- v_metrics array): every attempt to insert a content_generation_monthly or
-- automated_content_monthly row 500'd with "new row for relation
-- usage_entitlements violates check constraint usage_entitlements_metric_check".
-- Because both real-payment RPCs above use the exact same six-metric array,
-- this affects every real Starter/Growth/Business activation via Razorpay
-- too, not just GoFree -- a paying customer's entitlement grant would fail
-- after their payment succeeded.

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
    'automated_content_monthly'
  ]));
