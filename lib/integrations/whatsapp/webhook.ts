import { verifyMetaSignature } from "../../social/webhook-signature.ts";
import type { ParsedInboundWhatsAppMessage } from "./types";

/**
 * WhatsApp Cloud API webhooks are signed identically to the other Meta
 * Graph webhooks this repo already verifies (X-Hub-Signature-256, HMAC-SHA256
 * of the raw body) — reuses verifyMetaSignature rather than re-implementing
 * the same crypto a second time.
 */
export function verifyWhatsAppWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;
  return verifyMetaSignature(rawBody, signatureHeader, appSecret);
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
 * porting that logic is scoped to a later phase once the language decision
 * for the WhatsApp service is made.
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
