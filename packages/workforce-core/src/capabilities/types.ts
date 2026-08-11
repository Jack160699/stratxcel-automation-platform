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

/**
 * Static catalogue / implementation status.
 * Must be set explicitly on every capability definition — never inferred.
 *
 * AVAILABLE       = real platform execution path exists (runtime may still block)
 * NOT_CONFIGURED  = implementation/provider slot exists but platform wiring incomplete
 * PLANNED         = product contract only — no end-to-end execution path yet
 * UNAVAILABLE     = intentionally disabled/unsupported in this product state
 */
export type CapabilityStatus = "AVAILABLE" | "PLANNED" | "NOT_CONFIGURED" | "UNAVAILABLE";

/** Alias clarifying that CapabilityDefinition.status is implementation catalogue state. */
export type ImplementationStatus = CapabilityStatus;

export type RuntimeReadiness =
  | "READY"
  | "TECHNICALLY_READY"
  | "NOT_READY"
  | "SETUP_REQUIRED"
  | "BLOCKED"
  | "WAITING_CONFIGURATION"
  | "WAITING_INTEGRATION"
  | "WAITING_ENTITLEMENT"
  | "WAITING_APPROVAL"
  | "SHADOW_BLOCKED";

export type CapabilityExecutionStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "BLOCKED"
  | "WAITING_CONFIGURATION"
  | "WAITING_INTEGRATION"
  | "WAITING_ENTITLEMENT"
  | "WAITING_APPROVAL"
  | "SHADOW_COMPLETED";

export type EntitlementMetric =
  | "social_posts"
  | "meta_ad_campaigns"
  | "whatsapp_contacts"
  | "website_maintenance";

export interface CapabilityDefinition {
  key: CapabilityKey;
  label: string;
  riskLevel: RiskLevel;
  externalMutation: boolean;
  /** Required. Omission is a TypeScript error — never default to AVAILABLE. */
  status: CapabilityStatus;
  requiredEntitlementClass: EntitlementMetric | null;
  approvalRequired: boolean;
  supportedInputArtifacts: readonly string[];
  supportedOutputArtifacts: readonly string[];
  providerKeys: readonly string[];
  integrationRequirements: readonly string[];
  tenantScoped: boolean;
  implementationPath: string;
}

export function isCapabilityKey(key: string): key is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(key);
}

export function isStaticExecutableStatus(status: CapabilityStatus): boolean {
  return status === "AVAILABLE";
}

export function isNonExecutableStatus(status: CapabilityStatus): boolean {
  return status === "PLANNED" || status === "NOT_CONFIGURED" || status === "UNAVAILABLE";
}
