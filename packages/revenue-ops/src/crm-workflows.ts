import type { CrmLifecycleStage, CrmWorkflowContract, LeadStatus } from "./types.ts";

/** CRM workflow contracts mapped onto existing LeadStatus — no schema migration. */
export const CRM_WORKFLOW_CONTRACTS: readonly CrmWorkflowContract[] = [
  {
    key: "new_lead",
    mapsToLeadStatus: "NEW",
    allowedTransitions: ["contacted", "qualified", "unqualified", "nurture", "lost"],
    requiresConsentCheck: false,
    requiresHumanApprovalForMutation: false,
    description: "Newly captured inquiry awaiting first response",
  },
  {
    key: "contacted",
    mapsToLeadStatus: "CONTACTED",
    allowedTransitions: ["qualified", "unqualified", "follow_up_due", "appointment_scheduled", "nurture", "lost"],
    requiresConsentCheck: false,
    requiresHumanApprovalForMutation: false,
    description: "Outbound contact recorded",
  },
  {
    key: "qualified",
    mapsToLeadStatus: "QUALIFIED",
    allowedTransitions: ["appointment_scheduled", "proposal_sent", "follow_up_due", "won", "lost", "nurture"],
    requiresConsentCheck: false,
    requiresHumanApprovalForMutation: true,
    description: "Evidence-based qualification passed",
  },
  {
    key: "unqualified",
    mapsToLeadStatus: null,
    allowedTransitions: ["nurture", "lost", "new_lead"],
    requiresConsentCheck: true,
    requiresHumanApprovalForMutation: false,
    description: "Does not meet known criteria; may nurture with consent",
  },
  {
    key: "follow_up_due",
    mapsToLeadStatus: null,
    allowedTransitions: ["contacted", "qualified", "appointment_scheduled", "nurture", "lost"],
    requiresConsentCheck: false,
    requiresHumanApprovalForMutation: false,
    description: "Scheduled follow-up is due or overdue",
  },
  {
    key: "appointment_scheduled",
    mapsToLeadStatus: "QUALIFIED",
    allowedTransitions: ["proposal_sent", "won", "lost", "follow_up_due"],
    requiresConsentCheck: false,
    requiresHumanApprovalForMutation: false,
    description: "Meeting booked (metadata/appointment signal)",
  },
  {
    key: "proposal_sent",
    mapsToLeadStatus: "QUALIFIED",
    allowedTransitions: ["won", "lost", "follow_up_due"],
    requiresConsentCheck: false,
    requiresHumanApprovalForMutation: true,
    description: "Proposal artifact delivered",
  },
  {
    key: "won",
    mapsToLeadStatus: "WON",
    allowedTransitions: [],
    requiresConsentCheck: false,
    requiresHumanApprovalForMutation: true,
    description: "Closed won",
  },
  {
    key: "lost",
    mapsToLeadStatus: "LOST",
    allowedTransitions: ["nurture"],
    requiresConsentCheck: true,
    requiresHumanApprovalForMutation: true,
    description: "Closed lost",
  },
  {
    key: "nurture",
    mapsToLeadStatus: null,
    allowedTransitions: ["new_lead", "contacted", "qualified", "lost"],
    requiresConsentCheck: true,
    requiresHumanApprovalForMutation: false,
    description: "Long-cycle nurture with marketing consent",
  },
];

export function getCrmWorkflowContract(key: CrmLifecycleStage): CrmWorkflowContract | undefined {
  return CRM_WORKFLOW_CONTRACTS.find((c) => c.key === key);
}

export function leadStatusForLifecycle(stage: CrmLifecycleStage): LeadStatus | null {
  return getCrmWorkflowContract(stage)?.mapsToLeadStatus ?? null;
}

export function canTransition(from: CrmLifecycleStage, to: CrmLifecycleStage): boolean {
  return getCrmWorkflowContract(from)?.allowedTransitions.includes(to) ?? false;
}
