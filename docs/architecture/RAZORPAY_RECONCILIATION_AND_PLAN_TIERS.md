# Razorpay Reconciliation & Plan-Tier Wiring

How a real payment actually becomes an active subscription with real
entitlements, and — critically — every place a new plan tier must be added
for that to keep working. This exact class of gap (a new tier added to the
TS catalog but not to one of the SQL RPCs, or an application-layer tier
map, below) was found live **five times** across two separate
investigations (three in the RPCs/GoFree/billing-UI below; a fourth in
`lib/social/archetype-routing.ts`'s visual-archetype tier mapping,
separately fixed and documented in `PACKAGE_AUTOPILOT_AND_HERMES.md`; a
fifth in the AI-runtime COGS budget tier map, documented further down in
this file); this doc exists so it isn't found a sixth time.

## The real chain

```
POST /api/platform/subscriptions          (checkout: getSelfServicePlan(planTier)
                                             resolves price server-side, creates a
                                             real `subscriptions` row + a real
                                             Razorpay payment link / AutoPay sub)
        ↓ (customer pays, Razorpay fires a webhook)
reconcile_and_fulfill_razorpay_payment_v4              (payment_link.paid)
   — or —
reconcile_and_fulfill_razorpay_subscription_charge     (subscription.charged, AutoPay)
        ↓
activates `subscriptions`, grants every real usage_entitlements row
```

**Both RPCs independently re-derive price and entitlement limits for the
plan tier from a hardcoded `elsif` chain inside the RPC itself** — by
design, defense-in-depth, never trusting a caller-supplied price. This
means the RPCs do not automatically pick up a new plan tier just because
`packages/payments-and-wallet/src/plans.ts` knows about it.

## Real severity found live

The checkout route above already used `getSelfServicePlan(planTier)`
(correctly recognizing the current v3 catalog: `seo`, `social`,
`advanced_seo`, `advanced_social`, `advanced_growth`) and would happily
create a real payment link for any of them. But both RPCs' `elsif` chains
only recognized `starter`/`growth`/`business` — the old v2 catalog. A real
customer paying for a real current plan would have had Razorpay capture
their money, and the RPC would return `unknown_plan_tier` /
`plan_not_self_checkout` — **no active subscription, no entitlements,
money already captured.**

Confirmed via direct query before fixing (migration `20260830090000`):
zero real (non-GoFree) subscriptions existed yet on any v3 tier — caught
before the first real customer could be affected, not after. The exact
same gap existed independently in the GoFree redemption RPCs
(`redeem_subscription_go_free_code_v1` / `validate_subscription_go_free_code_v1`,
fixed in migration `20260830080000`), and had already happened *once*
before for `content_generation_monthly`/`automated_content_monthly`
(migration `20260823140000`, its own commit message: *"a paying
customer's entitlement grant would fail after their payment succeeded"*).

## The checklist: adding a new plan tier

Every one of these must be updated together, or a real customer can pay
and receive nothing:

1. **`packages/payments-and-wallet/src/plans.ts`** — add the
   `PLAN_DEFINITIONS` entry (`priceCents`, `selfServiceCheckout: true`,
   `status: "active"`, `billingType`).
2. **`packages/payments-and-wallet/src/entitlements.ts`** — add the
   `PLAN_LIMITS` entry (all 10 real metric fields).
3. **`usage_entitlements_metric_check`** — only relevant if the new tier
   also introduces a brand-new *metric* (not just a new tier value); the
   tier value itself isn't constrained by this check.
4. **`reconcile_and_fulfill_razorpay_payment_v4`** — add an `elsif
   v_plan_tier = '<tier>' then v_base_price := <cents>; v_limits :=
   <8-element array>;` branch, in the real `v_metrics` order:
   `social_posts, meta_ad_campaigns, whatsapp_contacts,
   website_maintenance, content_generation_monthly,
   automated_content_monthly, social_autopilot_automated_monthly,
   social_autopilot_manual_monthly`.
5. **`reconcile_and_fulfill_razorpay_subscription_charge`** — the same
   branch, in its `v_effective_plan` chain.
6. **`redeem_subscription_go_free_code_v1` /
   `validate_subscription_go_free_code_v1`** — the same price (its
   `v_metrics` array is a 6-element subset — no `social_autopilot_*`
   fields) if the tier should also be GoFree-redeemable.
7. **`app/app/billing/page.tsx`'s `SELF_SERVICE_PLANS`** filter (and
   `GO_FREE_ELIGIBLE_TIERS` if the tier is a real RECURRING self-service
   plan, not a one-time purchase) — so the tier is actually offered/
   redeemable in the UI, not just accepted server-side.
8. **`lib/social/archetype-routing.ts`'s `toArchetypeTier()`** — if the
   tier should get real Social Autopilot visual-archetype access (only
   relevant if it also gets a nonzero `social_autopilot_automated_monthly`/
   `manual_monthly` in step 2).
9. **`packages/ai-runtime/src/policy/task-policies.ts`'s
   `DEFAULT_MONTHLY_BUDGET_USD`** + **`resolveTenantPlanTier`** (in
   `factory.ts`) — the tier's real AI-COGS monthly budget ceiling, once a
   real value is decided (see "A fifth real instance" below — not yet
   fixed for the current v3 catalog).

## How the fix migrations were verified safe

Both RPC migrations (`20260830080000`, `20260830090000`) were `create or
replace function` with the **complete, real, live function body**, fetched
directly via `pg_get_functiondef` immediately beforehand — never
reconstructed from memory or from an earlier migration's own patch
fragments. Before applying, a line-by-line subsequence check confirmed
every real line from the live function still appears, in the same order,
inside the new migration — i.e. the diff is provably additive (new
branches inserted) with zero existing lines altered, removed, or
reordered. This is the pattern to repeat for any future change to either
RPC.

## A fifth real instance, found later: AI-runtime COGS budget tiers

`resolveTenantPlanTier` (`packages/ai-runtime/src/factory.ts`) is a
**different, narrower** `PlanTier` set than the commercial catalog above --
it exists purely to compute a tenant's internal AI-COGS budget ceiling
(`DEFAULT_MONTHLY_BUDGET_USD`, `packages/ai-runtime/src/policy/
task-policies.ts`), which only has `starter | growth | business | scale`
entries. It only recognizes those four legacy values and silently
defaults every real v3 tier (`seo`, `social`, `seo_and_social`,
`advanced_seo`, `advanced_social`, `advanced_growth` -- including
StratXcel's own real, active plan) to `"starter"`, the cheapest budget.

**Confirmed NOT the same severity as the RPCs above** --
`packages/ai-runtime/src/budget/envelope.ts`'s own header comment: *"Internal
COGS guards — not customer token balances."* At `exhausted_100` it still
usually `allowExecution: true` (prefers cheaper models, blocks premium
escalation); only the true worst case (no owner-approved overage, no
reserved-critical budget, no emergency margin) fully blocks. Real but
moderate: a premium-tier customer's generation could get throttled to
cheaper models sooner than intended, not silently lose paid-for access
outright.

**Deliberately not fixed alongside this doc's other four instances** --
unlike the Razorpay/GoFree price and limit values (mechanically derivable
from `PLAN_DEFINITIONS`/`PLAN_LIMITS`, already established elsewhere in
this codebase), the *correct* AI-COGS budget ceiling per v3 tier is a real
product/finance decision (how much should StratXcel's own AI spend be
allowed to reach for an ₹18,498/mo `advanced_growth` customer?) that
isn't something to guess at for a live financial safety mechanism. Add it
to the checklist below as item 8 once those values are decided.

## One-time plans are a separate path

`website_landing_page` and `website_standard` (`billingType: "ONE_TIME"`)
are deliberately **not** in either RPC's `elsif` chain. Both RPCs
unconditionally grant a 30-day recurring period on activation — real
semantics for a subscription, not a one-time purchase. Neither plan card
on `/app/billing` currently has a self-checkout button anyway (both render
"Request activation" → `/contact`), so this is not a currently-reachable
gap; if that ever changes, it needs its own fulfilment path, not a branch
bolted onto these two RPCs.
