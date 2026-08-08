import { buildAgentChannelSignature, isWhatsAppAgentChannelEnabled } from "@stratxcel/agent-core";
import type { ParsedInboundWhatsAppMessage } from "@stratxcel/whatsapp";

/**
 * PHASE 17: pure routing module — calls the private internal agent endpoint
 * (POST /api/internal/agent/whatsapp) for a message that MIGHT belong to a
 * linked staff/client principal, BEFORE processInboundMessage ever runs.
 * This ordering is what guarantees a linked principal's message never
 * creates a CRM lead / runs the prospect flow (see PHASE "VERY IMPORTANT" —
 * processInboundMessage always creates a lead on first contact, so it must
 * only run for senders this module reports as "unlinked").
 *
 * Feature-flagged, default OFF (WHATSAPP_AGENT_CHANNEL_ENABLED). When the
 * flag is absent or not exactly "true", callers must not invoke this module
 * at all — see processor.ts's single flag check, which is the only call
 * site. Nothing calls this endpoint in production today.
 */

export type AgentChannelOutcome =
  | { outcome: "unlinked" }
  | { outcome: "reply"; text: string }
  | { outcome: "unsupported_agent_media" }
  | { outcome: "unavailable"; text: string };

export interface RouteToAgentChannelInput {
  endpointUrl: string;
  message: ParsedInboundWhatsAppMessage;
  phoneBindingId?: string | null;
}

/**
 * Returns { outcome: "unavailable" } (never throws) on any transport,
 * signing, or non-2xx failure — PHASE 22 requires a deterministic failure
 * result for a linked principal, never a silent fall-back to the prospect
 * flow. The caller (processOnce) still must not treat "unavailable" as
 * "unlinked" — see its own handling.
 */
export async function routeToAgentChannel(input: RouteToAgentChannelInput): Promise<AgentChannelOutcome> {
  if (!isWhatsAppAgentChannelEnabled()) {
    // Defensive — the only call site already gates on this, but a pure
    // module should never assume it's only ever called correctly.
    return { outcome: "unlinked" };
  }

  const body = JSON.stringify({
    senderPhone: input.message.from,
    providerMessageId: input.message.providerMessageId,
    text: input.message.body ?? "",
    phoneBindingId: input.phoneBindingId ?? null,
    timestamp: Date.now(),
    messageType: input.message.kind ?? "text",
  });

  const signed = buildAgentChannelSignature(body);
  if (!signed) {
    return { outcome: "unavailable", text: "Stratxcel Agent is temporarily unavailable. Please try again shortly or use the dashboard." };
  }

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

    if (!response.ok) {
      return { outcome: "unavailable", text: "Stratxcel Agent is temporarily unavailable. Please try again shortly or use the dashboard." };
    }

    const json = (await response.json()) as AgentChannelOutcome;
    if (json && typeof json === "object" && "outcome" in json) return json;
    return { outcome: "unavailable", text: "Stratxcel Agent is temporarily unavailable. Please try again shortly or use the dashboard." };
  } catch {
    return { outcome: "unavailable", text: "Stratxcel Agent is temporarily unavailable. Please try again shortly or use the dashboard." };
  }
}
