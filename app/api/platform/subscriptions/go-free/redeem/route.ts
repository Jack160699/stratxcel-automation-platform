import { createHash, randomUUID } from "node:crypto";
import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { isPaymentFeatureEnabled, isPlanTier, getSelfServicePlan } from "@stratxcel/payments-and-wallet";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";
import { hashPromoCode, normalizePromoCode, publicPromoMessage } from "@/lib/promo/go-free";
import { enforcePromoRateLimit, promoRateLimitBucket } from "@/lib/promo/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  tenantId?: string;
  planTier?: string;
  promoCode?: string;
}

/**
 * Atomically activates a self-service plan (Starter/Growth/Business) at ₹0 for
 * an approved GoFree test/trial code. Never calls Razorpay, never creates a
 * payment_links/payment_orders row, never counts as revenue — see the
 * redeem_subscription_go_free_code_v1 RPC and its migration for the full
 * commercial-classification contract.
 *
 * The browser may only submit tenantId, planTier, and promoCode. Price,
 * discount, entitlement limits, and eligibility are all resolved and
 * independently re-validated server-side / inside the atomic RPC — nothing
 * about the "100% discount" or "which plan this unlocks" is ever trusted from
 * client input.
 */
export async function POST(request: Request) {
  if (!isPaymentFeatureEnabled("PAYMENTS_SUBSCRIPTIONS_ENABLED")) {
    return Response.json({ error: "Subscription checkout is currently restricted." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const { tenantId, planTier } = body;

  if (!tenantId || !isPlanTier(planTier)) {
    return Response.json({ error: "Invalid tenantId or planTier (starter, growth, business)" }, { status: 400 });
  }

  // Price and plan availability are resolved server-side only — never from client input.
  const plan = getSelfServicePlan(planTier);
  if (!plan) {
    return Response.json({ error: "This plan isn't available for GoFree activation." }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  // Staff accounts (including staff viewing a real customer's workspace) can
  // never grant themselves or a customer a complimentary trial through this
  // customer-facing endpoint — GoFree codes are for approved test accounts
  // acting as themselves, issued and tracked through the admin promo-code
  // surface, not a staff-support side channel.
  const identity = await resolveCanonicalIdentity({ routeSurface: "app" });
  if (identity.state === "INTERNAL_STAFF" || identity.state === "STAFF_VIEWING_CLIENT") {
    return Response.json({ error: "Staff accounts cannot redeem GoFree codes on a customer workspace." }, { status: 403 });
  }

  const normalized = typeof body.promoCode === "string" ? normalizePromoCode(body.promoCode) : "";
  if (!normalized) {
    return Response.json({ error: publicPromoMessage("invalid_code") }, { status: 400 });
  }

  const customerEmail = (ctx.userEmail ?? "").trim().toLowerCase();
  if (!customerEmail) {
    return Response.json({ error: "A verified email address is required." }, { status: 400 });
  }

  const { supabase: service } = getTenantServiceContext();
  const allowed = await enforcePromoRateLimit(service, promoRateLimitBucket(request, "subscription-redeem"));
  if (!allowed) {
    return Response.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const codeHash = hashPromoCode(normalized);
  const idempotencyKey = createHash("sha256")
    .update(`go-free-subscription:${tenantId}:${planTier}:${codeHash}:${customerEmail}`)
    .digest("hex");

  const { data: rpcRes, error: rpcErr } = await service.rpc("redeem_subscription_go_free_code_v1", {
    p_code_hash: codeHash,
    p_expected_tenant_id: tenantId,
    p_plan_tier: planTier,
    p_customer_email: customerEmail,
    p_idempotency_key: idempotencyKey,
    p_actor_user_id: ctx.userId,
    p_price_cents: plan.priceCents,
  });

  if (rpcErr) {
    console.error("go-free subscription redeem rpc failed", rpcErr.message);
    return Response.json({ error: "Could not activate this plan. Please try again." }, { status: 500 });
  }

  const result = rpcRes as {
    success?: boolean;
    reason?: string;
    message?: string;
    subscription_id?: string;
    redemption_id?: string;
    already_redeemed?: boolean;
    plan_tier?: string;
    current_period_end?: string;
  } | null;

  if (!result?.success) {
    return Response.json({ error: result?.message ?? publicPromoMessage(result?.reason) }, { status: 400 });
  }

  return Response.json(
    {
      ok: true,
      complimentary: true,
      fulfilmentSource: "go_free_trial",
      amountDueCents: 0,
      planTier: result.plan_tier ?? planTier,
      subscriptionId: result.subscription_id,
      redemptionId: result.redemption_id,
      alreadyRedeemed: Boolean(result.already_redeemed),
      currentPeriodEnd: result.current_period_end ?? null,
      requestId: randomUUID(),
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
