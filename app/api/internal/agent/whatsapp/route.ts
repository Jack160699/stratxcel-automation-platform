import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { normalizePhoneNumber } from "@stratxcel/whatsapp";
import {
  isInternalAgentEndpointEnabled,
  verifyAgentChannelRequest,
  parseCommand,
  resolveWhatsAppPrincipal,
  touchPrincipalLastUsed,
  handleLinkCommand,
  handleWhoAmI,
  handleReset,
  handleConfirm,
  handleCancel,
  handleHelp,
  runAgentTurn,
  formatAgentReply,
} from "@stratxcel/agent-core";
import { createAgentCoreProviderAdapter } from "@/lib/agent-core/provider-adapter";
import { SOCIAL_DELEGATION_TOOLS } from "@/lib/agent-core/social-delegation-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PHASE 16: private, HMAC-authenticated endpoint for the WhatsApp agent
 * channel. NOT a browser/client endpoint — intended to eventually be called
 * by the AWS WhatsApp worker (apps/whatsapp-worker), behind
 * WHATSAPP_AGENT_CHANNEL_ENABLED, once that integration is explicitly
 * reviewed and shipped (see PHASE 17 — the worker-side call site is NOT
 * wired up by this branch; see docs/architecture/WHATSAPP_AGENT_CHANNEL.md).
 * Nothing calls this endpoint in production today.
 *
 * Trust boundary: the caller supplies only channel FACTS (senderPhone,
 * providerMessageId, text, phoneBindingId, timestamp, messageType) — never
 * tenantId, role, or principal type. All of that is resolved server-side
 * from the sender's verified phone link (resolveWhatsAppPrincipal).
 */

interface AgentChannelRequestBody {
  senderPhone?: unknown;
  providerMessageId?: unknown;
  text?: unknown;
  phoneBindingId?: unknown;
  timestamp?: unknown;
  messageType?: unknown;
}

function validateBody(body: AgentChannelRequestBody): string | null {
  if (typeof body.senderPhone !== "string" || !body.senderPhone) return "senderPhone required";
  if (typeof body.providerMessageId !== "string" || !body.providerMessageId) return "providerMessageId required";
  if (typeof body.text !== "string") return "text required";
  if (body.text.length > 4000) return "text too large";
  if (body.phoneBindingId !== undefined && body.phoneBindingId !== null && typeof body.phoneBindingId !== "string") {
    return "phoneBindingId must be a string";
  }
  if (body.messageType !== undefined && body.messageType !== null && typeof body.messageType !== "string") {
    return "messageType must be a string";
  }
  return null;
}

export async function POST(request: Request) {
  if (!isInternalAgentEndpointEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const rawBody = await request.text();

  const auth = verifyAgentChannelRequest({
    rawBody,
    timestampHeader: request.headers.get("x-stratxcel-timestamp"),
    nonceHeader: request.headers.get("x-stratxcel-nonce"),
    signatureHeader: request.headers.get("x-stratxcel-signature"),
  });
  if (!auth.ok) {
    // PHASE HMAC requirement: replay gets a distinct status (409); every
    // other failure mode looks identical to the caller (401) — never
    // distinguish "not configured" from "bad signature".
    if (auth.reason === "replayed_nonce") {
      return Response.json({ error: "conflict" }, { status: 409 });
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: AgentChannelRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "invalid_body" }, { status: 400 });

  const schemaError = validateBody(body);
  if (schemaError) return Response.json({ error: schemaError }, { status: 400 });

  const senderPhone = body.senderPhone as string;
  const providerMessageId = body.providerMessageId as string;
  const text = body.text as string;
  const messageType = typeof body.messageType === "string" ? body.messageType : "text";

  const normalizedPhone = normalizePhoneNumber(senderPhone);
  if (!normalizedPhone) return Response.json({ error: "invalid_sender_phone" }, { status: 400 });

  const { supabase } = getTenantServiceContext();

  // PHASE 23: text-only v1. Non-text messages get a typed response and are
  // never analyzed — existing prospect media behavior is untouched because
  // this endpoint only ever runs for a message the worker already decided
  // to route here (behind the still-default-off feature flag).
  if (messageType !== "text") {
    return Response.json({ outcome: "unsupported_agent_media" }, { headers: { "Cache-Control": "no-store" } });
  }

  // Deterministic command parsing happens BEFORE principal resolution
  // matters for LINK specifically, because LINK is how an UNLINKED sender
  // becomes linked — see command-parser.ts's header comment for why this
  // ordering (parse before any LLM) is a security requirement in general.
  const parsed = parseCommand(text);

  if (parsed.kind === "link") {
    const reply = await handleLinkCommand(supabase, normalizedPhone, parsed.code);
    return Response.json({ outcome: "reply", text: reply }, { headers: { "Cache-Control": "no-store" } });
  }

  // A malformed LINK attempt ("LINK", "LINK ADMIN" with no/bad code) is
  // clearly a pairing attempt, not a sales inquiry — worth a helpful nudge
  // even for a still-unlinked sender, rather than silently falling through
  // to the prospect flow. The nudge text discloses nothing sender-specific.
  if (parsed.kind === "malformed" && parsed.attempted === "link") {
    return Response.json(
      { outcome: "reply", text: formatAgentReply({ text: "That LINK command doesn't look right. Send HELP for the exact format." }) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const resolution = await resolveWhatsAppPrincipal(supabase, normalizedPhone, "whatsapp");

  if (resolution.status !== "resolved") {
    // Covers BOTH "never linked" and "revoked" — the caller (AWS worker)
    // cannot distinguish the two, and neither creates a principal here.
    // The worker keeps this sender in the existing prospect/CRM flow.
    if (parsed.kind === "whoami") {
      return Response.json({ outcome: "reply", text: handleWhoAmI(resolution) }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ outcome: "unlinked" }, { headers: { "Cache-Control": "no-store" } });
  }

  const principal = resolution.principal;
  await touchPrincipalLastUsed(supabase, normalizedPhone);

  if (parsed.kind === "whoami") {
    return Response.json({ outcome: "reply", text: handleWhoAmI(resolution) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (parsed.kind === "help") {
    return Response.json({ outcome: "reply", text: handleHelp() }, { headers: { "Cache-Control": "no-store" } });
  }
  if (parsed.kind === "reset") {
    const reply = await handleReset(supabase, principal);
    return Response.json({ outcome: "reply", text: reply }, { headers: { "Cache-Control": "no-store" } });
  }
  if (parsed.kind === "confirm") {
    const { reply } = await handleConfirm(supabase, principal, parsed.code, SOCIAL_DELEGATION_TOOLS);
    return Response.json({ outcome: "reply", text: reply }, { headers: { "Cache-Control": "no-store" } });
  }
  if (parsed.kind === "cancel") {
    const reply = await handleCancel(supabase, principal, parsed.code);
    return Response.json({ outcome: "reply", text: reply }, { headers: { "Cache-Control": "no-store" } });
  }
  if (parsed.kind === "malformed") {
    return Response.json(
      { outcome: "reply", text: formatAgentReply({ text: `That ${parsed.attempted.toUpperCase()} command doesn't look right. Send HELP for the exact format.` }) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // parsed.kind === "none" — a normal conversational turn for a LINKED
  // principal. PHASE 22: on failure, this must NEVER fall back to
  // prospect/sales behavior — that only applies to genuinely unlinked
  // senders, handled entirely above.
  try {
    const result = await runAgentTurn({
      supabase,
      principal,
      provider: createAgentCoreProviderAdapter(),
      userText: text,
      providerMessageId,
      extraTools: SOCIAL_DELEGATION_TOOLS,
    });

    if (result.status === "duplicate") {
      // Idempotent redelivery of the same providerMessageId — do not
      // re-invoke anything; nothing new to say.
      return Response.json({ outcome: "reply", text: "" }, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ outcome: "reply", text: result.replyText }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { outcome: "unavailable", text: "Stratxcel Agent is temporarily unavailable. Please try again shortly or use the dashboard." },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
