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

interface WhatsAppWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          id: string;
          from: string;
          timestamp: string;
          text?: { body?: string };
          type?: string;
        }[];
      };
    }[];
  }[];
}

/**
 * Flattens the WhatsApp Cloud API's deeply nested entry/changes/value
 * structure into a flat list of messages. Only text messages are
 * extracted in this v1 — media/interactive message types are recognized
 * by the legacy bot (per docs/discovery/OAUTH_WEBHOOK_CALLBACK_MAP.md) but
 * porting that logic is scoped to a later phase.
 */
export function parseInboundWhatsAppWebhook(payload: unknown): ParsedInboundWhatsAppMessage[] {
  const body = payload as WhatsAppWebhookPayload;
  const messages: ParsedInboundWhatsAppMessage[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type && message.type !== "text") continue;
        if (!message.text?.body) continue;
        messages.push({
          from: message.from,
          body: message.text.body,
          providerMessageId: message.id,
          timestampIso: new Date(Number(message.timestamp) * 1000).toISOString(),
        });
      }
    }
  }

  return messages;
}
