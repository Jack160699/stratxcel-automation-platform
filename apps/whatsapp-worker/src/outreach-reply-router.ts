import { buildAgentChannelSignature } from "@stratxcel/agent-core";

/**
 * PHASE (outbound outreach): pure routing module -- calls the private
 * internal outreach-reply endpoint (POST /api/internal/whatsapp/outreach-reply)
 * for a reply that belongs to a Boss-initiated outreach conversation. Mirrors
 * agent-channel-router.ts's exact shape (same HMAC scheme, same shared
 * secret) rather than inventing a second auth mechanism.
 *
 * Feature-flagged, default OFF (WHATSAPP_OUTREACH_ENABLED). Callers must not
 * invoke this module unless that flag is exactly "true" AND the lead itself
 * was actually created by the outreach tool (source: "whatsapp_outreach") --
 * this module is a pure transport, it does not re-derive that decision.
 */

export interface OutreachReplyOutcome {
  ok: boolean;
  reason?: string;
}

export interface RouteToOutreachReplyInput {
  endpointUrl: string;
  tenantId: string;
  leadId: string;
  conversationId: string;
  phoneBindingId: string;
  providerMessageId: string;
}

/** Never throws -- returns { ok: false } on any transport/signing/non-2xx
 *  failure, the same "fail closed, never crash the poll loop" shape as
 *  routeToAgentChannel. */
export async function routeToOutreachReply(input: RouteToOutreachReplyInput): Promise<OutreachReplyOutcome> {
  const body = JSON.stringify({
    tenantId: input.tenantId,
    leadId: input.leadId,
    conversationId: input.conversationId,
    phoneBindingId: input.phoneBindingId,
    providerMessageId: input.providerMessageId,
  });

  const signed = buildAgentChannelSignature(body);
  if (!signed) return { ok: false, reason: "not_configured" };

  try {
    const response = await fetch(input.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-stratxcel-timestamp": signed.timestamp,
        "x-stratxcel-nonce": signed.nonce,
        "x-stratxcel-signature": signed.signature,
      },
      body,
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const json = (await response.json()) as OutreachReplyOutcome;
    if (json && typeof json === "object" && "ok" in json) return json;
    return { ok: false, reason: "malformed_response" };
  } catch {
    return { ok: false, reason: "transport_error" };
  }
}
