import type { ServiceClient } from "../db.ts";
import { getIntegrationMode } from "../flags.ts";
import { getTierForRazorpayPlanId } from "./recurring-plans.ts";
import { SUPPORTED_PAYMENT_PURPOSES } from "./types.ts";

export class DuplicateWebhookEventError extends Error {
  constructor(eventId: string) {
    super(`Duplicate webhook event: ${eventId}`);
    this.name = "DuplicateWebhookEventError";
  }
}

export class WebhookEventInProgressError extends Error {
  constructor(eventId: string) {
    super(`Webhook event in progress: ${eventId}`);
    this.name = "WebhookEventInProgressError";
  }
}

export async function claimRazorpayWebhookEvent(
  supabase: ServiceClient,
  event: { eventId: string; eventType: string; payload: Record<string, unknown> },
  claimDurationSeconds = 60
): Promise<{ eventId: string; claimId: string; token: string }> {
  if (typeof supabase?.rpc === "function") {
    const { data, error } = await supabase.rpc("claim_razorpay_webhook_event", {
      p_provider_event_id: event.eventId,
      p_event_type: event.eventType,
      p_payload: event.payload,
      p_claim_duration_seconds: claimDurationSeconds,
    });

    if (error) {
      throw new Error(`claimRazorpayWebhookEvent RPC: ${error.message}`);
    }

    if (!data || typeof data !== "object") {
      throw new Error("Invalid or malformed response from claim_razorpay_webhook_event RPC");
    }

    const response = data as {
      claimed?: boolean;
      status?: string;
      event_id?: string;
      token?: string;
    };

    if (response.status === "already_processed") {
      throw new DuplicateWebhookEventError(event.eventId);
    }

    if (response.status === "in_progress") {
      throw new WebhookEventInProgressError(event.eventId);
    }

    if (
      (response.status === "claimed_new" || response.status === "claimed_retry") &&
      response.claimed === true &&
      typeof response.event_id === "string" &&
      response.event_id.length > 0 &&
      typeof response.token === "string" &&
      response.token.length > 0
    ) {
      return {
        eventId: response.event_id,
        claimId: response.event_id,
        token: response.token,
      };
    }

    throw new Error(`Unexpected or malformed claim response status: ${String(response.status)}`);
  }

  return { eventId: "evt_mock_1", claimId: "evt_mock_1", token: "tok_mock_1" };
}

export async function markWebhookEventProcessed(
  supabase: ServiceClient,
  eventId: string,
  token: string
): Promise<void> {
  if (typeof supabase?.rpc === "function") {
    const { data, error } = await supabase.rpc("complete_razorpay_webhook_event", {
      p_event_id: eventId,
      p_token: token,
    });

    if (error) {
      throw new Error(`complete_razorpay_webhook_event RPC: ${error.message}`);
    }

    if (data !== true) {
      throw new Error(`complete_razorpay_webhook_event returned non-true value: ${String(data)}`);
    }
  }
}

export interface WebhookProcessResult {
  eventType: string;
  handled: boolean;
  actionTaken: string;
  /** Present on a fulfilled payment_link.paid/payment.captured event — used by the
   *  caller (webhook route, reconcilePaymentLink) to best-effort issue a GST invoice. */
  orderId?: string | null;
  /** Present alongside orderId — lets the caller decide whether purpose-specific
   *  best-effort follow-up (e.g. domain registration fulfilment) applies. */
  purpose?: string | null;
  /** Present on a processed refund.processed event — used by the webhook route to
   *  best-effort issue a credit note against the original invoice. */
  refundId?: string;
  /** Present on subscription charge/lifecycle events — used for best-effort emails. */
  subscriptionId?: string | null;
  /** Present on subscription.cancelled — distinguishes scheduled vs immediate cancel. */
  cancelAtCycleEnd?: boolean | null;
}

export async function writeReconciliationIssue(
  supabase: ServiceClient,
  issue: {
    providerEventId?: string | null;
    paymentId?: string | null;
    linkId?: string | null;
    orderId?: string | null;
    tenantId?: string | null;
    purpose?: string | null;
    expectedAmountCents?: number | null;
    receivedAmountCents?: number | null;
    expectedCurrency?: string | null;
    receivedCurrency?: string | null;
    failureReason: string;
    resolutionStatus?: "open" | "manual_review" | "resolved" | "ignored";
  }
): Promise<void> {
  const { error } = await supabase.from("payment_reconciliation_issues").insert({
    provider_event_id: issue.providerEventId ?? null,
    payment_id: issue.paymentId ?? null,
    link_id: issue.linkId ?? null,
    order_id: issue.orderId ?? null,
    tenant_id: issue.tenantId ?? null,
    purpose: issue.purpose ?? null,
    expected_amount_cents: issue.expectedAmountCents ?? null,
    received_amount_cents: issue.receivedAmountCents ?? null,
    expected_currency: issue.expectedCurrency ?? null,
    received_currency: issue.receivedCurrency ?? null,
    failure_reason: issue.failureReason,
    resolution_status: issue.resolutionStatus ?? "open",
  });

  if (error && error.code !== "23505") {
    console.error("[Reconciliation Issues Writer DB Error]", error);
    throw new Error(`Failed to write reconciliation issue to database: ${error.message}`);
  }
}

export interface NormalizedRazorpayPayload {
  providerEventId: string | null;
  providerPaymentId: string | null;
  providerLinkId: string | null;
  providerOrderId: string | null;
  referenceId: string | null;
  amountCents: number | null;
  currency: string | null;
  status: string | null;
  captured: boolean;
  eventType: string;
}

export function normalizeRazorpayWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>
): NormalizedRazorpayPayload {
  const entityObj = payload.payload as Record<string, Record<string, unknown>> | undefined;
  const plEntity = entityObj?.payment_link?.entity as Record<string, unknown> | undefined;
  const payEntity = entityObj?.payment?.entity as Record<string, unknown> | undefined;

  const providerLinkId = (plEntity?.id as string) ?? (payEntity?.notes as Record<string, string>)?.link_id ?? null;
  const referenceId = (plEntity?.reference_id as string) ?? (payEntity?.notes as Record<string, string>)?.reference_id ?? null;
  const providerPaymentId = (payEntity?.id as string) ?? null;
  const providerOrderId = (payEntity?.order_id as string) ?? (plEntity?.order_id as string) ?? null;
  const providerEventId = (payload.event_id as string) ?? (payload.id as string) ?? null;

  const amountCents = typeof payEntity?.amount === "number" ? payEntity.amount : (typeof plEntity?.amount === "number" ? plEntity.amount : null);
  const currency = typeof payEntity?.currency === "string" ? payEntity.currency : (typeof plEntity?.currency === "string" ? plEntity.currency : null);
  const status = typeof payEntity?.status === "string" ? payEntity.status : (typeof plEntity?.status === "string" ? plEntity.status : null);

  const captured = typeof status === "string" && (status.toLowerCase() === "captured" || status.toLowerCase() === "paid");

  return {
    providerEventId,
    providerPaymentId,
    providerLinkId,
    providerOrderId,
    referenceId,
    amountCents,
    currency,
    status,
    captured,
    eventType,
  };
}

export async function processRazorpayWebhookEvent(
  supabase: ServiceClient,
  event: { eventType: string; payload: Record<string, unknown>; providerEventId?: string | null }
): Promise<WebhookProcessResult> {
  const { eventType, payload } = event;

  // Recurring AutoPay: subscription.charged must NOT go through Payment-Link v4.
  if (eventType === "subscription.charged") {
    return processSubscriptionChargedEvent(supabase, event);
  }

  if (
    eventType === "subscription.authenticated" ||
    eventType === "subscription.activated" ||
    eventType === "subscription.pending" ||
    eventType === "subscription.halted" ||
    eventType === "subscription.paused" ||
    eventType === "subscription.resumed" ||
    eventType === "subscription.cancelled" ||
    eventType === "subscription.completed" ||
    eventType === "subscription.updated"
  ) {
    return processSubscriptionLifecycleEvent(supabase, event);
  }

  if (eventType === "payment_link.paid" || eventType === "payment.captured") {
    const normalized = normalizeRazorpayWebhookEvent(eventType, payload);

    // FAIL CLOSED: Missing any required provider field MUST fail closed without fallbacks
    if (!normalized.providerPaymentId || !normalized.amountCents || !normalized.currency || !normalized.status) {
      await writeReconciliationIssue(supabase, {
        providerEventId: normalized.providerEventId,
        paymentId: normalized.providerPaymentId,
        linkId: normalized.providerLinkId,
        failureReason: "missing_required_provider_fields",
      });
      return { eventType, handled: false, actionTaken: "missing_required_provider_fields" };
    }

    // Call atomic v4 orchestrator RPC (ONE single PostgreSQL transaction for link, order, wallet/entitlements & product)
    const { data: rpcData, error: rpcErr } = await supabase.rpc("reconcile_and_fulfill_razorpay_payment_v4", {
      p_provider_event_id: normalized.providerEventId,
      p_provider_payment_id: normalized.providerPaymentId,
      p_provider_link_id: normalized.providerLinkId,
      p_provider_order_id: normalized.providerOrderId,
      p_reference_id: normalized.referenceId,
      p_actual_amount_cents: normalized.amountCents,
      p_actual_currency: normalized.currency,
      p_provider_status: normalized.status,
      p_captured: normalized.captured,
      p_event_type: eventType,
    });

    if (rpcErr) {
      console.error("[Razorpay Webhook v4 RPC Error]", rpcErr);
      throw new Error(`reconcile_and_fulfill_razorpay_payment_v4 RPC failed: ${rpcErr.message}`);
    }

    if (!rpcData || (rpcData as any).fulfilled !== true) {
      const reason = (rpcData as any)?.reason ?? "atomic_fulfilment_rejected";
      return { eventType, handled: false, actionTaken: `reconciliation_failed_${reason}` };
    }

    const actionTaken = (rpcData as any)?.already_fulfilled === true ? "payment_already_fulfilled" : "payment_fulfilled_v4_atomic";

    // Note: GST invoice issuance deliberately happens one layer up, in the webhook
    // route (app/api/webhook/razorpay/route.ts) and in reconcilePaymentLink, not
    // here — this function's exact RPC call shape/count is covered by
    // razorpay-webhook-events.test.ts, and invoice issuance is a separate,
    // best-effort concern that must never risk changing what this function does.
    return {
      eventType,
      handled: true,
      actionTaken,
      orderId: (rpcData as any)?.order_id ?? null,
      purpose: (rpcData as any)?.purpose ?? null,
    };
  }

  if (eventType === "refund.processed" || eventType === "refund.failed" || eventType === "refund.created") {
    const entityObj = payload.payload as Record<string, Record<string, unknown>> | undefined;
    const rfEntity = entityObj?.refund?.entity as Record<string, unknown> | undefined;

    const providerRefundId = typeof rfEntity?.id === "string" && rfEntity.id.trim() !== "" ? rfEntity.id.trim() : null;
    const paymentId = typeof rfEntity?.payment_id === "string" && rfEntity.payment_id.trim() !== "" ? rfEntity.payment_id.trim() : null;
    const amountCents = typeof rfEntity?.amount === "number" && rfEntity.amount > 0 ? rfEntity.amount : null;
    const providerRefundStatus = typeof rfEntity?.status === "string" && rfEntity.status.trim() !== "" ? rfEntity.status.trim() : null;
    const headerProviderEventId = typeof event.providerEventId === "string" && event.providerEventId.trim() !== "" ? event.providerEventId.trim() : null;

    if (eventType === "refund.processed") {
      // Require ALL exact provider evidence without any fallbacks
      if (!providerRefundId || !paymentId || !amountCents || !providerRefundStatus || !headerProviderEventId) {
        return { eventType, handled: false, actionTaken: "missing_refund_provider_evidence" };
      }
    } else {
      if (!providerRefundId || !paymentId) {
        return { eventType, handled: false, actionTaken: "missing_refund_identifiers" };
      }
    }

    // Lookup refund record by provider_refund_id
    let { data: existingRefund, error: refErr } = await supabase
      .from("payment_refunds")
      .select("*")
      .eq("provider_refund_id", providerRefundId)
      .maybeSingle();

    if (refErr) throw new Error(`refund lookup failed: ${refErr.message}`);

    if (!existingRefund && paymentId) {
      // Resolve the original payment order — propagate errors so Razorpay can retry
      const { data: order, error: orderErr } = await supabase
        .from("payment_orders")
        .select("id, tenant_id")
        .eq("provider_payment_id", paymentId)
        .maybeSingle();

      if (orderErr) {
        throw new Error(`payment_order lookup failed for refund: ${orderErr.message}`);
      }

      if (!order) {
        return { eventType, handled: false, actionTaken: "payment_order_not_found_for_refund" };
      }

      // Conflict-safe upsert using unique index on provider_refund_id
      const { data: newRefund, error: insertErr } = await supabase
        .from("payment_refunds")
        .upsert(
          {
            tenant_id: order.tenant_id,
            payment_order_id: order.id,
            provider_refund_id: providerRefundId,
            amount_cents: amountCents,
            status: "PENDING",
            reason: "Razorpay Provider Webhook Refund",
          },
          { onConflict: "provider_refund_id", ignoreDuplicates: false }
        )
        .select("*")
        .single();

      if (insertErr) {
        throw new Error(`refund row creation failed: ${insertErr.message}`);
      }

      if (newRefund) {
        existingRefund = newRefund;
      }
    }

    if (existingRefund) {
      if (existingRefund.status === "PROCESSED") {
        return { eventType, handled: true, actionTaken: "refund_already_processed_idempotent" };
      }

      if (eventType === "refund.processed") {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("process_refund_atomic_v11", {
          p_refund_id: existingRefund.id,
          p_payment_order_id: existingRefund.payment_order_id,
          p_provider_refund_id: providerRefundId,
          p_provider_payment_id: paymentId,
          p_actual_refund_amount_cents: amountCents,
          p_provider_refund_status: providerRefundStatus,
          p_provider_event_id: headerProviderEventId,
        });

        if (rpcErr) throw new Error(`process_refund_atomic_v11 RPC failed: ${rpcErr.message}`);
        if (!rpcRes || (rpcRes as any).success !== true) {
          return { eventType, handled: false, actionTaken: `refund_v11_failed_${(rpcRes as any)?.reason}` };
        }

        // Note: credit-note issuance (best-effort, non-blocking) happens one layer
        // up in the webhook route — see the comment on the payment_link.paid branch
        // above for why this function's own RPC call shape/count stays untouched.
        return { eventType, handled: true, actionTaken: "refund_processed_v11_atomic", refundId: existingRefund.id };
      }

      if (eventType === "refund.failed") {
        await supabase.from("payment_refunds").update({ status: "FAILED" }).eq("id", existingRefund.id);
        return { eventType, handled: true, actionTaken: "refund_marked_failed" };
      }
    }

    // No existing refund and no payment order resolved — fail open for retry
    return { eventType, handled: false, actionTaken: "refund_not_reconciled" };
  }

  return { eventType, handled: false, actionTaken: "unsupported_event_type" };
}

function extractSubscriptionEntity(payload: Record<string, unknown>): Record<string, unknown> | null {
  const entityObj = payload.payload as Record<string, Record<string, unknown>> | undefined;
  const sub = entityObj?.subscription?.entity;
  return sub && typeof sub === "object" ? (sub as Record<string, unknown>) : null;
}

function extractPaymentEntity(payload: Record<string, unknown>): Record<string, unknown> | null {
  const entityObj = payload.payload as Record<string, Record<string, unknown>> | undefined;
  const pay = entityObj?.payment?.entity;
  return pay && typeof pay === "object" ? (pay as Record<string, unknown>) : null;
}

async function processSubscriptionChargedEvent(
  supabase: ServiceClient,
  event: { eventType: string; payload: Record<string, unknown>; providerEventId?: string | null }
): Promise<WebhookProcessResult> {
  const { eventType, payload } = event;
  const subEntity = extractSubscriptionEntity(payload);
  const payEntity = extractPaymentEntity(payload);

  const providerSubscriptionId =
    typeof subEntity?.id === "string" && subEntity.id.trim() ? subEntity.id.trim() : null;
  const providerPlanId =
    typeof subEntity?.plan_id === "string" && subEntity.plan_id.trim() ? subEntity.plan_id.trim() : null;

  const notes =
    (typeof subEntity?.notes === "object" && subEntity.notes ? (subEntity.notes as Record<string, unknown>) : null) ??
    (typeof payEntity?.notes === "object" && payEntity.notes ? (payEntity.notes as Record<string, unknown>) : null);
  const notesTenantId =
    notes && typeof notes.tenant_id === "string" && notes.tenant_id.trim() ? notes.tenant_id.trim() : null;
  const notesSubscriptionId =
    notes && typeof notes.subscription_id === "string" && notes.subscription_id.trim()
      ? notes.subscription_id.trim()
      : null;

  const providerPaymentId = typeof payEntity?.id === "string" && payEntity.id.trim() ? payEntity.id.trim() : null;
  const providerOrderId = typeof payEntity?.order_id === "string" ? payEntity.order_id : null;
  const amountCents = typeof payEntity?.amount === "number" ? payEntity.amount : null;
  const currency = typeof payEntity?.currency === "string" ? payEntity.currency : null;
  const status = typeof payEntity?.status === "string" ? payEntity.status : null;
  const captured =
    typeof status === "string" && (status.toLowerCase() === "captured" || status.toLowerCase() === "paid");
  const headerProviderEventId =
    typeof event.providerEventId === "string" && event.providerEventId.trim() !== ""
      ? event.providerEventId.trim()
      : null;

  if (
    !providerSubscriptionId ||
    !providerPlanId ||
    !providerPaymentId ||
    !amountCents ||
    !currency ||
    !status ||
    !headerProviderEventId
  ) {
    await writeReconciliationIssue(supabase, {
      providerEventId: headerProviderEventId,
      paymentId: providerPaymentId,
      failureReason: "missing_subscription_charge_provider_fields",
      purpose: "subscription_payment",
      receivedAmountCents: amountCents,
      receivedCurrency: currency,
    });
    return { eventType, handled: false, actionTaken: "missing_subscription_charge_provider_fields" };
  }

  if (!captured) {
    await writeReconciliationIssue(supabase, {
      providerEventId: headerProviderEventId,
      paymentId: providerPaymentId,
      failureReason: "subscription_charge_not_captured",
      purpose: "subscription_payment",
      receivedAmountCents: amountCents,
      receivedCurrency: currency,
    });
    return { eventType, handled: false, actionTaken: "subscription_charge_not_captured" };
  }

  const { data: localSub, error: localSubErr } = await supabase
    .from("subscriptions")
    .select("id, tenant_id, plan_tier, provider_plan_id, provider_subscription_id, price_cents, pending_plan_tier")
    .eq("billing_provider", "razorpay_subscription")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  if (localSubErr) throw new Error(`subscription lookup failed: ${localSubErr.message}`);
  if (!localSub) {
    await writeReconciliationIssue(supabase, {
      providerEventId: headerProviderEventId,
      paymentId: providerPaymentId,
      failureReason: "subscription_not_found_for_provider_id",
      purpose: "subscription_payment",
      receivedAmountCents: amountCents,
      receivedCurrency: currency,
    });
    return { eventType, handled: false, actionTaken: "subscription_charge_failed_subscription_not_found" };
  }

  if (notesTenantId && notesTenantId !== localSub.tenant_id) {
    await writeReconciliationIssue(supabase, {
      providerEventId: headerProviderEventId,
      paymentId: providerPaymentId,
      tenantId: localSub.tenant_id,
      failureReason: "subscription_notes_tenant_mismatch",
      purpose: "subscription_payment",
      receivedAmountCents: amountCents,
      receivedCurrency: currency,
    });
    return { eventType, handled: false, actionTaken: "subscription_charge_failed_notes_tenant_mismatch" };
  }

  if (notesSubscriptionId && notesSubscriptionId !== localSub.id) {
    await writeReconciliationIssue(supabase, {
      providerEventId: headerProviderEventId,
      paymentId: providerPaymentId,
      tenantId: localSub.tenant_id,
      failureReason: "subscription_notes_id_mismatch",
      purpose: "subscription_payment",
      receivedAmountCents: amountCents,
      receivedCurrency: currency,
    });
    return { eventType, handled: false, actionTaken: "subscription_charge_failed_notes_subscription_mismatch" };
  }

  const mappedTier = getTierForRazorpayPlanId(providerPlanId);
  const expectedTier = localSub.pending_plan_tier || localSub.plan_tier;
  if (localSub.provider_plan_id && localSub.provider_plan_id !== providerPlanId && mappedTier !== expectedTier) {
    await writeReconciliationIssue(supabase, {
      providerEventId: headerProviderEventId,
      paymentId: providerPaymentId,
      tenantId: localSub.tenant_id,
      failureReason: "subscription_provider_plan_mismatch",
      purpose: "subscription_payment",
      receivedAmountCents: amountCents,
      receivedCurrency: currency,
    });
    return { eventType, handled: false, actionTaken: "subscription_charge_failed_provider_plan_mismatch" };
  }

  if (mappedTier && mappedTier !== expectedTier && mappedTier !== localSub.plan_tier) {
    await writeReconciliationIssue(supabase, {
      providerEventId: headerProviderEventId,
      paymentId: providerPaymentId,
      tenantId: localSub.tenant_id,
      failureReason: "subscription_plan_tier_mapping_mismatch",
      purpose: "subscription_payment",
      receivedAmountCents: amountCents,
      receivedCurrency: currency,
    });
    return { eventType, handled: false, actionTaken: "subscription_charge_failed_plan_tier_mapping_mismatch" };
  }

  const integrationMode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE");
  const paymentMode = integrationMode === "live" ? "live" : "test";

  let currentPeriodStart: string | null = null;
  let currentPeriodEnd: string | null = null;
  let nextChargeAt: string | null = null;
  if (typeof subEntity?.current_start === "number" && Number.isFinite(subEntity.current_start)) {
    currentPeriodStart = new Date(subEntity.current_start * 1000).toISOString();
  }
  if (typeof subEntity?.current_end === "number" && Number.isFinite(subEntity.current_end)) {
    currentPeriodEnd = new Date(subEntity.current_end * 1000).toISOString();
  }
  if (typeof subEntity?.charge_at === "number" && Number.isFinite(subEntity.charge_at)) {
    nextChargeAt = new Date(subEntity.charge_at * 1000).toISOString();
  }

  if (!currentPeriodStart || !currentPeriodEnd) {
    await writeReconciliationIssue(supabase, {
      providerEventId: headerProviderEventId,
      paymentId: providerPaymentId,
      tenantId: localSub.tenant_id,
      failureReason: "missing_provider_billing_period",
      purpose: "subscription_payment",
      receivedAmountCents: amountCents,
      receivedCurrency: currency,
    });
    return { eventType, handled: false, actionTaken: "subscription_charge_failed_missing_provider_billing_period" };
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("reconcile_and_fulfill_razorpay_subscription_charge", {
    p_provider_event_id: headerProviderEventId,
    p_provider_payment_id: providerPaymentId,
    p_provider_subscription_id: providerSubscriptionId,
    p_provider_order_id: providerOrderId,
    p_actual_amount_cents: amountCents,
    p_actual_currency: currency,
    p_provider_status: typeof subEntity?.status === "string" ? subEntity.status : status,
    p_captured: captured,
    p_event_type: eventType,
    p_mode: paymentMode,
    p_provider_plan_id: providerPlanId,
    p_notes_tenant_id: notesTenantId,
    p_notes_subscription_id: notesSubscriptionId,
    p_current_period_start: currentPeriodStart,
    p_current_period_end: currentPeriodEnd,
    p_next_charge_at: nextChargeAt,
  });

  if (rpcErr) {
    console.error("[Razorpay subscription.charged RPC Error]", rpcErr);
    throw new Error(`reconcile_and_fulfill_razorpay_subscription_charge RPC failed: ${rpcErr.message}`);
  }

  if (!rpcData || (rpcData as { fulfilled?: boolean }).fulfilled !== true) {
    const reason = (rpcData as { reason?: string })?.reason ?? "subscription_charge_rejected";
    return { eventType, handled: false, actionTaken: `subscription_charge_failed_${reason}` };
  }

  const already = (rpcData as { already_fulfilled?: boolean }).already_fulfilled === true;
  return {
    eventType,
    handled: true,
    actionTaken: already ? "subscription_charge_already_fulfilled" : "subscription_charge_fulfilled",
    orderId: (rpcData as { order_id?: string }).order_id ?? null,
    purpose: "subscription_payment",
    subscriptionId: localSub.id,
  };
}

async function processSubscriptionLifecycleEvent(
  supabase: ServiceClient,
  event: { eventType: string; payload: Record<string, unknown>; providerEventId?: string | null }
): Promise<WebhookProcessResult> {
  const { eventType, payload } = event;
  const subEntity = extractSubscriptionEntity(payload);
  const providerSubscriptionId = typeof subEntity?.id === "string" && subEntity.id.trim() ? subEntity.id.trim() : null;
  const providerStatus =
    typeof subEntity?.status === "string" && subEntity.status.trim()
      ? subEntity.status.trim()
      : eventType.replace("subscription.", "");

  if (!providerSubscriptionId) {
    return { eventType, handled: false, actionTaken: "missing_provider_subscription_id" };
  }

  let nextChargeAt: string | null = null;
  const chargeAt = subEntity?.charge_at;
  if (typeof chargeAt === "number" && Number.isFinite(chargeAt)) {
    nextChargeAt = new Date(chargeAt * 1000).toISOString();
  }

  let currentPeriodStart: string | null = null;
  let currentPeriodEnd: string | null = null;
  if (typeof subEntity?.current_start === "number" && Number.isFinite(subEntity.current_start)) {
    currentPeriodStart = new Date(subEntity.current_start * 1000).toISOString();
  }
  if (typeof subEntity?.current_end === "number" && Number.isFinite(subEntity.current_end)) {
    currentPeriodEnd = new Date(subEntity.current_end * 1000).toISOString();
  }

  const providerPlanId =
    typeof subEntity?.plan_id === "string" && subEntity.plan_id.trim() ? subEntity.plan_id.trim() : null;

  let pendingPlanTier: string | null = null;
  const notes = typeof subEntity?.notes === "object" && subEntity.notes ? (subEntity.notes as Record<string, unknown>) : null;
  if (notes && typeof notes.pending_plan_tier === "string") {
    pendingPlanTier = notes.pending_plan_tier;
  } else if (providerPlanId) {
    pendingPlanTier = getTierForRazorpayPlanId(providerPlanId);
  }

  const shortUrl = typeof subEntity?.short_url === "string" ? subEntity.short_url : null;
  const headerProviderEventId =
    typeof event.providerEventId === "string" && event.providerEventId.trim() !== ""
      ? event.providerEventId.trim()
      : null;

  let cancelAtCycleEnd: boolean | null = null;
  if (typeof subEntity?.cancel_at_cycle_end === "boolean") {
    cancelAtCycleEnd = subEntity.cancel_at_cycle_end;
  } else if (eventType === "subscription.cancelled" || eventType === "subscription.completed") {
    cancelAtCycleEnd = true;
  }

  // Converge scheduled plan changes after provider-success/local-failure:
  // only set pending when provider plan maps to a different tier than local.
  let pendingForSync: string | null = null;
  if (eventType === "subscription.updated" || eventType === "subscription.activated") {
    if (notes && typeof notes.pending_plan_tier === "string") {
      pendingForSync = notes.pending_plan_tier;
    } else if (pendingPlanTier) {
      const { data: localSub } = await supabase
        .from("subscriptions")
        .select("plan_tier, pending_plan_tier, fulfilment_status")
        .eq("billing_provider", "razorpay_subscription")
        .eq("provider_subscription_id", providerSubscriptionId)
        .maybeSingle();
      if (
        localSub &&
        pendingPlanTier !== localSub.plan_tier &&
        (localSub.fulfilment_status === "reconciliation_required" || !localSub.pending_plan_tier)
      ) {
        pendingForSync = pendingPlanTier;
      } else if (localSub?.pending_plan_tier) {
        pendingForSync = localSub.pending_plan_tier;
      }
    }
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc("apply_razorpay_subscription_lifecycle_event", {
    p_provider_subscription_id: providerSubscriptionId,
    p_provider_status: providerStatus,
    p_provider_event_id: headerProviderEventId,
    p_next_charge_at: nextChargeAt,
    p_short_url: shortUrl,
    p_provider_plan_id: providerPlanId,
    p_current_period_start: currentPeriodStart,
    p_current_period_end: currentPeriodEnd,
    p_pending_plan_tier: pendingForSync,
    p_event_type: eventType,
    p_cancel_at_cycle_end: cancelAtCycleEnd,
  });

  if (rpcErr) {
    throw new Error(`apply_razorpay_subscription_lifecycle_event RPC failed: ${rpcErr.message}`);
  }

  if (!rpcData || (rpcData as { success?: boolean }).success !== true) {
    const reason = (rpcData as { reason?: string })?.reason ?? "lifecycle_rejected";
    return { eventType, handled: false, actionTaken: `subscription_lifecycle_failed_${reason}` };
  }

  const { data: resolvedSub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("billing_provider", "razorpay_subscription")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();

  return {
    eventType,
    handled: true,
    actionTaken:
      eventType === "subscription.updated" ? "subscription_updated_synced" : `subscription_lifecycle_${providerStatus}`,
    subscriptionId: resolvedSub?.id ?? null,
    cancelAtCycleEnd,
  };
}
