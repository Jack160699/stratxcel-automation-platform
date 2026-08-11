import type { CapabilityKey } from "../capabilities/types.ts";

export type CapabilityOperationClass =
  | "READ_ONLY"
  | "DRAFT_ONLY"
  | "REVERSIBLE_MUTATION"
  | "EXTERNAL_MUTATION"
  | "FINANCIAL_MUTATION";

const OPERATION_CLASS_BY_CAPABILITY: Record<CapabilityKey, CapabilityOperationClass> = {
  "research.web": "READ_ONLY",
  "research.serp": "READ_ONLY",
  "content.shortform": "DRAFT_ONLY",
  "content.longform": "DRAFT_ONLY",
  "media.image_generation": "DRAFT_ONLY",
  "media.carousel_generation": "DRAFT_ONLY",
  "media.video_generation": "DRAFT_ONLY",
  "social.schedule": "REVERSIBLE_MUTATION",
  "social.publish": "EXTERNAL_MUTATION",
  "seo.audit": "READ_ONLY",
  "seo.article": "DRAFT_ONLY",
  "seo.publish": "EXTERNAL_MUTATION",
  "website.generate": "DRAFT_ONLY",
  "website.deploy": "EXTERNAL_MUTATION",
  "website.audit": "READ_ONLY",
  "ads.plan": "DRAFT_ONLY",
  "ads.publish": "FINANCIAL_MUTATION",
  "ads.audit": "READ_ONLY",
  "crm.read": "READ_ONLY",
  "crm.write": "REVERSIBLE_MUTATION",
  "crm.followup_plan": "DRAFT_ONLY",
  "whatsapp.send": "EXTERNAL_MUTATION",
  "whatsapp.followup_plan": "DRAFT_ONLY",
  "analytics.read": "READ_ONLY",
  "analytics.attribution": "READ_ONLY",
  "report.generate": "DRAFT_ONLY",
  "brand.audit": "READ_ONLY",
  "conversion.audit": "READ_ONLY",
  "sales.analyze": "READ_ONLY",
  "content.publish": "EXTERNAL_MUTATION",
};

export function getCapabilityOperationClass(
  key: CapabilityKey | string,
): CapabilityOperationClass | null {
  if (!(key in OPERATION_CLASS_BY_CAPABILITY)) return null;
  return OPERATION_CLASS_BY_CAPABILITY[key as CapabilityKey];
}

export function isExternalOrFinancialMutation(key: CapabilityKey | string): boolean {
  const cls = getCapabilityOperationClass(key);
  return cls === "EXTERNAL_MUTATION" || cls === "FINANCIAL_MUTATION";
}
