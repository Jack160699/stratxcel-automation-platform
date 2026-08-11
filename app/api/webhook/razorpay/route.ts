import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  verifyRazorpayWebhookSignature,
  claimRazorpayWebhookEvent,
  markWebhookEventProcessed,
  processRazorpayWebhookEvent,
  issueInvoiceForPaymentOrder,
  DuplicateWebhookEventError,
  WebhookEventInProgressError,
} from "@stratxcel/payments-and-wallet";
import {
  createPostgresEmailOutboxStore,
  issueEmailNotificationsBestEffort,
} from "@stratxcel/email-runtime";
import { fulfillDomainRegistrationBestEffort } from "@/lib/domains/fulfillment";

/**
 * Best-effort GST invoice/credit-note issuance and domain-registration
 * fulfilment, called only after the webhook's own payment/refund RPC has
 * already committed successfully. Never allowed to change
 * `processResult.handled` — a follow-up-step failure must not make Razorpay
 * re-deliver an event that was already correctly fulfilled. Failures are
 * logged for manual follow-up.
 */
async function issueBillingRecordsBestEffort(
  supabase: ReturnType<typeof getTenantServiceContext>["supabase"],
  processResult: Awaited<ReturnType<typeof processRazorpayWebhookEvent>>
) {
  try {
    if (processResult.orderId) {
      await issueInvoiceForPaymentOrder(supabase, processResult.orderId);
    }
    if (processResult.refundId) {
      await supabase.rpc("issue_credit_note_for_refund", { p_payment_refund_id: processResult.refundId });
    }
    if (processResult.orderId && (processResult.purpose === "domain_purchase" || processResult.purpose === "domain_renewal")) {
      await fulfillDomainRegistrationBestEffort(supabase, processResult.orderId);
    }
  } catch (err) {
    console.error("[Billing Records] Best-effort invoice/credit-note/domain issuance failed", err);
  }
}

/**
 * Best-effort transactional email enqueue after authoritative payment outcomes.
 * Must never affect webhook handled/response semantics.
 */
async function issueEmailRecordsBestEffort(
  supabase: ReturnType<typeof getTenantServiceContext>["supabase"],
  processResult: Awaited<ReturnType<typeof processRazorpayWebhookEvent>>
) {
  try {
    const store = createPostgresEmailOutboxStore(supabase);
    await issueEmailNotificationsBestEffort(supabase, store, {
      handled: processResult.handled,
      orderId: processResult.orderId,
      purpose: processResult.purpose,
      eventType: processResult.eventType,
      actionTaken: processResult.actionTaken,
      subscriptionId: processResult.subscriptionId,
      cancelAtCycleEnd: processResult.cancelAtCycleEnd,
    });
  } catch (err) {
    console.error("[Email Notifications] Best-effort enqueue failed", err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mode = process.env.RAZORPAY_INTEGRATION_MODE || "disabled";
  return Response.json(
    {
      status: mode === "live" ? "ready" : "reachable",
      endpoint: "/api/webhook/razorpay",
      provider: "razorpay",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: Request) {
  try {
    const signatureHeader = request.headers.get("x-razorpay-signature");
    const eventHeaderId = request.headers.get("x-razorpay-event-id");

    if (!eventHeaderId || eventHeaderId.trim() === "") {
      return Response.json({ error: "Missing or blank X-Razorpay-Event-Id header" }, { status: 400 });
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      return Response.json({ error: "Webhook service unavailable" }, { status: 503 });
    }

    const rawBody = await request.text();
    const isValidSig = verifyRazorpayWebhookSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValidSig) {
      return Response.json({ error: "Invalid Razorpay webhook signature" }, { status: 400 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const eventType = (payload.event as string) ?? "unknown";
    const providerEventId = eventHeaderId.trim();

    const { supabase } = getTenantServiceContext();

    let claim;
    try {
      claim = await claimRazorpayWebhookEvent(supabase, {
        eventId: providerEventId,
        eventType,
        payload,
      });
    } catch (err) {
      if (err instanceof DuplicateWebhookEventError) {
        return Response.json({ status: "already_processed", providerEventId }, { status: 200 });
      }
      if (err instanceof WebhookEventInProgressError) {
        return Response.json({ status: "in_progress", error: "Event currently being processed" }, { status: 429 });
      }
      throw err;
    }

    const processResult = await processRazorpayWebhookEvent(supabase, {
      eventType,
      payload,
      providerEventId,
    });

    if (!processResult.handled) {
      // DO NOT call markWebhookEventProcessed! Leave claim lease to expire so Razorpay can retry.
      return Response.json(
        { error: "Webhook event reconciliation incomplete", action: processResult.actionTaken },
        { status: 500 }
      );
    }

    // Only mark processed after reconciliation returned handled=true
    await markWebhookEventProcessed(supabase, claim.eventId, claim.token);

    // Best-effort — never affects the response below, see the function doc.
    await issueBillingRecordsBestEffort(supabase, processResult);
    await issueEmailRecordsBestEffort(supabase, processResult);

    return Response.json({
      success: true,
      handled: true,
      action: processResult.actionTaken,
    });
  } catch (err) {
    if (err instanceof DuplicateWebhookEventError) {
      return Response.json({ status: "already_processed" }, { status: 200 });
    }
    if (err instanceof WebhookEventInProgressError) {
      return Response.json({ status: "in_progress" }, { status: 429 });
    }
    return Response.json({ error: "Internal webhook processing error" }, { status: 500 });
  }
}
