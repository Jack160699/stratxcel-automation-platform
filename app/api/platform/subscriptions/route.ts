import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createPaymentLink, cancelPaymentLink, checkAuditCreditEligibility, isPaymentFeatureEnabled } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_PRICES_CENTS: Record<string, number> = {
  launch: 949900, // ₹9,499.00 / mo (GST Included)
  growth: 1899900, // ₹18,999.00 / mo (GST Included)
  custom_growth: 2399900, // Starting ₹23,999.00 / mo (GST Included)
};

export async function POST(request: Request) {
  if (!isPaymentFeatureEnabled("PAYMENTS_SUBSCRIPTIONS_ENABLED")) {
    return Response.json(
      { error: "Subscription payment checkout is currently restricted for safety certification." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, planTier } = body;

    if (!tenantId || !planTier || !PLAN_PRICES_CENTS[planTier]) {
      return Response.json({ error: "Invalid tenantId or planTier (launch, growth, custom_growth)" }, { status: 400 });
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    // Check provisional 7-day audit credit eligibility (DO NOT consume credit before payment)
    const creditCheck = await checkAuditCreditEligibility(serviceDb, tenantId);
    const basePriceCents = PLAN_PRICES_CENTS[planTier];
    const discountCents = creditCheck.eligible ? creditCheck.creditAmountCents : 0;
    const finalPriceCents = Math.max(0, basePriceCents - discountCents);

    // 1. Create subscription in pending_payment state with explicit NULL dates and 0 paid_months_count
    const { data: subscription, error: subErr } = await serviceDb
      .from("subscriptions")
      .insert({
        tenant_id: tenantId,
        plan_tier: planTier,
        price_cents: finalPriceCents,
        audit_credit_applied_cents: discountCents,
        audit_order_id: creditCheck.eligible ? creditCheck.auditOrderId : null,
        status: "pending_payment",
        current_period_start: null,
        current_period_end: null,
        paid_months_count: 0,
        activated_at: null,
        entitlements_granted_at: null,
        fulfilment_status: "awaiting_payment",
      })
      .select("*")
      .single();

    if (subErr || !subscription) {
      return Response.json({ error: `Failed to create pending subscription: ${subErr?.message}` }, { status: 500 });
    }

    // 2. Create Razorpay payment link with mandatory payment_purpose = "subscription_payment"
    let link;
    try {
      link = await createPaymentLink(serviceDb, {
        tenantId,
        amountCents: finalPriceCents,
        currency: "INR",
        description: `Stratxcel ${planTier.toUpperCase()} Subscription (GST Included)`,
        paymentPurpose: "subscription_payment",
        referenceId: subscription.id,
      });
    } catch (linkErr) {
      // Payment link creation failed — mark subscription as payment_failed
      await serviceDb
        .from("subscriptions")
        .update({ status: "payment_failed", fulfilment_status: "payment_link_creation_failed", updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
      const linkMsg = linkErr instanceof Error ? linkErr.message : "Failed to create payment link";
      return Response.json({ error: `Subscription created but payment link failed: ${linkMsg}` }, { status: 502 });
    }

    // 3. Persist payment link reference on subscription record
    const { error: linkUpdateErr } = await serviceDb
      .from("subscriptions")
      .update({ payment_link_id: link.id })
      .eq("id", subscription.id);

    if (linkUpdateErr) {
      // Linking failed — compensate: cancel Razorpay link, mark subscription reconciliation_required
      try {
        await cancelPaymentLink(serviceDb, { linkId: link.id, tenantId });
      } catch {
        // Best-effort compensation — manual review required
      }
      await serviceDb
        .from("subscriptions")
        .update({ status: "payment_failed", fulfilment_status: "reconciliation_required", updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
      return Response.json({ error: "Failed to link payment to subscription. Razorpay link cancelled." }, { status: 500 });
    }

    return Response.json({
      subscription: { ...subscription, payment_link_id: link.id },
      auditCreditProvisional: creditCheck.eligible ? creditCheck.creditAmountCents / 100 : 0,
      paymentLink: link,
      paymentUrl: link.short_url,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create subscription";
    return Response.json({ error: msg }, { status: 400 });
  }
}
