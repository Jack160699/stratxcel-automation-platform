import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  createPaymentLink,
  isPaymentFeatureEnabled,
  getPlanDefinition,
  isProviderManagedSubscription,
  type PlanTier,
} from "@stratxcel/payments-and-wallet";
import {
  createPostgresEmailOutboxStore,
  enqueueSubscriptionRenewalUpcomingEmailsBestEffort,
  filterSubscriptionRenewalUpcomingEmailCandidates,
} from "@stratxcel/email-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal, cron-only endpoint (see vercel.json). Jobs, always in this order:
 *
 *  1. run_subscription_lifecycle_cycle — pure state transitions.
 *  2. Best-effort SUBSCRIPTION_RENEWAL_UPCOMING emails for *active* future renewals only
 *     (filtered separately from payment-link processing candidates — never past_due).
 *  3. For Payment-Link-managed subscriptions renewing within 3 days (or past_due)
 *     without a live renewal link, generate the next period's payment link.
 *
 * Provider-managed Razorpay AutoPay subscriptions are skipped for Payment Link minting —
 * Razorpay charges them. Upcoming-renewal email applies only when status is active,
 * cancel_at_period_end is false, and current_period_end is in the future reminder window.
 * Gated on PAYMENTS_SUBSCRIPTIONS_ENABLED.
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPaymentFeatureEnabled("PAYMENTS_SUBSCRIPTIONS_ENABLED")) {
    return Response.json({ status: "skipped", reason: "subscriptions_disabled" }, { status: 200 });
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  const { data: cycleResult, error: cycleErr } = await serviceDb.rpc("run_subscription_lifecycle_cycle");
  if (cycleErr) {
    console.error("[Subscription Renewal Cron] lifecycle cycle failed", cycleErr);
    return Response.json({ error: `lifecycle cycle failed: ${cycleErr.message}` }, { status: 500 });
  }

  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: candidates, error: candidatesErr } = await serviceDb
    .from("subscriptions")
    .select("*")
    .in("status", ["active", "past_due"])
    .lte("current_period_end", threeDaysFromNow);

  if (candidatesErr) {
    return Response.json({ error: `Failed to load renewal candidates: ${candidatesErr.message}`, lifecycle: cycleResult }, { status: 500 });
  }

  // Payment/recovery candidates may include past_due — do not change that set.
  const processingCandidates = candidates ?? [];
  // Upcoming-renewal email is a separate, stricter filter (active + future window only).
  const upcomingEmailCandidates = filterSubscriptionRenewalUpcomingEmailCandidates(processingCandidates);

  // Best-effort upcoming renewal notices — never affect link minting below.
  try {
    const emailStore = createPostgresEmailOutboxStore(serviceDb);
    await enqueueSubscriptionRenewalUpcomingEmailsBestEffort(serviceDb, emailStore, upcomingEmailCandidates);
  } catch (err) {
    console.error("[Subscription Renewal Cron] renewal-upcoming email failed", err);
  }

  let linksCreated = 0;
  let skippedExisting = 0;
  let skippedProviderManaged = 0;
  const failures: Array<{ subscriptionId: string; error: string }> = [];

  for (const sub of processingCandidates) {
    try {
      // Provider-managed AutoPay: Razorpay charges — never mint a renewal Payment Link.
      if (isProviderManagedSubscription(sub)) {
        skippedProviderManaged += 1;
        continue;
      }

      if (sub.next_renewal_link_id) {
        const { data: existingLink } = await serviceDb.from("payment_links").select("status").eq("id", sub.next_renewal_link_id).maybeSingle();
        if (existingLink?.status === "created") {
          skippedExisting += 1;
          continue;
        }
      }

      let planTier = sub.plan_tier as PlanTier;
      if (sub.pending_plan_tier && (sub.pending_plan_tier === "starter" || sub.pending_plan_tier === "growth" || sub.pending_plan_tier === "business")) {
        planTier = sub.pending_plan_tier;
        await serviceDb
          .from("subscriptions")
          .update({ plan_tier: planTier, pending_plan_tier: null, updated_at: new Date().toISOString() })
          .eq("id", sub.id);
      }

      const plan = getPlanDefinition(planTier);
      if (!plan.priceCents) {
        failures.push({ subscriptionId: sub.id, error: "plan_has_no_fixed_recurring_price" });
        continue;
      }

      const link = await createPaymentLink(serviceDb, {
        tenantId: sub.tenant_id,
        amountCents: plan.priceCents,
        currency: "INR",
        description: `Stratxcel ${plan.publicName} Subscription — Renewal (GST Included)`,
        paymentPurpose: "subscription_payment",
        referenceId: sub.id,
      });

      await serviceDb.from("subscriptions").update({ next_renewal_link_id: link.id, updated_at: new Date().toISOString() }).eq("id", sub.id);
      linksCreated += 1;
    } catch (err) {
      failures.push({ subscriptionId: sub.id, error: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  return Response.json({
    lifecycle: cycleResult,
    renewalCandidates: candidates?.length ?? 0,
    linksCreated,
    skippedExisting,
    skippedProviderManaged,
    failures,
  });
}
