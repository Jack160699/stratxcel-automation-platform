import { createLead, findLeadByPhone, updateLeadStatus } from "@stratxcel/leads-and-crm";
import { compileGoalToMission } from "@stratxcel/missions";
import { recordAuditEvent } from "@stratxcel/audit";
import type { ServiceClient } from "../db.ts";
import type { ParsedInboundWhatsAppMessage } from "../types.ts";
import { isOptOutMessage } from "./opt-out.ts";
import { composeProposedResponse } from "./templates.ts";

export interface ProcessInboundResult {
  leadId: string;
  optedOut: boolean;
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
 * v1 conversation processing: opt-out detection, lead upsert, and
 * service-classification-driven response drafting — always shadow-only
 * (see recordShadowResponse; nothing here ever calls the WhatsApp send
 * API). This is real, working logic, not a stub, but it is NOT a port of
 * the legacy bot's actual conversational flows (appointment/booking,
 * proposal/quotation, escalation, follow-up) — those are tracked as open
 * items in WHATSAPP_PARITY_REPORT.md against their legacy source files
 * rather than approximated here.
 */
export async function processInboundMessage(
  supabase: ServiceClient,
  input: { tenantId: string; message: ParsedInboundWhatsAppMessage }
): Promise<ProcessInboundResult> {
  const executionTrace: string[] = [];

  let lead = await findLeadByPhone(supabase, input.tenantId, input.message.from);
  executionTrace.push(lead ? "lead:found_existing" : "lead:not_found");
  if (!lead) {
    lead = await createLead(supabase, { tenantId: input.tenantId, source: "whatsapp", contactPhone: input.message.from });
    executionTrace.push("lead:created");
  }

  if (input.message.kind === "text" && isOptOutMessage(input.message.body)) {
    executionTrace.push("opt_out:detected");
    await updateLeadStatus(supabase, { leadId: lead.id, status: "LOST" });
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
    return { leadId: lead.id, optedOut: true, proposedResponse: null, serviceKey: null, confidence: "high" };
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
    return { leadId: lead.id, optedOut: false, proposedResponse: null, serviceKey: null, confidence: "low" };
  }

  const compiled = compileGoalToMission(input.message.body);
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

  return { leadId: lead.id, optedOut: false, proposedResponse, serviceKey: compiled.serviceKey, confidence };
}
