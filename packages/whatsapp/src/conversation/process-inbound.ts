import { createLead, findLeadByNormalizedPhone, findLeadByPhone, updateLeadStatus } from "@stratxcel/leads-and-crm";
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

export interface ProcessInboundResult {
  leadId: string;
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
 * escalation, lead upsert, and service-classification-driven response
 * drafting. Real inbound messages are now persisted to whatsapp_messages
 * (the actual inbox backing store, idempotent by provider_message_id) in
 * addition to — never instead of — the existing shadow-response log
 * (whatsapp_shadow_messages), which still only ever records *proposed,
 * never-sent* automated replies; nothing here calls the WhatsApp send API.
 * Real outbound sending lives in the app-level orchestrator that also
 * checks consent/entitlement/kill-switch (see lib/whatsapp/send-outbound.ts).
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
    await updateLeadStatus(supabase, { leadId: lead.id, status: "LOST" });
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
    return { leadId: lead.id, optedOut: true, escalated: false, escalationReason: null, proposedResponse: null, serviceKey: null, confidence: "high" };
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
    return { leadId: lead.id, optedOut: false, escalated: false, escalationReason: null, proposedResponse: null, serviceKey: null, confidence: "low" };
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
    return { leadId: lead.id, optedOut: false, escalated: true, escalationReason: escalation.reason, proposedResponse: null, serviceKey: null, confidence: "high" };
  }

  executionTrace.push(`compiler:${compiled.matched ? "matched" : "fallback"}:${compiled.serviceKey}`);
  const proposedResponse = composeProposedResponse(compiled);
  const confidence: "high" | "low" = compiled.matched ? "high" : "low";

  await recordShadowResponse(supabase, {
    tenantId: input.tenantId,
    leadId: lead.id,
    sourceMessageId: input.message.providerMessageId,
    proposedResponse,
    confidence,
    rulePath: compiled.serviceKey,
    executionTrace,
  });

  await recordAuditEvent(supabase, {
    tenantId: input.tenantId,
    actorKind: "integration",
    action: "whatsapp.message_processed",
    targetType: "crm_lead",
    targetId: lead.id,
    metadata: { serviceKey: compiled.serviceKey },
  });

  return { leadId: lead.id, optedOut: false, escalated: false, escalationReason: null, proposedResponse, serviceKey: compiled.serviceKey, confidence };
}
