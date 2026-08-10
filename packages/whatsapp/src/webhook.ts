import crypto from "node:crypto";
import type { ParsedInboundWhatsAppMessage } from "./types.ts";

/**
 * WhatsApp Cloud API webhooks are signed with X-Hub-Signature-256: HMAC-SHA256
 * of the raw request body, keyed by the receiving app's secret, hex-encoded
 * and prefixed "sha256=" — the same scheme the main dashboard app already
 * verifies for its other Meta webhooks (lib/social/webhook-signature.ts).
 * This package can't depend on that app-internal file (it must be
 * importable by the standalone whatsapp-worker without pulling in the
 * Next.js app), so the ~10-line HMAC check is duplicated here rather than
 * reached back into apps/web for.
 * https://developers.facebook.com/docs/messenger-platform/webhooks#security
 */
export function verifyWhatsAppWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!signatureHeader || !appSecret) return false;

  const [scheme, providedHex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !providedHex) return false;

  const expectedHex = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const provided = Buffer.from(providedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

interface RawWhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
  audio?: { id?: string; mime_type?: string };
  voice?: { id?: string; mime_type?: string };
  interactive?: { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
}

interface RawWhatsAppStatus {
  id: string; // provider message ID (the outbound message this status is about)
  status?: string; // sent | delivered | read | failed
  timestamp?: string;
}

interface WhatsAppWebhookPayload {
  entry?: {
    id?: string; // WABA ID
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        messages?: RawWhatsAppMessage[];
        statuses?: RawWhatsAppStatus[];
      };
    }[];
  }[];
}

export interface ParsedWhatsAppStatusUpdate {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  phoneNumberId: string;
}

/**
 * Meta's delivery-receipt webhooks (`statuses`, not `messages`) — separate
 * from parseInboundWhatsAppWebhook because they describe an *outbound*
 * message's lifecycle, not new inbound content. Statuses Meta can send
 * that this product doesn't track (e.g. `deleted`) are skipped, not guessed
 * at.
 */
export function parseWhatsAppStatusUpdates(payload: unknown): ParsedWhatsAppStatusUpdate[] {
  const body = payload as WhatsAppWebhookPayload;
  const updates: ParsedWhatsAppStatusUpdate[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const status of change.value?.statuses ?? []) {
        if (status.status === "sent" || status.status === "delivered" || status.status === "read" || status.status === "failed") {
          updates.push({ providerMessageId: status.id, status: status.status, phoneNumberId });
        }
      }
    }
  }

  return updates;
}

/**
 * Classifies a raw Cloud API message into the kinds this platform
 * understands, extracting whatever body/caption/media-id applies. Message
 * types Meta sends that aren't in this list (location, contacts, sticker,
 * interactive replies, reactions) fall through to "unsupported" — recorded,
 * not silently dropped, but not yet processed by conversation logic.
 */
function classifyMessage(message: RawWhatsAppMessage): {
  kind: ParsedInboundWhatsAppMessage["kind"];
  body: string;
  mediaId: string | null;
  mimeType: string | null;
} {
  switch (message.type) {
    case "text":
      return { kind: "text", body: message.text?.body ?? "", mediaId: null, mimeType: null };
    case "image":
      return { kind: "image", body: message.image?.caption ?? "", mediaId: message.image?.id ?? null, mimeType: message.image?.mime_type ?? null };
    case "document":
      return {
        kind: "document",
        body: message.document?.caption ?? message.document?.filename ?? "",
        mediaId: message.document?.id ?? null,
        mimeType: message.document?.mime_type ?? null,
      };
    case "audio":
      return { kind: "audio", body: "", mediaId: message.audio?.id ?? null, mimeType: message.audio?.mime_type ?? null };
    case "voice":
      return { kind: "voice", body: "", mediaId: message.voice?.id ?? null, mimeType: message.voice?.mime_type ?? null };
    case "interactive": {
      const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
      return { kind: "text", body: reply?.id ?? reply?.title ?? "", mediaId: null, mimeType: null };
    }
    default:
      return { kind: "unsupported", body: "", mediaId: null, mimeType: null };
  }
}

/**
 * Flattens the WhatsApp Cloud API's deeply nested entry/changes/value
 * structure into a flat list of normalized messages, carrying the
 * receiving phone_number_id on every message so the caller can resolve the
 * owning tenant per-message rather than assuming one tenant per webhook
 * delivery (a single delivery can only ever contain changes for one WABA
 * in practice, but per-message carriage costs nothing and removes the
 * assumption).
 */
export function parseInboundWhatsAppWebhook(payload: unknown): ParsedInboundWhatsAppMessage[] {
  const body = payload as WhatsAppWebhookPayload;
  const messages: ParsedInboundWhatsAppMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue; // can't route without it — skip rather than guess

      for (const message of change.value?.messages ?? []) {
        const classified = classifyMessage(message);
        if (classified.kind === "unsupported") continue;

        messages.push({
          from: message.from,
          body: classified.body,
          kind: classified.kind,
          mediaId: classified.mediaId,
          mimeType: classified.mimeType,
          providerMessageId: message.id,
          timestampIso: new Date(Number(message.timestamp) * 1000).toISOString(),
          phoneNumberId,
          wabaId: entry.id ?? null,
          displayPhoneNumber: change.value?.metadata?.display_phone_number ?? null,
        });
      }
    }
  }

  return messages;
}
