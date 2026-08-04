import type { ServiceClient } from "../db.ts";
import { getPaymentOrderByProviderOrderId, transitionPaymentOrder } from "./payment-orders.ts";
import { markRefundProcessed } from "./refunds.ts";
import { settlePaymentToWallet } from "./settlement.ts";
import type { PaymentOrderRow, PaymentRefundRow, RazorpayWebhookEventRow } from "./types.ts";

export class DuplicateWebhookEventError extends Error {
  constructor(providerEventId: string) {
    super(`Razorpay webhook event ${providerEventId} was already recorded — refusing to reprocess`);
    this.name = "DuplicateWebhookEventError";
  }
}

/**
 * Replay protection: Razorpay delivers at-least-once. The unique
 * constraint on provider_event_id is the actual enforcement.
 */
export async function recordWebhookEventOnce(
  supabase: ServiceClient,
  input: { providerEventId: string; eventType: string; payload: Record<string, unknown> }
): Promise<RazorpayWebhookEventRow> {
  const { data, error } = await supabase
    .from("razorpay_webhook_events")
    .insert({ provider_event_id: input.providerEventId, event_type: input.eventType, payload: input.payload })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new DuplicateWebhookEventError(input.providerEventId);
    throw new Error(`recordWebhookEventOnce: ${error.message}`);
  }
  return data as RazorpayWebhookEventRow;
}

export async function markWebhookEventProcessed(supabase: ServiceClient, eventId: string): Promise<void> {
  const { error } = await supabase
    .from("razorpay_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw new Error(`markWebhookEventProcessed: ${error.message}`);
}

export interface WebhookProcessResult {
  eventType: string;
  handled: boolean;
  actionTaken: string;
}

export async function processRazorpayWebhookEvent(
  supabase: ServiceClient,
  event: { eventType: string; payload: Record<string, unknown> }
): Promise<WebhookProcessResult> {
  const { eventType, payload } = event;
  const entityObj = (payload.payload as Record<string, Record<string, unknown>> | undefined);

  if (eventType === "payment_link.paid") {
    const plEntity = entityObj?.payment_link?.entity as Record<string, unknown> | undefined;
    const payEntity = entityObj?.payment?.entity as Record<string, unknown> | undefined;

    const providerLinkId = (plEntity?.id as string) ?? null;
    const referenceId = (plEntity?.reference_id as string) ?? null;
    const paymentId = (payEntity?.id as string) ?? null;

    let query = supabase.from("payment_links").select("*");
    if (providerLinkId) {
      query = query.eq("provider_link_id", providerLinkId);
    } else if (referenceId) {
      query = query.eq("reference_id", referenceId);
    } else {
      return { eventType, handled: false, actionTaken: "missing_link_identifiers" };
    }

    const { data: link } = await query.maybeSingle();
    if (!link) {
      return { eventType, handled: false, actionTaken: "payment_link_not_found" };
    }

    // Monotonic state protection: don't overwrite if already paid
    if (link.status !== "paid") {
      await supabase
        .from("payment_links")
        .update({ status: "paid", provider_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq("id", link.id);
    }

    // Check or create payment_orders row for wallet settlement
    let order: PaymentOrderRow | null = null;
    const { data: existingOrder } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("tenant_id", link.tenant_id)
      .eq("reference_type", "payment_link")
      .eq("reference_id", link.reference_id)
      .maybeSingle();

    if (existingOrder) {
      order = existingOrder as PaymentOrderRow;
      if (order.state !== "CAPTURED") {
        order = await transitionPaymentOrder(supabase, {
          orderId: order.id,
          nextState: "CAPTURED",
          providerPaymentId: paymentId ?? undefined,
        });
      }
    } else {
      const { data: newOrder, error: orderErr } = await supabase
        .from("payment_orders")
        .insert({
          tenant_id: link.tenant_id,
          provider: "razorpay",
          provider_payment_id: paymentId,
          amount_cents: link.amount_cents,
          currency: link.currency,
          state: "CAPTURED",
          mode: link.mode,
          reference_type: "payment_link",
          reference_id: link.reference_id,
          metadata: { link_id: link.id },
        })
        .select("*")
        .single();

      if (!orderErr && newOrder) {
        order = newOrder as PaymentOrderRow;
      }
    }

    if (order) {
      await settlePaymentToWallet(supabase, order);
    }

    return { eventType, handled: true, actionTaken: "payment_link_paid_and_settled" };
  }

  if (eventType === "payment_link.partially_paid") {
    const plEntity = entityObj?.payment_link?.entity as Record<string, unknown> | undefined;
    const providerLinkId = (plEntity?.id as string) ?? null;
    const referenceId = (plEntity?.reference_id as string) ?? null;

    let query = supabase.from("payment_links").select("*");
    if (providerLinkId) query = query.eq("provider_link_id", providerLinkId);
    else if (referenceId) query = query.eq("reference_id", referenceId);
    else return { eventType, handled: false, actionTaken: "missing_link_identifiers" };

    const { data: link } = await query.maybeSingle();
    if (link && link.status !== "paid") {
      await supabase
        .from("payment_links")
        .update({ status: "partially_paid", updated_at: new Date().toISOString() })
        .eq("id", link.id);
    }
    return { eventType, handled: true, actionTaken: "payment_link_partially_paid" };
  }

  if (eventType === "payment_link.expired") {
    const plEntity = entityObj?.payment_link?.entity as Record<string, unknown> | undefined;
    const providerLinkId = (plEntity?.id as string) ?? null;
    const referenceId = (plEntity?.reference_id as string) ?? null;

    let query = supabase.from("payment_links").select("*");
    if (providerLinkId) query = query.eq("provider_link_id", providerLinkId);
    else if (referenceId) query = query.eq("reference_id", referenceId);
    else return { eventType, handled: false, actionTaken: "missing_link_identifiers" };

    const { data: link } = await query.maybeSingle();
    if (link && link.status === "created") {
      await supabase
        .from("payment_links")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", link.id);
    }
    return { eventType, handled: true, actionTaken: "payment_link_expired" };
  }

  if (eventType === "payment_link.cancelled") {
    const plEntity = entityObj?.payment_link?.entity as Record<string, unknown> | undefined;
    const providerLinkId = (plEntity?.id as string) ?? null;
    const referenceId = (plEntity?.reference_id as string) ?? null;

    let query = supabase.from("payment_links").select("*");
    if (providerLinkId) query = query.eq("provider_link_id", providerLinkId);
    else if (referenceId) query = query.eq("reference_id", referenceId);
    else return { eventType, handled: false, actionTaken: "missing_link_identifiers" };

    const { data: link } = await query.maybeSingle();
    if (link && link.status === "created") {
      await supabase
        .from("payment_links")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", link.id);
    }
    return { eventType, handled: true, actionTaken: "payment_link_cancelled" };
  }

  if (eventType === "payment.captured") {
    const payEntity = entityObj?.payment?.entity as Record<string, unknown> | undefined;
    const providerOrderId = (payEntity?.order_id as string) ?? null;
    const paymentId = (payEntity?.id as string) ?? null;

    if (providerOrderId) {
      const order = await getPaymentOrderByProviderOrderId(supabase, providerOrderId);
      if (order && order.state !== "CAPTURED") {
        const updated = await transitionPaymentOrder(supabase, {
          orderId: order.id,
          nextState: "CAPTURED",
          providerPaymentId: paymentId ?? undefined,
        });
        await settlePaymentToWallet(supabase, updated);
        return { eventType, handled: true, actionTaken: "order_captured_and_settled" };
      }
    }
    return { eventType, handled: true, actionTaken: "payment_captured_logged" };
  }

  if (eventType === "payment.failed") {
    const payEntity = entityObj?.payment?.entity as Record<string, unknown> | undefined;
    const providerOrderId = (payEntity?.order_id as string) ?? null;

    if (providerOrderId) {
      const order = await getPaymentOrderByProviderOrderId(supabase, providerOrderId);
      if (order && order.state === "CREATED") {
        await transitionPaymentOrder(supabase, { orderId: order.id, nextState: "FAILED" });
        return { eventType, handled: true, actionTaken: "order_marked_failed" };
      }
    }
    return { eventType, handled: true, actionTaken: "payment_failed_logged" };
  }

  if (eventType === "refund.created" || eventType === "refund.processed") {
    const rfEntity = entityObj?.refund?.entity as Record<string, unknown> | undefined;
    const providerRefundId = (rfEntity?.id as string) ?? null;
    const paymentId = (rfEntity?.payment_id as string) ?? null;

    if (providerRefundId || paymentId) {
      let query = supabase.from("payment_refunds").select("*, payment_orders!inner(*)");
      if (providerRefundId) query = query.eq("provider_refund_id", providerRefundId);
      else if (paymentId) query = query.eq("payment_orders.provider_payment_id", paymentId);

      const { data: refundRow } = await query.maybeSingle();
      if (refundRow) {
        const order = refundRow.payment_orders as unknown as PaymentOrderRow;
        await markRefundProcessed(supabase, { refundId: refundRow.id as string, order });
        return { eventType, handled: true, actionTaken: "refund_processed" };
      }
    }
    return { eventType, handled: true, actionTaken: "refund_event_logged" };
  }

  if (eventType === "refund.failed") {
    const rfEntity = entityObj?.refund?.entity as Record<string, unknown> | undefined;
    const providerRefundId = (rfEntity?.id as string) ?? null;
    if (providerRefundId) {
      await supabase
        .from("payment_refunds")
        .update({ status: "FAILED" })
        .eq("provider_refund_id", providerRefundId);
    }
    return { eventType, handled: true, actionTaken: "refund_failed_updated" };
  }

  return { eventType, handled: true, actionTaken: "event_unhandled_recorded" };
}
