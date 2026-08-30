# Real Monthly Audit Allowance

A real, subscription-scoped monthly allowance of 5 free business audits,
built additively on top of the existing `usage_entitlements` engine.

## Why this exists

There were, before this, exactly two real audit concepts in the codebase:

1. A standalone, paid (₹999) `audit_orders` row
   (`lib/audit/ensure-pending-order.ts`).
2. The unconditional free onboarding audit every new signup gets,
   regardless of whether they ever subscribe
   (`app/api/platform/onboarding/route.ts`, `fulfilment_source:
   "product_grant"`).

There was no "N free audits per active subscription, per month" concept —
confirmed by grepping the whole codebase for
`audits_remaining`/`audit_credits`/`AUDIT_ALLOWANCE`/`audit_entitlement`
before building this: zero real matches.

## Design

`lib/audit/audit-entitlement.ts` reuses the real, generic
`usage_entitlements` engine (`packages/payments-and-wallet/src/
entitlements.ts` — `hasEntitlement`/`recordMetricUsage`/
`getEntitlementSummary`, already the billing page's own real
entitlement-summary source) with a new metric, `audit_requests`
(`limit_amount: 5`).

**Deliberately not granted by the Razorpay reconciliation RPCs.** Every
other entitlement metric is granted at payment-fulfilment time inside
`reconcile_and_fulfill_razorpay_payment_v4` /
`reconcile_and_fulfill_razorpay_subscription_charge`. This one is not,
for a real reason beyond avoiding a third same-day change to two
revenue-critical RPCs: the onboarding audit runs *before* a customer has
typically subscribed at all (real flow: signup → onboarding → Brand Brain
→ *then*, separately, `/app/billing`). Granting off a payment event would
miss exactly the case the feature is for.

Instead, `ensureAuditAllowanceCurrent(service, tenantId)` grants/resets the
allowance lazily, keyed off the tenant's own real
`subscriptions.current_period_start`:

- No active subscription → returns `null`, does nothing. The existing,
  unconditional free onboarding audit is completely unaffected.
- Active subscription, no `usage_entitlements` row yet for
  `audit_requests` → creates one (`limit_amount: 5`, `current_usage: 0`).
- Active subscription, existing row whose `updated_at` predates the
  subscription's current real `current_period_start` → the tenant has
  rolled into a new billing period; resets `current_usage` to 0 (never
  invents its own billing calendar).
- Active subscription, row already current for this period → returned
  as-is.

`consumeAuditIfSubscribed(service, tenantId)` calls the above, then
attempts to consume 1 unit via the existing `hasEntitlement`/
`recordMetricUsage` — best-effort, wrapped in try/catch, **never throws**
into the real audit generation it observes.

## Where it's wired

Only the one concrete, unambiguous case the real product flow presents
today: the onboarding audit trigger in
`app/api/platform/onboarding/route.ts`, right before
`start_automatic_audit_generation_v1` runs.

**Deliberately not wired into the general audit-intake re-run flow**
(`app/api/platform/audit/intake/route.ts`) in this pass — that flow's
paid-vs-subscription-included distinction (does a subscriber's free
monthly audit reuse the same `audit_orders`-paid-fee code path with a
₹0 discount, or a wholly separate zero-fee path?) is a real product
decision the brief doesn't specify, and isn't one to guess at for a
financial feature.

## UI

`/app/billing`'s "What you have" card shows "N free business audits this
month · M remaining" using the same natural-language pattern already used
for image-creation and researched-creative allowances — populated
automatically once a `usage_entitlements` row exists for the tenant, via
the existing `GET /api/platform/entitlements` route (no filtering, returns
every real row).

## Schema

Migration `20260830100000_audit_monthly_allowance.sql`: widens
`usage_entitlements_metric_check` to add `'audit_requests'` to the 10
existing allowed values. No new table, no new columns.
