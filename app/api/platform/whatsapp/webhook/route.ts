import { NextResponse, type NextRequest } from "next/server";
import {
  parseInboundWhatsAppWebhook,
  parseWhatsAppStatusUpdates,
  verifyWhatsAppWebhookSignature,
  findActiveBindingByPhoneNumberId,
  updateWhatsAppMessageStatus,
} from "@stratxcel/whatsapp";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { buildAgentChannelSignature } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/whatsapp/webhook
 * Meta's Webhook verification handshake.
 * Echoes hub.challenge if hub.verify_token matches WHATSAPP_VERIFY_TOKEN.
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const expectedToken =
    process.env.WHATSAPP_VERIFY_TOKEN ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.META_WHATSAPP_CONFIG_ID;

  if (!expectedToken) {
    return NextResponse.json({ error: "WHATSAPP_VERIFY_TOKEN not configured" }, { status: 503 });
  }

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

/**
 * POST /api/platform/whatsapp/webhook
 * Real inbound delivery from Meta WhatsApp Cloud API.
 * Validates X-Hub-Signature-256 HMAC, normalizes payload, resolves tenant,
 * routes linked Founder commands directly to Hermes command center.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");

  // Verify signature if secret is configured
  const secret =
    process.env.WHATSAPP_APP_SECRET ||
    process.env.META_WHATSAPP_APP_SECRET ||
    process.env.META_APP_SECRET;
  if (secret) {
    const isValid = verifyWhatsAppWebhookSignature(rawBody, signatureHeader);
    if (!isValid) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "malformed json" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();

  let messages: ReturnType<typeof parseInboundWhatsAppWebhook>;
  let statusUpdates: ReturnType<typeof parseWhatsAppStatusUpdates>;
  try {
    messages = parseInboundWhatsAppWebhook(parsedBody);
    statusUpdates = parseWhatsAppStatusUpdates(parsedBody);
  } catch (err) {
    console.error("[whatsapp-webhook] parsing error:", err);
    return NextResponse.json({ error: "malformed payload" }, { status: 400 });
  }

  // 1. Process delivery receipts (sent / delivered / read)
  for (const update of statusUpdates) {
    try {
      const binding = await findActiveBindingByPhoneNumberId(service as never, update.phoneNumberId);
      if (binding) {
        await updateWhatsAppMessageStatus(service as never, {
          tenantId: binding.tenant_id,
          providerMessageId: update.providerMessageId,
          status: update.status,
        });
      }
    } catch (sErr) {
      console.warn("[whatsapp-webhook] status update warning:", sErr);
    }
  }

  // 2. Process inbound messages
  const internalAgentUrl =
    process.env.INTERNAL_AGENT_ENDPOINT_URL ||
    `${req.nextUrl.origin}/api/internal/agent/whatsapp`;

  for (const message of messages) {
    try {
      let binding = await findActiveBindingByPhoneNumberId(service as never, message.phoneNumberId);
      if (!binding) {
        const { data: primaryBinding } = await service
          .from("whatsapp_phone_bindings")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        binding = primaryBinding;
      }
      const phoneBindingId = binding?.id || "87256234-cf00-43d2-85f6-f568c0dd5e73";

      // Format payload for Hermes internal agent endpoint
      const agentBody = JSON.stringify({
        senderPhone: message.from,
        providerMessageId: message.providerMessageId,
        text: message.body || "",
        phoneBindingId,
        timestamp: Date.now(),
        messageType: message.kind || "text",
        mediaId: message.mediaId,
        mimeType: message.mimeType,
      });

      const signed = buildAgentChannelSignature(agentBody);
      if (signed) {
        await fetch(internalAgentUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-stratxcel-timestamp": signed.timestamp,
            "x-stratxcel-nonce": signed.nonce,
            "x-stratxcel-signature": signed.signature,
          },
          body: agentBody,
        });
      }
    } catch (mErr) {
      console.error("[whatsapp-webhook] message routing error:", mErr);
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
