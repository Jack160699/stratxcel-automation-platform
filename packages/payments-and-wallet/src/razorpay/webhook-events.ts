import type { ServiceClient } from "../db.ts";
import { getPaymentOrderByProviderOrderId, transitionPaymentOrder } from "./payment-orders.ts";
import { markRefundProcessed } from "./refunds.ts";
import { settlePaymentToWallet } from "./settlement.ts";
import type { PaymentOrderRow, RazorpayWebhookEventRow } from "./types.ts";

export class DuplicateWebhookEventError extends Error {
  constructor(providerEventId: string) {
    super(`Razorpay webhook event ${providerEventId} was already processed`);
    this.name = "DuplicateWebhookEventError";
  }
}

export class WebhookEventInProgressError extends Error {
  constructor(providerEventId: string) {
    super(`Razorpay webhook event ${providerEventId} is currently being processed by another worker`);
    this.name = "WebhookEventInProgressError";
  }
}

export interface ClaimEventResult {
  claimed: boolean;
  eventRow: RazorpayWebhookEventRow;
  token: string | null;
}

/**
 * Atomic processing claim for webhook event delivery.
 * Calls claim_razorpay_webhook_event RPC (or query fallback for mocks).
 */
export async function claimRazorpayWebhookEvent(
  supabase: ServiceClient,
  input: { providerEventId: string; eventType: string; payload: Record<string, unknown>; claimDurationSeconds?: number }
): Promise<ClaimEventResult> {
  const claimSeconds = input.claimDurationSeconds ?? 60;

  if (typeof supabase?.rpc === "function") {
    const { data, error } = await supabase.rpc("claim_razorpay_webhook_event", {
      p_provider_event_id: input.providerEventId,
      p_event_type: input.eventType,
      p_payload: input.payload,
      p_claim_duration_seconds: claimSeconds,
    });

    if (!error && data) {
      const res = data as { claimed: boolean; status: string; event_id: string; token?: string };
      if (!res.claimed) {
        if (res.status === "already_processed") {
          throw new DuplicateWebhookEventError(input.providerEventId);
        }
        if (res.status === "in_progress") {
          throw new WebhookEventInProgressError(input.providerEventId);
        }
      }
      return {
        claimed: true,
        eventRow: {
          id: res.event_id,
          provider_event_id: input.providerEventId,
          event_type: input.eventType,
          payload: input.payload,
          processed_at: null,
          created_at: new Date().toISOString(),
        },
        token: res.token ?? null,
      };
    }
  }

  // Fallback for mocked test clients
  const { data: existing } = await supabase
    .from("razorpay_webhook_events")
    .select("*")
    .eq("provider_event_id", input.providerEventId)
    .maybeSingle();

  if (existing) {
    if (existing.processed_at) {
      throw new DuplicateWebhookEventError(input.providerEventId);
    }
    const startedAt = existing.processing_started_at ? new Date(existing.processing_started_at).getTime() : 0;
    const isLeaseActive = Date.now() - startedAt < claimSeconds * 1000;
    if (existing.processing_started_at && isLeaseActive) {
      throw new WebhookEventInProgressError(input.providerEventId);
    }

    const token = `token_${Math.random().toString(36).substring(2)}`;
    await supabase
      .from("razorpay_webhook_events")
      .update({ processing_started_at: new Date().toISOString(), processing_token: token })
      .eq("id", existing.id);

    return { claimed: true, eventRow: existing as RazorpayWebhookEventRow, token };
  }

  const token = `token_${Math.random().toString(36).substring(2)}`;
  const { data: created, error: insertErr } = await supabase
    .from("razorpay_webhook_events")
    .insert({
      provider_event_id: input.providerEventId,
      event_type: input.eventType,
      payload: input.payload,
      processing_started_at: new Date().toISOString(),
      processing_token: token,
    })
    .select("*")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      throw new DuplicateWebhookEventError(input.providerEventId);
    }
    throw new Error("Failed to record webhook event");
  }

  return { claimed: true, eventRow: created as RazorpayWebhookEventRow, token };
}

export async function markWebhookEventProcessed(
  supabase: ServiceClient,
  eventId: string,
  token?: string | null
): Promise<void> {
  if (typeof supabase?.rpc === "function") {
    await supabase.rpc("complete_razorpay_webhook_event", {
      p_event_id: eventId,
      p_token: token ?? null,
    });
    return;
  }

  if (token) {
    await supabase
      .from("razorpay_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventId)
      .eq("processing_token", token);
  } else {
    await supabase
      .from("razorpay_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventId);
  }
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
  const entityObj = payload.payload as Record<string, Record<string, unknown>> | undefined;

  if (eventType === "payment_link.paid") {
    const plEntity = entityObj?.payment_link?.entity as Record<string, unknown> | undefined;
    const payEntity = entityObj?.payment?.entity as Record<string, unknown> | undefined;

    const providerLinkId = (plEntity?.id as string) ?? null;
    const referenceId = (plEntity?.reference_id as string) ?? null;
    const paymentId = (payEntity?.id as string) ?? null;

    let query = supabase.from("payment_links").select("*");
    if (providerLinkId) query = query.eq("provider_link_id", providerLinkId);
    else if (referenceId) query = query.eq("reference_id", referenceId);
    else return { eventType, handled: false, actionTaken: "missing_link_identifiers" };

    const { data: link } = await query.maybeSingle();
    if (!link) return { eventType, handled: false, actionTaken: "payment_link_not_found" };

    if (link.status !== "paid") {
      await supabase
        .from("payment_links")
        .update({ status: "paid", provider_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq("id", link.id);
    }

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

      if (!orderErr && newOrder) order = newOrder as PaymentOrderRow;
    }

    if (order) await settlePaymentToWallet(supabase, order);
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

  if (eventType === "refund.created") {
    const rfEntity = entityObj?.refund?.entity as Record<string, unknown> | undefined;
    const providerRefundId = (rfEntity?.id as string) ?? null;
    const paymentId = (rfEntity?.payment_id as string) ?? null;
    const amountCents = typeof rfEntity?.amount === "number" ? rfEntity.amount : 0;

    if (paymentId) {
      const { data: order } = await supabase
        .from("payment_orders")
        .select("*")
        .eq("provider_payment_id", paymentId)
        .maybeSingle();

      if (order) {
        const { data: existingRefund } = await supabase
          .from("payment_refunds")
          .select("*")
          .eq("payment_order_id", order.id)
          .eq("provider_refund_id", providerRefundId)
          .maybeSingle();

        if (existingRefund) {
          if (existingRefund.status === "PROCESSED" || existingRefund.status === "FAILED") {
            return { eventType, handled: true, actionTaken: "refund_created_ignored_already_terminal" };
          }
        } else {
          await supabase.from("payment_refunds").insert({
            tenant_id: order.tenant_id,
            payment_order_id: order.id,
            provider_refund_id: providerRefundId,
            amount_cents: amountCents || order.amount_cents,
            status: "PENDING",
            reason: "razorpay_webhook_created",
          });
        }
      }
    }
    return { eventType, handled: true, actionTaken: "refund_created_logged" };
  }

  if (eventType === "refund.processed") {
    const rfEntity = entityObj?.refund?.entity as Record<string, unknown> | undefined;
    const providerRefundId = (rfEntity?.id as string) ?? null;
    const paymentId = (rfEntity?.payment_id as string) ?? null;
    const amountCents = typeof rfEntity?.amount === "number" ? rfEntity.amount : 0;

    if (!paymentId && !providerRefundId) {
      return { eventType, handled: false, actionTaken: "missing_refund_identifiers" };
    }

    let order: PaymentOrderRow | null = null;
    if (paymentId) {
      const { data: foundOrder } = await supabase
        .from("payment_orders")
        .select("*")
        .eq("provider_payment_id", paymentId)
        .maybeSingle();
      if (foundOrder) order = foundOrder as PaymentOrderRow;
    }

    let refundRow: Record<string, unknown> | null = null;
    if (providerRefundId) {
      const { data: foundRefund } = await supabase
        .from("payment_refunds")
        .select("*, payment_orders!inner(*)")
        .eq("provider_refund_id", providerRefundId)
        .maybeSingle();

      if (foundRefund) {
        refundRow = foundRefund;
        order = foundRefund.payment_orders as unknown as PaymentOrderRow;
      }
    }

    if (!order) {
      return { eventType, handled: false, actionTaken: "payment_order_not_found_for_refund" };
    }

    const validAmount = amountCents > 0 ? amountCents : order.amount_cents;
    if (validAmount > order.amount_cents) {
      return { eventType, handled: false, actionTaken: "refund_amount_exceeds_order_amount" };
    }

    if (!refundRow) {
      const { data: newRefund, error: insertErr } = await supabase
        .from("payment_refunds")
        .insert({
          tenant_id: order.tenant_id,
          payment_order_id: order.id,
          provider_refund_id: providerRefundId,
          amount_cents: validAmount,
          status: "PENDING",
          reason: "razorpay_webhook_processed_out_of_order",
        })
        .select("*")
        .single();

      if (!insertErr && newRefund) refundRow = newRefund;
    }

    if (refundRow) {
      await markRefundProcessed(supabase, { refundId: refundRow.id as string, order });
      return { eventType, handled: true, actionTaken: "refund_processed_and_reconciled" };
    }

    return { eventType, handled: false, actionTaken: "refund_row_creation_failed" };
  }

  if (eventType === "refund.failed") {
    const rfEntity = entityObj?.refund?.entity as Record<string, unknown> | undefined;
    const providerRefundId = (rfEntity?.id as string) ?? null;
    const paymentId = (rfEntity?.payment_id as string) ?? null;
    const amountCents = typeof rfEntity?.amount === "number" ? rfEntity.amount : 0;

    if (providerRefundId) {
      const { data: existing } = await supabase
        .from("payment_refunds")
        .select("id")
        .eq("provider_refund_id", providerRefundId)
        .maybeSingle();

      if (existing) {
        await supabase.from("payment_refunds").update({ status: "FAILED" }).eq("id", existing.id);
      } else if (paymentId) {
        const { data: order } = await supabase.from("payment_orders").select("*").eq("provider_payment_id", paymentId).maybeSingle();
        if (order) {
          await supabase.from("payment_refunds").insert({
            tenant_id: order.tenant_id,
            payment_order_id: order.id,
            provider_refund_id: providerRefundId,
            amount_cents: amountCents || order.amount_cents,
            status: "FAILED",
            reason: "razorpay_webhook_failed_out_of_order",
          });
        }
      }
    }
    return { eventType, handled: true, actionTaken: "refund_failed_updated" };
  }

  return { eventType, handled: true, actionTaken: "event_unhandled_recorded" };
}
