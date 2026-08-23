import { requireTenantContext, requireTenantReadContext, requireTenantReadPermission, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  createPaymentLink,
  cancelPaymentLink,
  checkAuditCreditEligibility,
  isPaymentFeatureEnabled,
  getPlanDefinition,
  getSelfServicePlan,
  isPlanTier,
  upsertBillingProfile,
  getBillingProfile,
  listInvoicesForTenant,
  createRazorpaySubscription,
  isProviderManagedSubscription,
  resolveRecurringAuditCreditHandling,
} from "@stratxcel/payments-and-wallet";
import { splitGstInclusive } from "@/lib/payments/gst";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GstInvoiceDetails {
  legalBusinessName?: string;
  gstin?: string;
  billingAddress?: string;
  billingState?: string;
  pinCode?: string;
}

export async function POST(request: Request) {
  if (!isPaymentFeatureEnabled("PAYMENTS_SUBSCRIPTIONS_ENABLED")) {
    return Response.json(
      { error: "Subscription payment checkout is currently restricted for safety certification." },
      { status: 503 }
    );
  }

  const useRecurring = isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED");

  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, planTier, gstInvoice } = body as { tenantId?: string; planTier?: string; gstInvoice?: GstInvoiceDetails };

    if (!tenantId || !isPlanTier(planTier)) {
      return Response.json({ error: "Invalid tenantId or planTier (starter, growth, business)" }, { status: 400 });
    }

    // Price and plan availability are resolved server-side only — never from client input.
    const plan = getSelfServicePlan(planTier);
    if (!plan) {
      return Response.json(
        {
          error:
            "This plan is not available through self-service checkout. Scale / Custom is a tailored plan — please request a quote and our team will confirm pricing with you directly.",
          contactRequired: true,
        },
        { status: 400 }
      );
    }

    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    const { supabase: serviceDb } = getTenantServiceContext();

    if (gstInvoice) {
      try {
        await upsertBillingProfile(
          serviceDb,
          tenantId,
          {
            legalBusinessName: gstInvoice.legalBusinessName,
            gstin: gstInvoice.gstin,
            billingAddress: gstInvoice.billingAddress,
            billingState: gstInvoice.billingState,
            pinCode: gstInvoice.pinCode,
          },
          ctx.userId
        );
      } catch (profileErr) {
        const msg = profileErr instanceof Error ? profileErr.message : "Invalid GST invoice details";
        return Response.json({ error: msg }, { status: 400 });
      }
    }

    // Check provisional 7-day audit credit eligibility (DO NOT consume credit before payment)
    const creditCheck = await checkAuditCreditEligibility(serviceDb, tenantId);
    const basePriceCents = plan.priceCents!;

    // Recurring AutoPay cannot silently discount a fixed Razorpay Plan amount.
    // Offer path: provider-verifiable first-charge discount. Else: defer ₹999 as wallet credit after activation.
    const recurringCredit = useRecurring
      ? resolveRecurringAuditCreditHandling({
          eligible: creditCheck.eligible,
          creditAmountCents: creditCheck.creditAmountCents,
          catalogPriceCents: basePriceCents,
        })
      : null;

    const discountCents = useRecurring
      ? recurringCredit!.auditCreditAppliedCents
      : creditCheck.eligible
        ? creditCheck.creditAmountCents
        : 0;
    const deferredCreditCents = useRecurring ? recurringCredit!.auditCreditDeferredCents : 0;
    const finalPriceCents = useRecurring
      ? recurringCredit!.chargePriceCents
      : Math.max(0, basePriceCents - discountCents);

    // 1. Create subscription in pending_payment state with explicit NULL dates and 0 paid_months_count
    const { data: subscription, error: subErr } = await serviceDb
      .from("subscriptions")
      .insert({
        tenant_id: tenantId,
        plan_tier: planTier,
        price_cents: finalPriceCents,
        audit_credit_applied_cents: discountCents,
        audit_credit_deferred_cents: deferredCreditCents,
        audit_order_id: creditCheck.eligible ? creditCheck.auditOrderId : null,
        status: "pending_payment",
        current_period_start: null,
        current_period_end: null,
        paid_months_count: 0,
        activated_at: null,
        entitlements_granted_at: null,
        fulfilment_status: "awaiting_payment",
        billing_provider: useRecurring ? "razorpay_subscription" : "razorpay_payment_link",
        provider_offer_id: recurringCredit?.offerId ?? null,
      })
      .select("*")
      .single();

    if (subErr || !subscription) {
      return Response.json({ error: `Failed to create pending subscription: ${subErr?.message}` }, { status: 500 });
    }

    if (useRecurring) {
      let providerSub;
      try {
        providerSub = await createRazorpaySubscription(serviceDb, {
          tenantId,
          subscriptionId: subscription.id,
          planTier,
          offerId: recurringCredit!.offerId,
          expectedFirstChargeCents: finalPriceCents,
        });
      } catch (subCreateErr) {
        await serviceDb
          .from("subscriptions")
          .update({
            status: "payment_failed",
            fulfilment_status: "provider_subscription_creation_failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
        const msg = subCreateErr instanceof Error ? subCreateErr.message : "Failed to create Razorpay subscription";
        return Response.json({ error: `Subscription created but AutoPay setup failed: ${msg}` }, { status: 502 });
      }

      const { error: providerUpdateErr } = await serviceDb
        .from("subscriptions")
        .update({
          provider_subscription_id: providerSub.providerSubscriptionId,
          provider_plan_id: providerSub.providerPlanId,
          provider_status: providerSub.providerStatus,
          provider_short_url: providerSub.shortUrl,
          provider_offer_id: providerSub.offerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);

      if (providerUpdateErr) {
        await serviceDb
          .from("subscriptions")
          .update({
            status: "payment_failed",
            fulfilment_status: "reconciliation_required",
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
        return Response.json({ error: "Failed to persist Razorpay subscription reference." }, { status: 500 });
      }

      return Response.json({
        subscription: {
          ...subscription,
          billing_provider: "razorpay_subscription",
          provider_subscription_id: providerSub.providerSubscriptionId,
          provider_plan_id: providerSub.providerPlanId,
          provider_status: providerSub.providerStatus,
          provider_short_url: providerSub.shortUrl,
          provider_offer_id: providerSub.offerId,
          audit_credit_deferred_cents: deferredCreditCents,
        },
        auditCreditProvisional: creditCheck.eligible ? creditCheck.creditAmountCents / 100 : 0,
        auditCreditMode: recurringCredit!.creditMode,
        priceBreakdown: splitGstInclusive(finalPriceCents),
        paymentUrl: providerSub.shortUrl,
        billingMode: "razorpay_subscription",
      });
    }

    // Legacy one-time Payment Link path (only when recurring gate is off)
    let link;
    try {
      link = await createPaymentLink(serviceDb, {
        tenantId,
        amountCents: finalPriceCents,
        currency: "INR",
        description: `Stratxcel ${plan.publicName} Subscription (GST Included)`,
        paymentPurpose: "subscription_payment",
        referenceId: subscription.id,
      });
    } catch (linkErr) {
      await serviceDb
        .from("subscriptions")
        .update({ status: "payment_failed", fulfilment_status: "payment_link_creation_failed", updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
      const linkMsg = linkErr instanceof Error ? linkErr.message : "Failed to create payment link";
      return Response.json({ error: `Subscription created but payment link failed: ${linkMsg}` }, { status: 502 });
    }

    const { error: linkUpdateErr } = await serviceDb
      .from("subscriptions")
      .update({ payment_link_id: link.id })
      .eq("id", subscription.id);

    if (linkUpdateErr) {
      try {
        await cancelPaymentLink(serviceDb, { linkId: link.id, tenantId });
      } catch {
        // Best-effort compensation
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
      priceBreakdown: splitGstInclusive(finalPriceCents),
      paymentLink: link,
      paymentUrl: link.short_url,
      billingMode: "razorpay_payment_link",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create subscription";
    return Response.json({ error: msg }, { status: 400 });
  }
}

/**
 * Current subscription + billing state for the billing page. Reads only — never a
 * source of entitlement truth (that stays server-side/RPC-derived elsewhere).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requireTenantReadPermission(ctx, "wallet:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  const [
    { data: subscription },
    billingProfile,
    invoices,
  ] = await Promise.all([
    serviceDb
      .from("subscriptions")
      .select("id, plan_tier, price_cents, status, current_period_start, current_period_end, cancel_at_period_end, pending_plan_tier, grace_period_end, billing_provider, provider_status, provider_short_url, next_charge_at, last_charged_at, payment_link_id, next_renewal_link_id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getBillingProfile(serviceDb, tenantId),
    listInvoicesForTenant(serviceDb, tenantId),
  ]);

  let paymentUrl: string | null = null;
  if (subscription && isProviderManagedSubscription(subscription)) {
    if (
      (subscription.status === "pending_payment" || subscription.status === "past_due" || subscription.provider_status === "halted") &&
      subscription.provider_short_url
    ) {
      paymentUrl = subscription.provider_short_url;
    }
  } else if (subscription?.status === "pending_payment" && subscription.payment_link_id) {
    const { data: link } = await serviceDb.from("payment_links").select("short_url, status").eq("id", subscription.payment_link_id).maybeSingle();
    if (link?.status === "created") paymentUrl = link.short_url;
  } else if (subscription?.status === "past_due" && subscription.next_renewal_link_id) {
    const { data: link } = await serviceDb.from("payment_links").select("short_url, status").eq("id", subscription.next_renewal_link_id).maybeSingle();
    if (link?.status === "created") paymentUrl = link.short_url;
  }

  return Response.json(
    {
      subscription: subscription ?? null,
      planDefinition: getPlanDefinition(isPlanTier(subscription?.plan_tier) ? subscription.plan_tier : "free"),
      // splitGstInclusive() deliberately throws on 0 (see
      // audit-payment-safety.test.ts: "zero is not a valid charge") -- a
      // correct guard for real payment/charge call sites, but a legitimate
      // ₹0 GoFree trial subscription (price_cents: 0) is not a charge at
      // all. Found live during E2E testing: every GET here 500'd for any
      // tenant on an active go_free_trial subscription. There is nothing
      // meaningful to break a ₹0 price into, so priceBreakdown is simply
      // null for a free subscription, same as no subscription at all.
      priceBreakdown: subscription && subscription.price_cents > 0 ? splitGstInclusive(subscription.price_cents) : null,
      paymentUrl,
      billingProfile,
      invoices: invoices.slice(0, 12),
      recurringEnabled: isPaymentFeatureEnabled("PAYMENTS_RECURRING_SUBSCRIPTIONS_ENABLED"),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
