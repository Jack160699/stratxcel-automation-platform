export type LeadSource = "whatsapp" | "website_form" | "manual" | "import";
export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST";
export type CrmLifecycleStage =
  | "new_lead" | "qualified" | "unqualified" | "contacted" | "follow_up_due"
  | "appointment_scheduled" | "proposal_sent" | "won" | "lost" | "nurture";
export type KnowledgeClaimStatus = "KNOWN" | "DERIVED" | "ASSUMPTION" | "UNKNOWN" | "RESEARCH_REQUIRED";
export type FieldConfidence = "known" | "derived" | "unknown";
export interface ClaimedField<T> { value: T | null; status: FieldConfidence; evidenceIds: readonly string[]; }
export interface LeadContactFacts {
  name: ClaimedField<string>; phone: ClaimedField<string>; email: ClaimedField<string>; language: ClaimedField<string>;
}
export interface LeadIntelligence {
  tenantId: string; leadId: string; source: ClaimedField<LeadSource>; campaign: ClaimedField<string>;
  contact: LeadContactFacts; intent: ClaimedField<string>; serviceInterest: ClaimedField<string>;
  geography: ClaimedField<string>; urgency: ClaimedField<"low" | "medium" | "high">;
  qualification: ClaimedField<"qualified" | "unqualified" | "needs_review">;
  lifecycleStage: ClaimedField<CrmLifecycleStage>;
  consent: { whatsappMarketing: ClaimedField<boolean>; provenance: ClaimedField<string>; optedOut: ClaimedField<boolean> };
  assignedOwner: ClaimedField<string>; lastResponseAt: ClaimedField<string>; nextAction: ClaimedField<string>;
  crmStatus: LeadStatus; generatedAtIso: string;
}
export type QualificationDecision = "qualified" | "unqualified" | "insufficient_evidence";
export interface LeadQualificationArtifact {
  tenantId: string; leadId: string; decision: QualificationDecision;
  criteria: readonly { key: string; result: "pass" | "fail" | "unknown"; evidenceIds: readonly string[]; note: string }[];
  inventedFacts: readonly never[]; unknownFields: readonly string[]; rationale: string; generatedAtIso: string;
}
export type FollowUpChannel = "whatsapp" | "phone" | "email" | "human";
export type FollowUpMessageType =
  | "acknowledgment" | "qualification_question" | "value_reminder" | "appointment_offer"
  | "proposal_followup" | "nurture" | "escalation_notice";
export interface FollowUpPlanStep {
  stepId: string; stage: CrmLifecycleStage; timing: { delayHours: number; dueAtIso?: string | null };
  channel: FollowUpChannel; objective: string; messageType: FollowUpMessageType;
  escalation: { escalateIfNoReply: boolean; afterHours: number }; stopConditions: readonly string[];
  consentRequirement: "none_in_session_window" | "marketing_opt_in" | "human_only";
}
export interface CrmFollowUpPlanArtifact {
  tenantId: string; leadId: string; artifactClass: "crm_followup_plan"; stage: CrmLifecycleStage;
  steps: readonly FollowUpPlanStep[]; stopConditions: readonly string[]; generatedAtIso: string;
}
export interface WhatsAppMessageDraft {
  draftId: string; stepId: string; body: string; language: string | null; requiresTemplate: boolean;
  templateName: string | null; consentRequired: boolean; sendAuthorized: false; status: "draft";
}
export interface WhatsAppFollowUpSequenceArtifact {
  tenantId: string; leadId: string; conversationId: string | null; artifactClass: "whatsapp_followup_plan";
  drafts: readonly WhatsAppMessageDraft[]; blocked: boolean; blockReason: string | null;
  humanTakeoverRequired: boolean; optOutHonored: boolean; sendAuthorized: false; generatedAtIso: string;
}
export type ConversionFunnelStage =
  | "inquiry_capture" | "qualification" | "response" | "appointment_booking"
  | "proposal" | "close" | "objection" | "abandonment";
export interface ConversionFunnelObservation {
  stage: ConversionFunnelStage; eventCount: number; evidenceIds: readonly string[]; status: KnowledgeClaimStatus;
}
export interface ConversionDiagnosis {
  tenantId: string; funnel: readonly ConversionFunnelObservation[]; primaryLeak: ConversionFunnelStage | null;
  objectionsObserved: readonly string[]; abandonmentSignals: readonly string[]; unknownAreas: readonly string[];
  generatedAtIso: string;
}
export interface ConversionPlanAction {
  actionId: string; stage: ConversionFunnelStage; objective: string;
  ownerDepartment: "sales" | "crm" | "whatsapp" | "conversion"; requiresHuman: boolean;
}
export interface ConversionPlan {
  tenantId: string; diagnosisId: string; actions: readonly ConversionPlanAction[];
  doNotAutomate: readonly string[]; generatedAtIso: string;
}
export interface ResponseTimeDiagnosis {
  tenantId: string; newLeadsWaiting: number; unansweredLeads: number; overdueFollowUps: number;
  medianResponseTimeHours: number | null; sampleSize: number; evidenceIds: readonly string[];
  fabricated: false; generatedAtIso: string;
}
export type HumanHandoffTrigger =
  | "high_value_lead" | "unclear_customer_intent" | "customer_requests_human" | "complaint"
  | "legal_or_payment_dispute" | "repeated_automation_failure" | "sensitive_situation";
export interface HumanHandoffDecision {
  shouldEscalate: boolean; triggers: readonly HumanHandoffTrigger[]; reason: string | null;
  automationMode: "automated" | "human_only" | "paused" | "handoff";
}
export type RevenueAnalyticsEventName =
  | "lead_created" | "first_response" | "qualified" | "meeting_booked"
  | "proposal_sent" | "won" | "lost" | "followup_completed";
export interface RevenueAnalyticsEvent {
  name: RevenueAnalyticsEventName; atIso: string; tenantId: string; leadId: string;
  missionId?: string; evidenceIds?: readonly string[]; data?: Record<string, unknown>;
}
export interface RevenueAuditIntelligence {
  tenantId: string;
  responseSpeed: { medianHours: number | null; unansweredLeads: number; newLeadsWaiting: number; status: KnowledgeClaimStatus };
  crmHygiene: { leadsMissingOwner: number; leadsMissingNextAction: number; status: KnowledgeClaimStatus };
  followUpGaps: { overdueCount: number; status: KnowledgeClaimStatus };
  leadQualificationGaps: { insufficientEvidenceCount: number; status: KnowledgeClaimStatus };
  conversionFunnelGaps: { primaryLeak: ConversionFunnelStage | null; status: KnowledgeClaimStatus };
  generatedAtIso: string;
}
export interface CrmWorkflowContract {
  key: CrmLifecycleStage; mapsToLeadStatus: LeadStatus | null; allowedTransitions: readonly CrmLifecycleStage[];
  requiresConsentCheck: boolean; requiresHumanApprovalForMutation: boolean; description: string;
}
export type StandingAuthorizationKind = "crm.write" | "whatsapp.send";
export interface MutationGateInput {
  tenantId: string; resourceTenantId: string; kind: StandingAuthorizationKind;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | null; standingAuthorization?: boolean;
  optedOut?: boolean; hasMarketingConsent?: boolean; outsideSessionWindow?: boolean;
  hermesProposedText?: string | null;
  conversationAutomationMode?: "automated" | "human_only" | "paused" | "handoff" | null;
  isHumanInitiated?: boolean;
}
export interface MutationGateResult { allowed: boolean; reason: string; draftingAllowed: boolean; }
