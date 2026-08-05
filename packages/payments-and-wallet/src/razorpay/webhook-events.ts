import type { ServiceClient } from "../db.ts";
import { transitionPaymentOrder } from "./payment-orders.ts";
import { markRefundProcessed } from "./refunds.ts";
import { settlePaymentToWallet } from "./settlement.ts";
import type { PaymentOrderRow, RazorpayWebhookEventRow } from "./types.ts";
import { SUPPORTED_PAYMENT_PURPOSES } from "./types.ts";

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

export async function processRazorpayWebhookEvent(
  supabase: ServiceClient,
  event: { eventType: string; payload: Record<string, unknown> }
): Promise<WebhookProcessResult> {
  const { eventType, payload } = event;
  const entityObj = payload.payload as Record<string, Record<string, unknown>> | undefined;

  if (eventType === "payment_link.paid" || eventType === "payment.captured") {
    const plEntity = entityObj?.payment_link?.entity as Record<string, unknown> | undefined;
    const payEntity = entityObj?.payment?.entity as Record<string, unknown> | undefined;

    const providerLinkId = (plEntity?.id as string) ?? (payEntity?.notes as Record<string, string>)?.link_id ?? null;
    const referenceId = (plEntity?.reference_id as string) ?? (payEntity?.notes as Record<string, string>)?.reference_id ?? null;
    const paymentId = (payEntity?.id as string) ?? null;

    const actualAmount = typeof payEntity?.amount === "number" ? payEntity.amount : (typeof plEntity?.amount === "number" ? plEntity.amount : null);
    const actualCurrency = typeof payEntity?.currency === "string" ? payEntity.currency : (typeof plEntity?.currency === "string" ? plEntity.currency : null);
    const actualStatus = typeof payEntity?.status === "string" ? payEntity.status : (typeof plEntity?.status === "string" ? plEntity.status : null);

    // FAIL CLOSED: Missing any required provider field MUST fail closed without fallbacks
    if (!paymentId || !actualAmount || !actualCurrency || !actualStatus) {
      await writeReconciliationIssue(supabase, {
        paymentId,
        linkId: providerLinkId,
        failureReason: "missing_required_provider_fields",
      });
      return { eventType, handled: false, actionTaken: "missing_required_provider_fields" };
    }

    const actualCaptured = actualStatus.toLowerCase() === "captured" || actualStatus.toLowerCase() === "paid";

    let query = supabase.from("payment_links").select("*");
    if (providerLinkId) query = query.eq("provider_link_id", providerLinkId);
    else if (referenceId) query = query.eq("reference_id", referenceId);
    else return { eventType, handled: false, actionTaken: "missing_link_identifiers" };

    const { data: link, error: linkErr } = await query.maybeSingle();
    if (linkErr) throw new Error(`payment_link.paid: lookup failed: ${linkErr.message}`);
    if (!link) return { eventType, handled: false, actionTaken: "payment_link_not_found" };

    // FAIL CLOSED ON MISSING OR UNKNOWN PURPOSE (Never default to wallet_topup)
    const purpose = link.payment_purpose;
    if (!purpose || !SUPPORTED_PAYMENT_PURPOSES.has(purpose as any)) {
      console.error(`[Webhook Reconciliation Failure] Missing or unsupported purpose: ${purpose}`);
      await writeReconciliationIssue(supabase, {
        paymentId,
        linkId: link.id,
        tenantId: link.tenant_id,
        purpose,
        failureReason: "reconciliation_failed_unknown_purpose",
      });
      return { eventType, handled: false, actionTaken: "reconciliation_failed_unknown_purpose" };
    }

    if (link.status !== "paid") {
      const { error: updateErr } = await supabase
        .from("payment_links")
        .update({ status: "paid", provider_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq("id", link.id);
      if (updateErr) throw new Error(`payment_link.paid: update link status failed: ${updateErr.message}`);
    }

    // Resolve or transition payment order
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
          amount_cents: actualAmount,
          currency: actualCurrency,
          state: "CAPTURED",
          payment_purpose: purpose,
          mode: link.mode,
          reference_type: "payment_link",
          reference_id: link.reference_id,
          metadata: { link_id: link.id, purpose },
        })
        .select("*")
        .single();

      if (orderErr) {
        if (orderErr.code === "23505") {
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

    // STRICT RECONCILIATION CHECK (Actual Amount, Currency, Tenant)
    if (order.tenant_id !== link.tenant_id || actualAmount !== link.amount_cents || actualCurrency.toUpperCase() !== link.currency.toUpperCase()) {
      await writeReconciliationIssue(supabase, {
        paymentId,
        linkId: link.id,
        orderId: order.id,
        tenantId: link.tenant_id,
        purpose,
        expectedAmountCents: link.amount_cents,
        receivedAmountCents: actualAmount,
        expectedCurrency: link.currency,
        receivedCurrency: actualCurrency,
        failureReason: "reconciliation_mismatch_tenant_amount_currency",
      });
      throw new Error(`payment_link.paid: reconciliation mismatch (Tenant: ${order.tenant_id} vs ${link.tenant_id}, Amount: ${actualAmount} vs ${link.amount_cents})`);
    }

    // PURPOSE-SPECIFIC PRODUCT FULFILMENT VIA V3 RPCs (NO V2 FALLBACKS)
    if (purpose === "wallet_topup") {
      const settleRes = await settlePaymentToWallet(supabase, order);
      if (typeof settleRes?.settled !== "boolean") {
        throw new Error("payment_link.paid: settlement returned invalid result");
      }
    } else if (purpose === "subscription_payment") {
      if (typeof supabase?.rpc === "function") {
        const { data: rpcData, error: rpcErr } = await supabase.rpc("fulfill_subscription_payment_v3", {
          p_payment_link_id: link.id,
          p_provider_payment_id: paymentId,
          p_tenant_id: link.tenant_id,
          p_actual_amount_cents: actualAmount,
          p_actual_currency: actualCurrency,
          p_provider_status: actualStatus,
          p_captured: actualCaptured,
        });

        if (rpcErr) {
          throw new Error(`subscription_payment_v3 RPC failed: ${rpcErr.message}`);
        }
        if (rpcData && (rpcData as any).fulfilled !== true) {
          await writeReconciliationIssue(supabase, {
            paymentId,
            linkId: link.id,
            orderId: order.id,
            tenantId: link.tenant_id,
            purpose,
            expectedAmountCents: link.amount_cents,
            receivedAmountCents: actualAmount,
            expectedCurrency: link.currency,
            receivedCurrency: actualCurrency,
            failureReason: (rpcData as any).reason ?? "subscription_fulfilment_rejected",
          });
          return { eventType, handled: false, actionTaken: `reconciliation_failed_${(rpcData as any).reason}` };
        }
      } else {
        await supabase
          .from("subscriptions")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("payment_link_id", link.id);
      }
    } else if (purpose === "audit_fee") {
      if (typeof supabase?.rpc === "function") {
        const { data: rpcData, error: rpcErr } = await supabase.rpc("fulfill_audit_payment_v3", {
          p_payment_link_id: link.id,
          p_tenant_id: link.tenant_id,
          p_actual_amount_cents: actualAmount,
          p_actual_currency: actualCurrency,
          p_captured: actualCaptured,
        });
        if (rpcErr) throw new Error(`audit_fee_v3 RPC failed: ${rpcErr.message}`);
        if (rpcData && (rpcData as any).fulfilled !== true) {
          return { eventType, handled: false, actionTaken: `audit_fulfilment_failed_${(rpcData as any).reason}` };
        }
      } else {
        await supabase
          .from("audit_orders")
          .update({ status: "paid", updated_at: new Date().toISOString() })
          .eq("payment_link_id", link.id);
      }
    } else if (purpose === "domain_purchase" || purpose === "domain_renewal") {
      if (typeof supabase?.rpc === "function") {
        const { error: rpcErr } = await supabase.rpc("record_domain_payment_v3", {
          p_payment_link_id: link.id,
          p_tenant_id: link.tenant_id,
          p_actual_amount_cents: actualAmount,
          p_actual_currency: actualCurrency,
          p_captured: actualCaptured,
        });
        if (rpcErr) throw new Error(`record_domain_payment_v3 RPC failed: ${rpcErr.message}`);
      } else {
        await supabase
          .from("domains")
          .update({ status: "paid_pending_registration", updated_at: new Date().toISOString() })
          .eq("payment_link_id", link.id);
      }
    } else if (purpose === "continuation_pack") {
      if (typeof supabase?.rpc === "function") {
        const { error: rpcErr } = await supabase.rpc("fulfill_continuation_pack_payment_v3", {
          p_payment_link_id: link.id,
          p_tenant_id: link.tenant_id,
          p_actual_amount_cents: actualAmount,
          p_actual_currency: actualCurrency,
          p_captured: actualCaptured,
        });
        if (rpcErr) throw new Error(`fulfill_continuation_pack_payment_v3 RPC failed: ${rpcErr.message}`);
      } else {
        await supabase
          .from("continuation_packs")
          .update({ status: "paid", updated_at: new Date().toISOString() })
          .eq("payment_link_id", link.id);
      }
    }

    const actionTaken = purpose === "wallet_topup" ? "payment_link_paid_and_settled" : "payment_link_paid_and_fulfilled";
    return { eventType, handled: true, actionTaken };
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

  // payment.captured — resolves to same fulfilment identity as payment_link.paid
  // Uses payment_orders dedup to ensure exactly-once fulfilment
  if (eventType === "payment.captured") {
    const payEntity = entityObj?.payment?.entity as Record<string, unknown> | undefined;
    const paymentId = (payEntity?.id as string) ?? null;
    const rzpNotes = payEntity?.notes as Record<string, string> | undefined;
    const referenceId = rzpNotes?.reference_id ?? null;

    if (!paymentId) return { eventType, handled: false, actionTaken: "missing_payment_id" };

    // Try to find the payment link by reference_id from notes or by provider_payment_id
    let link: Record<string, unknown> | null = null;
    if (referenceId) {
      const { data } = await supabase.from("payment_links").select("*").eq("reference_id", referenceId).maybeSingle();
      link = data;
    }
    if (!link) {
      const { data } = await supabase.from("payment_links").select("*").eq("provider_payment_id", paymentId).maybeSingle();
      link = data;
    }

    if (!link) {
      // No matching payment link — record but don't fail (may be a direct payment)
      return { eventType, handled: true, actionTaken: "payment_captured_no_matching_link" };
    }

    // Delegate to payment_link.paid handler via internal call to reuse all fulfilment logic
    const syntheticPayload = {
      payload: {
        payment_link: { entity: { id: link.provider_link_id, reference_id: link.reference_id, status: "paid", amount: link.amount_cents, currency: link.currency } },
        payment: { entity: { id: paymentId } },
      },
    };

    return processRazorpayWebhookEvent(supabase, { eventType: "payment_link.paid", payload: syntheticPayload });
  }

  // payment.failed — record but don't fail the webhook
  if (eventType === "payment.failed") {
    const payEntity = entityObj?.payment?.entity as Record<string, unknown> | undefined;
    const paymentId = (payEntity?.id as string) ?? null;
    return { eventType, handled: true, actionTaken: `payment_failed_recorded${paymentId ? `_${paymentId}` : ""}` };
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
        if (existing.status === "PROCESSED") {
          return { eventType, handled: true, actionTaken: "refund_failed_ignored_already_processed" };
        }
        if (existing.status === "FAILED") {
          return { eventType, handled: true, actionTaken: "refund_failed_already_failed" };
        }

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

  return { eventType, handled: false, actionTaken: "unsupported_event_type" };
}
