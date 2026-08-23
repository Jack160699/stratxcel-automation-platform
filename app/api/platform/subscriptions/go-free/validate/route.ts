import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { isPaymentFeatureEnabled, isPlanTier, getSelfServicePlan } from "@stratxcel/payments-and-wallet";
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
 * Preview-only: does this GoFree code + plan combination resolve to a valid,
 * zero-payable activation? Never mutates anything. Discount/price are always
 * server-resolved from the canonical plan catalog (packages/payments-and-wallet),
 * never from client input — a browser can only submit tenantId, planTier, and
 * promoCode.
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

  // Price/availability resolved server-side only — Free/Scale/legacy tiers never
  // reach the RPC at all.
  const plan = getSelfServicePlan(planTier);
  if (!plan) {
    return Response.json({ error: "This plan isn't available for GoFree activation." }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const normalized = typeof body.promoCode === "string" ? normalizePromoCode(body.promoCode) : "";
  if (!normalized) {
    return Response.json({ error: publicPromoMessage("invalid_code") }, { status: 400 });
  }

  const { supabase: service } = getTenantServiceContext();
  const allowed = await enforcePromoRateLimit(service, promoRateLimitBucket(request, "subscription-validate"));
  if (!allowed) {
    return Response.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const codeHash = hashPromoCode(normalized);
  const { data: rpcRes, error: rpcErr } = await service.rpc("validate_subscription_go_free_code_v1", {
    p_code_hash: codeHash,
    p_plan_tier: planTier,
    p_customer_email: ctx.userEmail ?? null,
  });

  if (rpcErr) {
    console.error("go-free subscription validate rpc failed", rpcErr.message);
    return Response.json({ error: "Could not validate this code. Please try again." }, { status: 500 });
  }

  const result = rpcRes as {
    valid?: boolean;
    reason?: string;
    message?: string;
    list_price_cents?: number;
    discount_cents?: number;
    amount_due_cents?: number;
  } | null;

  if (!result?.valid) {
    return Response.json({ valid: false, error: result?.message ?? publicPromoMessage(result?.reason) }, { status: 400 });
  }

  return Response.json(
    {
      valid: true,
      planTier,
      planName: plan.publicName,
      listPriceCents: result.list_price_cents ?? plan.priceCents,
      discountCents: result.discount_cents ?? plan.priceCents,
      amountDueCents: 0,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
