import type {
  CrmFollowUpPlanArtifact,
  LeadIntelligence,
  WhatsAppFollowUpSequenceArtifact,
  WhatsAppMessageDraft,
} from "./types.ts";

export interface WhatsAppSequenceContext {
  conversationId?: string | null;
  automationMode?: "automated" | "human_only" | "paused" | "handoff";
  insideSessionWindow?: boolean;
  approvedTemplates?: readonly string[];
  customerLanguage?: string | null;
  nowIso?: string;
}

function draftBody(stepObjective: string, messageType: string, language: string | null): string {
  const langNote = language ? ` [${language}]` : "";
  switch (messageType) {
    case "acknowledgment":
      return `Thank you for reaching out${langNote}. We received your inquiry and will help shortly.`;
    case "qualification_question":
      return `To help correctly${langNote}: which service are you interested in, and what outcome are you hoping for?`;
    case "appointment_offer":
      return `Would you like to book a short call to discuss next steps${langNote}?`;
    case "proposal_followup":
      return `Checking in on the proposal${langNote} — any questions we can clarify?`;
    case "nurture":
      return `Sharing a helpful update related to your earlier interest${langNote}. Reply STOP to opt out.`;
    case "value_reminder":
      return `Following up on your inquiry${langNote}. Happy to answer any questions.`;
    default:
      return `${stepObjective}${langNote}`;
  }
}

/** WhatsApp drafts/sequences. Drafting ≠ sending. Always sendAuthorized: false. */
export function buildWhatsAppFollowUpSequence(input: {
  intelligence: LeadIntelligence;
  plan: CrmFollowUpPlanArtifact;
  context?: WhatsAppSequenceContext;
}): WhatsAppFollowUpSequenceArtifact {
  const intel = input.intelligence;
  const ctx = input.context ?? {};
  const language = ctx.customerLanguage ?? intel.contact.language.value;
  const nowIso = ctx.nowIso ?? new Date().toISOString();

  if (intel.consent.optedOut.value === true) {
    return {
      tenantId: intel.tenantId,
      leadId: intel.leadId,
      conversationId: ctx.conversationId ?? null,
      artifactClass: "whatsapp_followup_plan",
      drafts: [],
      blocked: true,
      blockReason: "opt_out",
      humanTakeoverRequired: false,
      optOutHonored: true,
      sendAuthorized: false,
      generatedAtIso: nowIso,
    };
  }

  if (ctx.automationMode === "handoff" || ctx.automationMode === "human_only" || ctx.automationMode === "paused") {
    return {
      tenantId: intel.tenantId,
      leadId: intel.leadId,
      conversationId: ctx.conversationId ?? null,
      artifactClass: "whatsapp_followup_plan",
      drafts: [],
      blocked: true,
      blockReason: `conversation_${ctx.automationMode}`,
      humanTakeoverRequired: ctx.automationMode === "handoff" || ctx.automationMode === "human_only",
      optOutHonored: false,
      sendAuthorized: false,
      generatedAtIso: nowIso,
    };
  }

  const drafts: WhatsAppMessageDraft[] = [];
  for (const s of input.plan.steps) {
    if (s.channel !== "whatsapp") continue;
    const outsideWindow = ctx.insideSessionWindow === false;
    const needsTemplate = outsideWindow || s.consentRequirement === "marketing_opt_in";
    const hasConsent = intel.consent.whatsappMarketing.value === true;

    if (s.consentRequirement === "marketing_opt_in" && !hasConsent) continue;
    if (s.consentRequirement === "human_only") continue;

    drafts.push({
      draftId: `draft_${s.stepId}`,
      stepId: s.stepId,
      body: draftBody(s.objective, s.messageType, language),
      language,
      requiresTemplate: needsTemplate,
      templateName: needsTemplate ? (ctx.approvedTemplates?.[0] ?? null) : null,
      consentRequired: s.consentRequirement === "marketing_opt_in" || outsideWindow,
      sendAuthorized: false,
      status: "draft",
    });
  }

  return {
    tenantId: intel.tenantId,
    leadId: intel.leadId,
    conversationId: ctx.conversationId ?? null,
    artifactClass: "whatsapp_followup_plan",
    drafts,
    blocked: false,
    blockReason: null,
    humanTakeoverRequired: false,
    optOutHonored: false,
    sendAuthorized: false,
    generatedAtIso: nowIso,
  };
}
