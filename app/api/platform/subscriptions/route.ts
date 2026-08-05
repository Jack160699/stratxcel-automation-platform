import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createPaymentLink, checkAuditCreditEligibility, applyAuditCreditToSubscription } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_PRICES_CENTS: Record<string, number> = {
  launch: 949900, // ₹9,499.00 / mo
  growth: 1899900, // ₹18,999.00 / mo
  custom_growth: 2399900, // Starting ₹23,999.00 / mo
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, planTier } = body;

    if (!tenantId || !planTier || !PLAN_PRICES_CENTS[planTier]) {
      return Response.json({ error: "Invalid tenantId or planTier (launch, growth, custom_growth)" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    // Check 7-day audit credit eligibility
    const creditCheck = await checkAuditCreditEligibility(serviceDb, tenantId);
    const basePriceCents = PLAN_PRICES_CENTS[planTier];
    const discountCents = creditCheck.eligible ? creditCheck.creditAmountCents : 0;
    const finalPriceCents = Math.max(0, basePriceCents - discountCents);

    // Create subscription record
    const { data: subscription, error: subErr } = await serviceDb
      .from("subscriptions")
      .insert({
        tenant_id: tenantId,
        plan_tier: planTier,
        price_cents: finalPriceCents,
        audit_credit_applied_cents: discountCents,
        audit_order_id: creditCheck.auditOrderId,
        status: "active",
      })
      .select("*")
      .single();

    if (subErr) {
      return Response.json({ error: `Failed to create subscription: ${subErr.message}` }, { status: 500 });
    }

    if (creditCheck.eligible && creditCheck.auditOrderId && subscription?.id) {
      await applyAuditCreditToSubscription(serviceDb, creditCheck.auditOrderId, subscription.id);
    }

    // Create Razorpay payment link with payment_purpose = 'subscription_payment'
    const link = await createPaymentLink(serviceDb, {
      tenantId,
      amountCents: finalPriceCents,
      currency: "INR",
      description: `Stratxcel ${planTier.toUpperCase()} Subscription (GST Included)`,
      paymentPurpose: "subscription_payment",
    });

    return Response.json({
      subscription,
      auditCreditApplied: creditCheck.eligible ? 999 : 0,
      paymentLink: link,
      paymentUrl: link.short_url,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create subscription";
    return Response.json({ error: msg }, { status: 400 });
  }
}
