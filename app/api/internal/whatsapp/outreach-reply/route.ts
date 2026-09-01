import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { verifyAgentChannelRequest } from "@stratxcel/agent-core";
import { listMessagesForConversation, sendOutboundWhatsAppMessage, type ServiceClient } from "@stratxcel/whatsapp";
import { resolveConfiguredProvider } from "@/lib/social/agent/provider";
import type { AgentTurnMessage } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Private, HMAC-authenticated endpoint that continues a Boss-initiated
 * outreach conversation once the external contact replies. Called by the
 * AWS WhatsApp worker (apps/whatsapp-worker/src/outreach-reply-router.ts),
 * mirroring app/api/internal/agent/whatsapp/route.ts's auth pattern exactly
 * (same shared secret, same canonical-message scheme) -- reused rather than
 * inventing a second auth mechanism.
 *
 * Deliberately NOT routed through packages/agent-core's runAgentTurn/tool
 * loop: the person replying is an external, unauthenticated third party --
 * the agent-core security model correctly never issues them an
 * AgentPrincipal, so they must never reach a tool registry. This endpoint
 * only ever produces TEXT (no tools passed to the provider at all) and sends
 * it back through the one hardened outbound choke point
 * (sendOutboundWhatsAppMessage) -- it has no mutation capability whatsoever,
 * which is also why it needs no separate "high-risk action" confirmation:
 * there is nothing here a confirmation could gate.
 */

const OUTREACH_GUIDANCE: Record<string, string> = {
  SALES: "Understand their problem first, then qualify genuine need before recommending anything. Recommend only what's actually relevant. Never a generic service-catalog dump.",
  PARTNERSHIP: "First understand their business and what they actually offer. Only once that's clear, identify complementary capabilities and a real commercial fit. Do not lead with Stratxcel's own services.",
  OUTREACH: "Keep it natural and low-pressure. Learn about them before proposing anything.",
  FOLLOW_UP: "Pick the conversation back up naturally, referencing what was discussed before.",
  EXPLAINER: "Answer their questions clearly and concisely. Don't oversell.",
  HR: "Gather role context, availability, experience, and basic qualification only. Never extend an offer, promise compensation, or make a hiring decision -- say a real person will follow up for that.",
};

function requireEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

interface OutreachReplyRequestBody {
  tenantId?: unknown;
  leadId?: unknown;
  conversationId?: unknown;
  phoneBindingId?: unknown;
  providerMessageId?: unknown;
}

function validate(body: OutreachReplyRequestBody): string | null {
  if (typeof body.tenantId !== "string" || !body.tenantId) return "tenantId required";
  if (typeof body.leadId !== "string" || !body.leadId) return "leadId required";
  if (typeof body.conversationId !== "string" || !body.conversationId) return "conversationId required";
  if (typeof body.phoneBindingId !== "string" || !body.phoneBindingId) return "phoneBindingId required";
  if (typeof body.providerMessageId !== "string" || !body.providerMessageId) return "providerMessageId required";
  return null;
}

export async function POST(request: Request) {
  if (process.env.WHATSAPP_OUTREACH_ENABLED !== "true") {
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
    if (auth.reason === "replayed_nonce") return Response.json({ error: "conflict" }, { status: 409 });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: OutreachReplyRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const schemaError = validate(body);
  if (schemaError) return Response.json({ error: schemaError }, { status: 400 });
  const { tenantId, leadId, conversationId, phoneBindingId, providerMessageId } = body as Required<OutreachReplyRequestBody> as {
    tenantId: string; leadId: string; conversationId: string; phoneBindingId: string; providerMessageId: string;
  };

  const { supabase } = getTenantServiceContext();

  try {
    const outcome = await continueOutreachConversation(supabase, { tenantId, leadId, conversationId, phoneBindingId, providerMessageId });
    return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never leak internals to a caller that only holds a shared secret, not
    // a human waiting on a reply -- the worker just logs this and moves on.
    return Response.json({ ok: false, reason: "outreach_reply_failed" }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}

async function continueOutreachConversation(
  supabase: ServiceClient,
  input: { tenantId: string; leadId: string; conversationId: string; phoneBindingId: string; providerMessageId: string }
): Promise<{ ok: boolean; reason?: string }> {
  const { data: lead, error: leadError } = await supabase
    .from("crm_leads")
    .select("id, tenant_id, contact_name, normalized_phone, metadata")
    .eq("id", input.leadId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (leadError || !lead) return { ok: false, reason: "lead_not_found" };

  const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
  const purpose = typeof metadata.outreachPurpose === "string" ? metadata.outreachPurpose : null;
  const conversationRole = typeof metadata.conversationRole === "string" ? metadata.conversationRole : "OUTREACH";
  // Defense in depth: this endpoint must only ever act on a lead the outreach
  // tool actually created/tagged -- never a normal inbound customer/prospect
  // lead, even if this endpoint were ever called for one by mistake.
  if (!purpose) return { ok: false, reason: "not_an_outreach_lead" };

  const history = await listMessagesForConversation(supabase, input.tenantId, input.conversationId, 30);
  const transcript: AgentTurnMessage[] = history.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.body ?? "",
  }));

  const guidance = OUTREACH_GUIDANCE[conversationRole] ?? OUTREACH_GUIDANCE.OUTREACH;
  const systemPrompt = [
    `You are messaging on behalf of Stratxcel, a WhatsApp-first AI marketing agency for small businesses.`,
    `You (Stratxcel) reached out to ${lead.contact_name ?? "this contact"} for this specific reason: ${purpose}`,
    `Conversation type: ${conversationRole}. ${guidance}`,
    `Continue this WhatsApp conversation naturally, in the language/tone they use. Keep replies short -- this is WhatsApp, not email.`,
    `Never make a pricing commitment, contract, guarantee, or other binding promise -- if it's heading there, say a Stratxcel team member will follow up on specifics, and continue gathering context in the meantime.`,
    `You have no tools and cannot take any action beyond replying in text -- do not claim to have done anything you haven't.`,
  ].join("\n");

  const provider = resolveConfiguredProvider();
  if (!provider) return { ok: false, reason: "provider_not_configured" };

  const platformTenantId = requireEnv("STRATXCEL_PLATFORM_TENANT_ID");
  const result = await provider.complete(
    [{ role: "system", content: systemPrompt }, ...transcript],
    [],
    { brandInstructions: [], tenantId: platformTenantId ?? input.tenantId }
  );
  const replyText = result.text.trim();
  if (!replyText) return { ok: false, reason: "empty_completion" };

  const sendOutcome = await sendOutboundWhatsAppMessage(supabase, {
    tenantId: input.tenantId,
    leadId: input.leadId,
    body: replyText,
    idempotencyKey: `outreach_reply:${input.providerMessageId}`,
    senderPhoneBindingId: input.phoneBindingId,
    isHumanInitiated: false,
  });

  return sendOutcome.ok ? { ok: true } : { ok: false, reason: sendOutcome.reason };
}
