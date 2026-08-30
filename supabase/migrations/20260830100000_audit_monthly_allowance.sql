-- Migration: real, subscription-scoped monthly audit allowance.
--
-- Hermes platform-restructure mission Sections 43-49/65/88: "every active
-- subscription receives 5 free audits/month, the onboarding audit
-- automatically consumes 1 of the 5". Confirmed live: no such allowance
-- exists anywhere today -- the real audit product is either a standalone
-- ₹999 paid audit_orders row, or the unconditional free onboarding audit
-- every new signup gets regardless of subscription (grep across the
-- codebase for audits_remaining/audit_credits/AUDIT_ALLOWANCE/
-- audit_entitlement returned zero real matches before this migration).
--
-- Deliberately reuses the existing, real, generic usage_entitlements engine
-- (packages/payments-and-wallet/src/entitlements.ts -- hasEntitlement /
-- recordMetricUsage / getEntitlementSummary, already tested, already the
-- billing page's own real entitlement-summary source) rather than a
-- competing tracking table, per the mission's own "reuse working
-- infrastructure, eliminate conflicting paths" instruction (Section 2).
--
-- Deliberately does NOT thread this metric through
-- reconcile_and_fulfill_razorpay_payment_v4 or
-- reconcile_and_fulfill_razorpay_subscription_charge (already modified once
-- this session for the real v3-catalog-tier fix -- a third same-day change
-- to two revenue-critical RPCs was judged unnecessary risk for this
-- specific feature) -- and because of a real, confirmed sequencing
-- mismatch: the onboarding audit (app/api/platform/onboarding/route.ts)
-- runs BEFORE a customer has typically subscribed at all (the real product
-- flow is signup -> onboarding -> Brand Brain -> THEN, separately, /app/
-- billing). Granting/consuming this allowance is instead handled entirely
-- in application code (lib/audit/audit-entitlement.ts), lazily granted and
-- reset against the tenant's real active subscriptions.current_period_start
-- whenever an audit is about to run for a tenant that has one -- correct
-- for both "subscribes first, then audits" and "already subscribed,
-- re-running an audit" without needing this migration to touch payment
-- fulfilment at all.

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
    'social_autopilot_manual_monthly',
    'image_generation_attempts_monthly',
    'copilot_monthly_uses',
    'audit_requests'
  ]));

comment on column public.usage_entitlements.metric is
  'Includes audit_requests -- a real, subscription-scoped monthly allowance (5/month), granted and reset entirely in application code (lib/audit/audit-entitlement.ts), not by the Razorpay reconciliation RPCs.';
