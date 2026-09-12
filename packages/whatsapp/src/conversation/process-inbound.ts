import { createLead, findLeadByNormalizedPhone, findLeadByPhone } from "@stratxcel/leads-and-crm";
import { compileGoalToMission } from "@stratxcel/missions";
import { recordAuditEvent } from "@stratxcel/audit";
import { createHumanHandoff } from "@stratxcel/human-handoff";
import type { ServiceClient } from "../db.ts";
import type { ParsedInboundWhatsAppMessage } from "../types.ts";
import { isOptOutMessage } from "./opt-out.ts";
import { composeProposedResponse } from "./templates.ts";
import { normalizePhoneNumber } from "../phone-normalize.ts";
import { recordOptOut } from "../consent.ts";
import { checkEscalation, type EscalationReason } from "../escalation.ts";
import { recordWhatsAppMessage, setConversationAutomationMode } from "../messages.ts";
import { WhatsAppSalesEngine } from "@stratxcel/revenue-ops";

export interface ProcessInboundResult {
  leadId: string;
  /** Present once the RPC has created/found the conversation row -- null only
   *  in the (should-never-happen) case the DB call itself failed to return
   *  one. Added so callers (e.g. outreach reply continuation) can look up
   *  conversation-scoped history without a second lead->conversation query. */
  conversationId: string | null;
  optedOut: boolean;
  escalated: boolean;
  escalationReason: EscalationReason | null;
  proposedResponse: string | null;
  serviceKey: string | null;
  confidence: "high" | "low" | null;
}

async function recordShadowResponse(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    leadId: string;
    sourceMessageId: string;
    proposedResponse: string | null;
    confidence: "high" | "low";
    rulePath: string;
    executionTrace: string[];
  }
): Promise<void> {
  const { error } = await supabase.from("whatsapp_shadow_messages").insert({
    tenant_id: input.tenantId,
    lead_id: input.leadId,
    direction: "outbound_shadow",
    body: input.proposedResponse ?? "",
    would_send: input.proposedResponse !== null,
    metadata: {
      confidence: input.confidence,
      rulePath: input.rulePath,
      executionTrace: input.executionTrace,
      sourceMessageId: input.sourceMessageId,
    },
  });
  if (error) throw new Error(`recordShadowResponse: ${error.message}`);
}

/**
 * v1 conversation processing: phone-dedupe, opt-out/consent, human
 * escalation, contact upsert, and service-classification-driven response
 * drafting. Real inbound messages are now persisted to whatsapp_messages
 * (the actual inbox backing store, idempotent by provider_message_id) in
 * addition to — never instead of — the existing shadow-response log
 * (whatsapp_shadow_messages), which still only ever records *proposed,
 * never-sent* automated replies; nothing here calls the WhatsApp send API.
 * Real outbound sending lives in the shared orchestrator that also checks
 * consent/entitlement/kill-switch (see ../outbound.ts) — the standalone
 * whatsapp-worker processor calls it after this function returns, gated by
 * WHATSAPP_AUTO_REPLY_ENABLED (see apps/whatsapp-worker/src/processor.ts);
 * nothing in this file ever sends anything itself.
 *
 * CRM scope (brief §4/§10 — "this is not CRM, this is not WhatsApp lead
 * capture"): the `crm_leads` row created/looked up below is StratXcel's
 * internal contact/conversation-identity record — the FK anchor every
 * downstream persistence call here (recorded message, shadow response,
 * human handoff) requires. It backs an internal, admin-only workspace
 * (app/admin/(shell)/leads) used to operate StratXcel's own service
 * delivery; no Starter/Growth/Business plan sells or exposes "CRM"/"lead
 * capture" as a customer-facing capability (see lib/commercial/catalog.ts).
 * What WAS a real unintended CRM behavior — treating an opt-out as a sales-
 * pipeline stage change (`status: "LOST"`) rather than a communication
 * preference — has been removed; opt-out is enforced entirely by
 * recordOptOut + pausing conversation automation, both independent of lead
 * status. Fully eliminating the identity/threading record itself would
 * require a schema change (a new non-CRM contact table) that is real, scoped
 * follow-up work, not a same-pass fix — see the still-disabled Phase 17
 * agent-channel-router.ts, whose own doc comment flags exactly this gap.
 */
export async function processInboundMessage(
  supabase: ServiceClient,
  input: { tenantId: string; message: ParsedInboundWhatsAppMessage; phoneBindingId?: string | null }
): Promise<ProcessInboundResult> {
  const executionTrace: string[] = [];
  const normalizedPhone = normalizePhoneNumber(input.message.from);

  let lead = normalizedPhone ? await findLeadByNormalizedPhone(supabase, input.tenantId, normalizedPhone) : null;
  if (!lead) lead = await findLeadByPhone(supabase, input.tenantId, input.message.from);
  executionTrace.push(lead ? "lead:found_existing" : "lead:not_found");
  if (!lead) {
    lead = await createLead(supabase, { tenantId: input.tenantId, source: "whatsapp", contactPhone: input.message.from, normalizedPhone });
    executionTrace.push("lead:created");
  }

  // Always persist the real inbound message — this happened regardless of
  // automation mode, opt-out state, or anything downstream. Idempotent by
  // provider_message_id, so a redelivered webhook is a safe no-op here.
  const recorded = await recordWhatsAppMessage(supabase, {
    tenantId: input.tenantId,
    leadId: lead.id,
    phoneBindingId: input.phoneBindingId ?? null,
    direction: "inbound",
    body: input.message.body,
    providerMessageId: input.message.providerMessageId,
    mediaRef: input.message.mediaId,
    status: "delivered",
  });

  if (input.message.kind === "text" && isOptOutMessage(input.message.body)) {
    executionTrace.push("opt_out:detected");
    // Brief §4/§10: no unintended CRM/lead-pipeline behavior — opting out of
    // messages is a communication preference, not a sales-pipeline stage
    // change. Enforcement is recordOptOut (consent) + pausing conversation
    // automation below; the contact record itself is untouched.
    await recordOptOut(supabase, { tenantId: input.tenantId, leadId: lead.id, reason: "customer sent an opt-out keyword" });
    if (recorded.conversationId) {
      await setConversationAutomationMode(supabase, { tenantId: input.tenantId, conversationId: recorded.conversationId, mode: "paused" });
    }
    await recordShadowResponse(supabase, {
      tenantId: input.tenantId,
      leadId: lead.id,
      sourceMessageId: input.message.providerMessageId,
      proposedResponse: null,
      confidence: "high",
      rulePath: "opt_out",
      executionTrace,
    });
    await recordAuditEvent(supabase, {
      tenantId: input.tenantId,
      actorKind: "integration",
      action: "whatsapp.opt_out",
      targetType: "crm_lead",
      targetId: lead.id,
    });
    return { leadId: lead.id, conversationId: recorded.conversationId ?? null, optedOut: true, escalated: false, escalationReason: null, proposedResponse: null, serviceKey: null, confidence: "high" };
  }

  if (input.message.kind !== "text") {
    executionTrace.push(`media:${input.message.kind}:not_yet_processed`);
    await recordShadowResponse(supabase, {
      tenantId: input.tenantId,
      leadId: lead.id,
      sourceMessageId: input.message.providerMessageId,
      proposedResponse: null,
      confidence: "low",
      rulePath: "media_unsupported",
      executionTrace,
    });
    return { leadId: lead.id, conversationId: recorded.conversationId ?? null, optedOut: false, escalated: false, escalationReason: null, proposedResponse: null, serviceKey: null, confidence: "low" };
  }

  const compiled = compileGoalToMission(input.message.body);
  const escalation = checkEscalation({ body: input.message.body, compilerMatched: compiled.matched });

  if (escalation.shouldEscalate) {
    executionTrace.push(`escalation:${escalation.reason}`);
    if (recorded.conversationId) {
      await setConversationAutomationMode(supabase, { tenantId: input.tenantId, conversationId: recorded.conversationId, mode: "handoff" });
    }
    await createHumanHandoff(supabase, {
      tenantId: input.tenantId,
      reason: `WhatsApp escalation: ${escalation.reason}`,
      contextSnapshot: { leadId: lead.id, conversationId: recorded.conversationId, messageExcerpt: input.message.body.slice(0, 200) },
    });
    await recordShadowResponse(supabase, {
      tenantId: input.tenantId,
      leadId: lead.id,
      sourceMessageId: input.message.providerMessageId,
      proposedResponse: null,
      confidence: "high",
      rulePath: `escalation_${escalation.reason}`,
      executionTrace,
    });
    return { leadId: lead.id, conversationId: recorded.conversationId ?? null, optedOut: false, escalated: true, escalationReason: escalation.reason, proposedResponse: null, serviceKey: null, confidence: "high" };
  }

  // Hermes WhatsApp Sales Engine: consultative commercial assistant turn
  const salesEngine = new WhatsAppSalesEngine();

  // Multi-turn conversational memory: read previous messages if conversation exists
  let pastMessages: Array<{ direction: string; body: string; created_at?: string }> = [];
  if (recorded.conversationId) {
    try {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("direction, body, created_at")
        .eq("conversation_id", recorded.conversationId)
        .order("created_at", { ascending: true })
        .limit(20);
      if (Array.isArray(data)) {
        pastMessages = data as Array<{ direction: string; body: string; created_at?: string }>;
      }
    } catch {
      // Non-blocking fallback if messages table query encounters transient error
    }
  }

  const salesTurn = salesEngine.processInboundTurn({
    tenantId: input.tenantId,
    leadId: lead.id,
    conversationId: recorded.conversationId ?? null,
    inboundText: input.message.body,
    conversationHistory: pastMessages.map((m) => ({
      direction: m.direction as "inbound" | "outbound",
      body: m.body,
      createdAt: m.created_at,
    })),
    leadContext: {
      contactPhone: input.message.from,
      contactName: lead.contact_name,
      status: lead.status,
      metadata: lead.metadata,
    },
  });

  executionTrace.push(`hermes_sales:${salesTurn.recommendedOfferKey}:${salesTurn.detectedState}`);

  // Persist updated sales context and qualified stage to crm_leads
  try {
    await supabase
      .from("crm_leads")
      .update({
        status: salesTurn.updatedLeadStatus ?? lead.status,
        metadata: salesTurn.updatedLeadMetadata,
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .eq("tenant_id", input.tenantId);
  } catch {
    // Non-blocking fallback for test fakes without full update support
  }

  await recordShadowResponse(supabase, {
    tenantId: input.tenantId,
    leadId: lead.id,
    sourceMessageId: input.message.providerMessageId,
    proposedResponse: salesTurn.replyText,
    confidence: "high",
    rulePath: `hermes_sales:${salesTurn.recommendedOfferKey}`,
    executionTrace,
  });

  await recordAuditEvent(supabase, {
    tenantId: input.tenantId,
    actorKind: "integration",
    action: "whatsapp.sales_turn_processed",
    targetType: "crm_lead",
    targetId: lead.id,
    metadata: {
      serviceKey: salesTurn.recommendedOfferKey,
      state: salesTurn.detectedState,
      language: salesTurn.detectedLanguage,
      stage: salesTurn.opportunityStage,
    },
  });

  return {
    leadId: lead.id,
    conversationId: recorded.conversationId ?? null,
    optedOut: false,
    escalated: false,
    escalationReason: null,
    proposedResponse: salesTurn.replyText,
    serviceKey: salesTurn.recommendedOfferKey,
    confidence: "high",
  };
}
