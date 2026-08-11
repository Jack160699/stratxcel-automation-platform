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
  "website.generate",
  "website.deploy",
  "ads.plan",
  "ads.publish",
  "crm.read",
  "crm.write",
  "whatsapp.send",
  "analytics.read",
  "report.generate",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type CapabilityStatus = "AVAILABLE" | "PLANNED" | "UNAVAILABLE" | "NOT_CONFIGURED";

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
