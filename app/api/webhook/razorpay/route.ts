import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  verifyRazorpayWebhookSignature,
  recordWebhookEventOnce,
  markWebhookEventProcessed,
  processRazorpayWebhookEvent,
  DuplicateWebhookEventError,
} from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      status: "active",
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

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return Response.json({ error: "RAZORPAY_WEBHOOK_SECRET is not configured on server" }, { status: 500 });
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
    const providerEventId =
      eventHeaderId ||
      (payload.event_id as string) ||
      (payload.account_id ? `${payload.account_id}_${eventType}_${Date.now()}` : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

    const { supabase } = getTenantServiceContext();

    let eventRow;
    try {
      eventRow = await recordWebhookEventOnce(supabase, {
        providerEventId,
        eventType,
        payload,
      });
    } catch (err) {
      if (err instanceof DuplicateWebhookEventError) {
        return Response.json({ status: "already_processed", providerEventId }, { status: 200 });
      }
      throw err;
    }

    const processResult = await processRazorpayWebhookEvent(supabase, { eventType, payload });
    await markWebhookEventProcessed(supabase, eventRow.id);

    return Response.json({
      success: true,
      handled: processResult.handled,
      action: processResult.actionTaken,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook processing error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
