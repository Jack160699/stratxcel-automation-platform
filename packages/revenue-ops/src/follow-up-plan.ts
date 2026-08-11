import type {
  CrmFollowUpPlanArtifact,
  CrmLifecycleStage,
  FollowUpPlanStep,
  LeadIntelligence,
  LeadQualificationArtifact,
} from "./types.ts";

function step(
  partial: Omit<FollowUpPlanStep, "stopConditions"> & { stopConditions?: readonly string[] },
): FollowUpPlanStep {
  return {
    ...partial,
    stopConditions: partial.stopConditions ?? ["opt_out", "human_takeover", "won", "lost"],
  };
}

/** CRM specialist structured follow-up plan. Drafting only. */
export function buildCrmFollowUpPlan(input: {
  intelligence: LeadIntelligence;
  qualification?: LeadQualificationArtifact | null;
  nowIso?: string;
}): CrmFollowUpPlanArtifact {
  const intel = input.intelligence;
  const stage = (intel.lifecycleStage.value ?? "new_lead") as CrmLifecycleStage;
  const steps: FollowUpPlanStep[] = [];

  if (stage === "new_lead" || intel.crmStatus === "NEW") {
    steps.push(
      step({
        stepId: "fu_ack",
        stage: "new_lead",
        timing: { delayHours: 0 },
        channel: "whatsapp",
        objective: "Acknowledge inquiry and confirm receipt",
        messageType: "acknowledgment",
        escalation: { escalateIfNoReply: true, afterHours: 24 },
        consentRequirement: "none_in_session_window",
      }),
      step({
        stepId: "fu_qualify",
        stage: "contacted",
        timing: { delayHours: 4 },
        channel: "whatsapp",
        objective: "Clarify service interest without inventing needs",
        messageType: "qualification_question",
        escalation: { escalateIfNoReply: true, afterHours: 48 },
        consentRequirement: "none_in_session_window",
      }),
    );
  } else if (stage === "qualified" || input.qualification?.decision === "qualified") {
    steps.push(
      step({
        stepId: "fu_appt",
        stage: "qualified",
        timing: { delayHours: 2 },
        channel: "whatsapp",
        objective: "Offer appointment / discovery call",
        messageType: "appointment_offer",
        escalation: { escalateIfNoReply: true, afterHours: 48 },
        consentRequirement: "none_in_session_window",
      }),
    );
  } else if (stage === "proposal_sent") {
    steps.push(
      step({
        stepId: "fu_proposal",
        stage: "proposal_sent",
        timing: { delayHours: 48 },
        channel: "whatsapp",
        objective: "Check proposal questions; no pressure tactics",
        messageType: "proposal_followup",
        escalation: { escalateIfNoReply: true, afterHours: 72 },
        consentRequirement: "marketing_opt_in",
      }),
    );
  } else if (stage === "unqualified" || input.qualification?.decision === "unqualified") {
    steps.push(
      step({
        stepId: "fu_nurture",
        stage: "nurture",
        timing: { delayHours: 168 },
        channel: "whatsapp",
        objective: "Low-frequency nurture only with marketing consent",
        messageType: "nurture",
        escalation: { escalateIfNoReply: false, afterHours: 0 },
        consentRequirement: "marketing_opt_in",
        stopConditions: ["opt_out", "human_takeover", "won", "lost", "no_marketing_consent"],
      }),
    );
  } else if (stage === "follow_up_due" || stage === "contacted") {
    steps.push(
      step({
        stepId: "fu_due",
        stage: "follow_up_due",
        timing: { delayHours: 0 },
        channel: "whatsapp",
        objective: "Complete overdue follow-up with clear next question",
        messageType: "value_reminder",
        escalation: { escalateIfNoReply: true, afterHours: 24 },
        consentRequirement: "none_in_session_window",
      }),
    );
  } else {
    steps.push(
      step({
        stepId: "fu_human",
        stage,
        timing: { delayHours: 0 },
        channel: "human",
        objective: "Route to human owner for stage-specific handling",
        messageType: "escalation_notice",
        escalation: { escalateIfNoReply: false, afterHours: 0 },
        consentRequirement: "human_only",
      }),
    );
  }

  if (intel.consent.optedOut.value === true) {
    return {
      tenantId: intel.tenantId,
      leadId: intel.leadId,
      artifactClass: "crm_followup_plan",
      stage,
      steps: [],
      stopConditions: ["opt_out"],
      generatedAtIso: input.nowIso ?? new Date().toISOString(),
    };
  }

  return {
    tenantId: intel.tenantId,
    leadId: intel.leadId,
    artifactClass: "crm_followup_plan",
    stage,
    steps,
    stopConditions: ["opt_out", "human_takeover", "won", "lost", "complaint"],
    generatedAtIso: input.nowIso ?? new Date().toISOString(),
  };
}
