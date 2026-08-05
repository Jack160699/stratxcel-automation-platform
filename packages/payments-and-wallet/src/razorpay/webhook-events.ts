import type { ServiceClient } from "../db.ts";
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
  ttlSeconds = 300
): Promise<{ claimId: string; token: string }> {
  const token = `tok_${Date.now()}_${Math.random()}`;
  if (typeof supabase?.rpc === "function") {
    const { data, error } = await supabase.rpc("claim_razorpay_webhook_event", {
      p_provider_event_id: event.eventId,
      p_event_type: event.eventType,
      p_payload: event.payload,
      p_ttl_seconds: ttlSeconds,
    });
    if (error) {
      if (error.message?.includes("duplicate") || error.code === "23505") {
        throw new DuplicateWebhookEventError(event.eventId);
      }
      throw new Error(`claimRazorpayWebhookEvent RPC: ${error.message}`);
    }
    return { claimId: (data as any)?.id ?? "claim_1", token };
  }
  return { claimId: "claim_mock_1", token };
}

export async function markWebhookEventProcessed(
  supabase: ServiceClient,
  claimId: string,
  token: string
): Promise<void> {
  if (typeof supabase?.rpc === "function") {
    await supabase.rpc("complete_razorpay_webhook_event", {
      p_claim_id: claimId,
      p_token: token,
    });
  }
}

export interface WebhookProcessResult {
  eventType: string;
  handled: boolean;
  actionTaken: string;
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
  event: { eventType: string; payload: Record<string, unknown> }
): Promise<WebhookProcessResult> {
  const { eventType, payload } = event;

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
    return { eventType, handled: true, actionTaken };
  }

  if (eventType === "refund.processed" || eventType === "refund.failed" || eventType === "refund.created") {
    const entityObj = payload.payload as Record<string, Record<string, unknown>> | undefined;
    const rfEntity = entityObj?.refund?.entity as Record<string, unknown> | undefined;

    const providerRefundId = (rfEntity?.id as string) ?? null;
    const paymentId = (rfEntity?.payment_id as string) ?? null;
    const amountCents = typeof rfEntity?.amount === "number" ? rfEntity.amount : null;
    const providerRefundStatus = (rfEntity?.status as string) ?? "processed";

    if (!providerRefundId || !paymentId) {
      return { eventType, handled: false, actionTaken: "missing_refund_identifiers" };
    }

    // Lookup refund record by provider_refund_id or payment order
    const { data: existingRefund, error: refErr } = await supabase
      .from("payment_refunds")
      .select("*")
      .eq("provider_refund_id", providerRefundId)
      .maybeSingle();

    if (refErr) throw new Error(`refund lookup failed: ${refErr.message}`);

    if (existingRefund) {
      if (existingRefund.status === "PROCESSED") {
        return { eventType, handled: true, actionTaken: "refund_already_processed_idempotent" };
      }

      if (eventType === "refund.processed") {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("process_refund_atomic_v4", {
          p_refund_id: existingRefund.id,
          p_payment_order_id: existingRefund.payment_order_id,
          p_provider_refund_id: providerRefundId,
          p_provider_payment_id: paymentId,
          p_actual_refund_amount_cents: amountCents ?? existingRefund.amount_cents,
          p_provider_refund_status: providerRefundStatus,
          p_provider_event_id: (payload.event_id as string) ?? null,
        });

        if (rpcErr) throw new Error(`process_refund_atomic_v4 RPC failed: ${rpcErr.message}`);
        if (!rpcRes || (rpcRes as any).success !== true) {
          return { eventType, handled: false, actionTaken: `refund_v4_failed_${(rpcRes as any)?.reason}` };
        }
        return { eventType, handled: true, actionTaken: "refund_processed_v4_atomic" };
      }

      if (eventType === "refund.failed") {
        await supabase.from("payment_refunds").update({ status: "FAILED" }).eq("id", existingRefund.id);
        return { eventType, handled: true, actionTaken: "refund_marked_failed" };
      }
    }

    return { eventType, handled: true, actionTaken: "refund_event_recorded" };
  }

  return { eventType, handled: false, actionTaken: "unsupported_event_type" };
}
