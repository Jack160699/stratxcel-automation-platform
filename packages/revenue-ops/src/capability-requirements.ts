/** Capability requirements — does NOT mutate the canonical capability registry. */
export const REVENUE_CAPABILITY_REQUIREMENTS = {
  departments: ["sales", "crm", "whatsapp", "conversion"] as const,
  read: ["crm.read", "analytics.read"] as const,
  plan: ["crm.followup_plan", "whatsapp.followup_plan", "sales.analyze", "conversion.audit"] as const,
  mutateWithApproval: ["crm.write", "whatsapp.send"] as const,
  notes: [
    "Departments request capabilities; they do not grant them.",
    "whatsapp.followup_plan and crm.followup_plan produce drafts/plans only.",
    "whatsapp.send and crm.write require approval or standing authorization.",
    "Social capabilities are not required for crm_whatsapp_conversion workflow.",
  ] as const,
} as const;

export function revenueRequiresSocial(): false {
  return false;
}
