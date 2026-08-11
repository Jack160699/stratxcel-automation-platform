import type { RiskLevel } from "../departments/types.ts";

export const CAPABILITY_KEYS = [
  "research.web",
  "research.serp",
  "content.shortform",
  "content.longform",
  "media.image_generation",
  "media.carousel_generation",
  "media.video_generation",
  "social.schedule",
  "social.publish",
  "seo.audit",
  "seo.article",
  "seo.publish",
  "website.generate",
  "website.deploy",
  "website.audit",
  "ads.plan",
  "ads.publish",
  "ads.audit",
  "crm.read",
  "crm.write",
  "crm.followup_plan",
  "whatsapp.send",
  "whatsapp.followup_plan",
  "analytics.read",
  "analytics.attribution",
  "report.generate",
  "brand.audit",
  "conversion.audit",
  "sales.analyze",
  "content.publish",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type CapabilityStatus = "AVAILABLE" | "PLANNED" | "NOT_CONFIGURED" | "UNAVAILABLE";

export interface CapabilityDefinition {
  key: CapabilityKey;
  label: string;
  riskLevel: RiskLevel;
  externalMutation: boolean;
  status: CapabilityStatus;
  requiredEntitlementClass: string | null;
  approvalRequired: boolean;
  supportedInputArtifacts: readonly string[];
  supportedOutputArtifacts: readonly string[];
}

export function isCapabilityKey(key: string): key is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(key);
}
