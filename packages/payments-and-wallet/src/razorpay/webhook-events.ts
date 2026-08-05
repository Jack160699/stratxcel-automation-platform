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
  token: string;
}

/**
 * Atomic processing claim for webhook event delivery.
 * Fail closed: if rpc method exists, RPC errors throw immediately and NEVER fall back to query logic.
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

    if (error) {
      throw new Error("Webhook claim RPC failed execution");
    }

    if (!data || typeof data !== "object") {
      throw new Error("Webhook claim RPC returned invalid or malformed response");
    }

    const res = data as { claimed?: boolean; status?: string; event_id?: string; token?: string };

    if (typeof res.claimed !== "boolean" || typeof res.status !== "string" || typeof res.event_id !== "string") {
      throw new Error("Webhook claim RPC response shape is invalid");
    }

    if (!res.claimed) {
      if (res.status === "already_processed") {
        throw new DuplicateWebhookEventError(input.providerEventId);
      }
      if (res.status === "in_progress") {
        throw new WebhookEventInProgressError(input.providerEventId);
      }
      throw new Error(`Webhook claim denied with status: ${res.status}`);
    }

    if (!res.token || res.token.trim() === "") {
      throw new Error("Webhook claim RPC returned claimed=true without a valid processing token");
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
      token: res.token,
    };
  }

  // Non-atomic fallback for explicit test/mock clients ONLY (where rpc method does not exist)
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
  token: string
): Promise<void> {
  if (!token || token.trim() === "") {
    throw new Error("Processing token is required to mark webhook event processed");
  }

  if (typeof supabase?.rpc === "function") {
    const { data, error } = await supabase.rpc("complete_razorpay_webhook_event", {
      p_event_id: eventId,
      p_token: token,
    });

    if (error) {
      throw new Error(`Webhook completion RPC error: ${error.message}`);
    }

    if (data !== true) {
      throw new Error("Webhook completion RPC returned false: token mismatch or already completed");
    }

    return;
  }

  // Fallback for non-RPC test mocks
  await supabase
    .from("razorpay_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("processing_token", token);
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

    const { data: link, error: linkErr } = await query.maybeSingle();
    if (linkErr) throw new Error(`payment_link.paid: lookup failed: ${linkErr.message}`);
    if (!link) return { eventType, handled: false, actionTaken: "payment_link_not_found" };

    if (link.status !== "paid") {
      const { error: updateErr } = await supabase
        .from("payment_links")
        .update({ status: "paid", provider_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq("id", link.id);
      if (updateErr) throw new Error(`payment_link.paid: update link status failed: ${updateErr.message}`);
    }

    let order: PaymentOrderRow | null = null;
    const { data: existingOrder, error: orderFetchErr } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("tenant_id", link.tenant_id)
      .eq("provider", "razorpay")
      .eq("reference_type", "payment_link")
      .eq("reference_id", link.reference_id)
      .maybeSingle();

    if (orderFetchErr) throw new Error(`payment_link.paid: fetch payment order failed: ${orderFetchErr.message}`);

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

      if (orderErr) {
        if (orderErr.code === "23505") {
          // Uniqueness race: re-fetch existing order created by concurrent delivery
          const { data: refetched, error: refetchErr } = await supabase
            .from("payment_orders")
            .select("*")
            .eq("tenant_id", link.tenant_id)
            .eq("provider", "razorpay")
            .eq("reference_type", "payment_link")
            .eq("reference_id", link.reference_id)
            .single();

          if (refetchErr || !refetched) {
            throw new Error(`payment_link.paid: payment order race re-fetch failed: ${refetchErr?.message}`);
          }
          order = refetched as PaymentOrderRow;
        } else {
          throw new Error(`payment_link.paid: insert payment order failed: ${orderErr.message}`);
        }
      } else {
        order = newOrder as PaymentOrderRow;
      }
    }

    if (!order) throw new Error("payment_link.paid: failed to resolve payment order");

    const purpose = link.payment_purpose ?? "wallet_topup";
    if (purpose === "wallet_topup") {
      const settleRes = await settlePaymentToWallet(supabase, order);
      if (typeof settleRes?.settled !== "boolean") {
        throw new Error("payment_link.paid: settlement returned invalid result");
      }
    } else if (purpose === "audit_fee") {
      await supabase
        .from("audit_orders")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("payment_link_id", link.id);
    } else if (purpose === "domain_purchase" || purpose === "domain_renewal") {
      await supabase
        .from("domains")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("payment_link_id", link.id);
    } else if (purpose === "continuation_pack") {
      await supabase
        .from("continuation_packs")
        .update({ status: "paid" })
        .eq("payment_link_id", link.id);
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

    const { data: link, error: fetchErr } = await query.maybeSingle();
    if (fetchErr) throw new Error(`payment_link.partially_paid lookup failed: ${fetchErr.message}`);
    if (!link) return { eventType, handled: false, actionTaken: "payment_link_not_found" };

    if (link.status !== "paid") {
      const { error: updateErr } = await supabase
        .from("payment_links")
        .update({ status: "partially_paid", updated_at: new Date().toISOString() })
        .eq("id", link.id);
      if (updateErr) throw new Error(`payment_link.partially_paid status update failed: ${updateErr.message}`);
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

    const { data: link, error: fetchErr } = await query.maybeSingle();
    if (fetchErr) throw new Error(`payment_link.expired lookup failed: ${fetchErr.message}`);
    if (!link) return { eventType, handled: false, actionTaken: "payment_link_not_found" };

    if (link.status === "created") {
      const { error: updateErr } = await supabase
        .from("payment_links")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", link.id);
      if (updateErr) throw new Error(`payment_link.expired status update failed: ${updateErr.message}`);
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

    const { data: link, error: fetchErr } = await query.maybeSingle();
    if (fetchErr) throw new Error(`payment_link.cancelled lookup failed: ${fetchErr.message}`);
    if (!link) return { eventType, handled: false, actionTaken: "payment_link_not_found" };

    if (link.status === "created") {
      const { error: updateErr } = await supabase
        .from("payment_links")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", link.id);
      if (updateErr) throw new Error(`payment_link.cancelled status update failed: ${updateErr.message}`);
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

    if (providerRefundId) {
      const { data: existingRefund } = await supabase
        .from("payment_refunds")
        .select("*")
        .eq("provider_refund_id", providerRefundId)
        .maybeSingle();

      if (existingRefund) {
        // Monotonic status guarantee: refund.created MUST NOT downgrade PROCESSED or FAILED
        if (existingRefund.status === "PROCESSED" || existingRefund.status === "FAILED") {
          return { eventType, handled: true, actionTaken: "refund_created_ignored_already_terminal" };
        }
      } else if (paymentId) {
        const { data: order } = await supabase
          .from("payment_orders")
          .select("*")
          .eq("provider_payment_id", paymentId)
          .maybeSingle();

        if (!order) {
          return { eventType, handled: false, actionTaken: "payment_order_not_found_for_refund" };
        }

        const { error: insertErr } = await supabase.from("payment_refunds").insert({
          tenant_id: order.tenant_id,
          payment_order_id: order.id,
          provider_refund_id: providerRefundId,
          amount_cents: amountCents || order.amount_cents,
          status: "PENDING",
          reason: "razorpay_webhook_created",
        });
        if (insertErr && insertErr.code !== "23505") {
          throw new Error(`refund.created insert failed: ${insertErr.message}`);
        }
      } else {
        return { eventType, handled: false, actionTaken: "missing_refund_identifiers" };
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
    let refundRow: Record<string, unknown> | null = null;

    if (providerRefundId) {
      const { data: foundRefund, error: findErr } = await supabase
        .from("payment_refunds")
        .select("*, payment_orders!inner(*)")
        .eq("provider_refund_id", providerRefundId)
        .maybeSingle();

      if (findErr) throw new Error(`refund.processed lookup failed: ${findErr.message}`);

      if (foundRefund) {
        refundRow = foundRefund;
        order = foundRefund.payment_orders as unknown as PaymentOrderRow;
      }
    }

    if (!order && paymentId) {
      const { data: foundOrder, error: orderErr } = await supabase
        .from("payment_orders")
        .select("*")
        .eq("provider_payment_id", paymentId)
        .maybeSingle();
      if (orderErr) throw new Error(`refund.processed payment order lookup failed: ${orderErr.message}`);
      if (foundOrder) order = foundOrder as PaymentOrderRow;
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

      if (insertErr) {
        if (insertErr.code === "23505" && providerRefundId) {
          const { data: refetched } = await supabase
            .from("payment_refunds")
            .select("*")
            .eq("provider_refund_id", providerRefundId)
            .single();
          refundRow = refetched;
        } else {
          throw new Error(`refund.processed insert failed: ${insertErr.message}`);
        }
      } else {
        refundRow = newRefund;
      }
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
        .select("id, status")
        .eq("provider_refund_id", providerRefundId)
        .maybeSingle();

      if (existing) {
        // Monotonic status hierarchy: PROCESSED > FAILED > PENDING
        if (existing.status === "PROCESSED") {
          return { eventType, handled: true, actionTaken: "refund_failed_ignored_already_processed" };
        }
        if (existing.status === "FAILED") {
          return { eventType, handled: true, actionTaken: "refund_failed_already_failed" };
        }

        // Only PENDING transitions to FAILED (never alter wallet!)
        const { error: updateErr } = await supabase.from("payment_refunds").update({ status: "FAILED" }).eq("id", existing.id);
        if (updateErr) throw new Error(`refund.failed update status failed: ${updateErr.message}`);
      } else if (paymentId) {
        const { data: order } = await supabase.from("payment_orders").select("*").eq("provider_payment_id", paymentId).maybeSingle();
        if (order) {
          const { error: insertErr } = await supabase.from("payment_refunds").insert({
            tenant_id: order.tenant_id,
            payment_order_id: order.id,
            provider_refund_id: providerRefundId,
            amount_cents: amountCents || order.amount_cents,
            status: "FAILED",
            reason: "razorpay_webhook_failed_out_of_order",
          });
          if (insertErr && insertErr.code !== "23505") {
            throw new Error(`refund.failed insert failed: ${insertErr.message}`);
          }
        } else {
          return { eventType, handled: false, actionTaken: "payment_order_not_found_for_refund" };
        }
      }
    } else {
      return { eventType, handled: false, actionTaken: "missing_refund_identifiers" };
    }
    return { eventType, handled: true, actionTaken: "refund_failed_updated" };
  }

  // Unknown/unsubscribed event types recorded as handled=true to prevent permanent retry loops
  return { eventType, handled: true, actionTaken: "event_unhandled_recorded" };
}
