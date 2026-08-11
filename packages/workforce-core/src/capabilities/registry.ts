import type { CapabilityDefinition, CapabilityKey } from "./types.ts";
import { CAPABILITY_KEYS, isCapabilityKey } from "./types.ts";

function cap(
  key: CapabilityKey,
  overrides: Partial<Omit<CapabilityDefinition, "key">> & Pick<CapabilityDefinition, "label">,
): CapabilityDefinition {
  return {
    key,
    label: overrides.label,
    riskLevel: overrides.riskLevel ?? "low",
    externalMutation: overrides.externalMutation ?? false,
    status: overrides.status ?? "AVAILABLE",
    requiredEntitlementClass: overrides.requiredEntitlementClass ?? null,
    approvalRequired: overrides.approvalRequired ?? false,
    supportedInputArtifacts: overrides.supportedInputArtifacts ?? [],
    supportedOutputArtifacts: overrides.supportedOutputArtifacts ?? [],
  };
}

export const CAPABILITY_REGISTRY: Record<CapabilityKey, CapabilityDefinition> = {
  "research.web": cap("research.web", {
    label: "Web research",
    riskLevel: "low",
    status: "PLANNED",
    supportedOutputArtifacts: ["research_evidence", "research_summary"],
  }),
  "research.serp": cap("research.serp", {
    label: "SERP research",
    riskLevel: "low",
    status: "PLANNED",
    supportedOutputArtifacts: ["serp_evidence", "keyword_map"],
  }),
  "content.shortform": cap("content.shortform", {
    label: "Short-form content",
    riskLevel: "medium",
    supportedInputArtifacts: ["content_brief", "brand_slice"],
    supportedOutputArtifacts: ["shortform_copy", "caption_set"],
  }),
  "content.longform": cap("content.longform", {
    label: "Long-form content",
    riskLevel: "medium",
    supportedInputArtifacts: ["content_brief"],
    supportedOutputArtifacts: ["longform_draft", "script"],
  }),
  "media.image_generation": cap("media.image_generation", {
    label: "Image generation",
    riskLevel: "medium",
    supportedInputArtifacts: ["art_direction", "image_brief"],
    supportedOutputArtifacts: ["image_candidate", "image_final"],
  }),
  "media.carousel_generation": cap("media.carousel_generation", {
    label: "Carousel generation",
    riskLevel: "medium",
    supportedInputArtifacts: ["carousel_brief", "art_direction"],
    supportedOutputArtifacts: ["carousel_candidate"],
  }),
  "media.video_generation": cap("media.video_generation", {
    label: "Video generation",
    riskLevel: "medium",
    status: "UNAVAILABLE",
    supportedInputArtifacts: ["video_brief", "storyboard"],
    supportedOutputArtifacts: ["video_candidate", "reel_candidate"],
  }),
  "social.schedule": cap("social.schedule", {
    label: "Social scheduling",
    riskLevel: "high",
    supportedInputArtifacts: ["social_final"],
    supportedOutputArtifacts: ["schedule_receipt"],
  }),
  "social.publish": cap("social.publish", {
    label: "Social publishing",
    riskLevel: "critical",
    externalMutation: true,
    status: "AVAILABLE",
    approvalRequired: true,
    requiredEntitlementClass: "social_posts",
    supportedInputArtifacts: ["social_final"],
    supportedOutputArtifacts: ["publish_receipt"],
  }),
  "seo.audit": cap("seo.audit", {
    label: "SEO audit",
    riskLevel: "low",
    supportedInputArtifacts: ["website_snapshot"],
    supportedOutputArtifacts: ["seo_audit_report"],
  }),
  "seo.article": cap("seo.article", {
    label: "SEO article",
    riskLevel: "low",
    supportedInputArtifacts: ["seo_brief", "keyword_map"],
    supportedOutputArtifacts: ["seo_article_draft"],
  }),
  "website.generate": cap("website.generate", {
    label: "Website generation",
    riskLevel: "high",
    supportedInputArtifacts: ["page_brief"],
    supportedOutputArtifacts: ["website_draft"],
  }),
  "website.deploy": cap("website.deploy", {
    label: "Website deploy",
    riskLevel: "critical",
    externalMutation: true,
    approvalRequired: true,
    supportedInputArtifacts: ["website_approved"],
    supportedOutputArtifacts: ["deploy_receipt"],
  }),
  "ads.plan": cap("ads.plan", {
    label: "Ads planning",
    riskLevel: "high",
    supportedInputArtifacts: ["campaign_brief"],
    supportedOutputArtifacts: ["ads_plan"],
  }),
  "ads.publish": cap("ads.publish", {
    label: "Ads publishing",
    riskLevel: "critical",
    externalMutation: true,
    approvalRequired: true,
    supportedInputArtifacts: ["ads_plan_approved"],
    supportedOutputArtifacts: ["ads_publish_receipt"],
  }),
  "crm.read": cap("crm.read", {
    label: "CRM read",
    riskLevel: "medium",
    supportedOutputArtifacts: ["crm_snapshot"],
  }),
  "crm.write": cap("crm.write", {
    label: "CRM write",
    riskLevel: "high",
    externalMutation: true,
    approvalRequired: true,
    supportedInputArtifacts: ["crm_mutation_request"],
    supportedOutputArtifacts: ["crm_write_receipt"],
  }),
  "whatsapp.send": cap("whatsapp.send", {
    label: "WhatsApp send",
    riskLevel: "critical",
    externalMutation: true,
    approvalRequired: true,
    supportedInputArtifacts: ["whatsapp_message_draft", "consent_record"],
    supportedOutputArtifacts: ["whatsapp_send_receipt"],
  }),
  "analytics.read": cap("analytics.read", {
    label: "Analytics read",
    riskLevel: "low",
    supportedOutputArtifacts: ["analytics_evidence", "metric_snapshot"],
  }),
  "report.generate": cap("report.generate", {
    label: "Report generation",
    riskLevel: "low",
    supportedInputArtifacts: ["analytics_evidence"],
    supportedOutputArtifacts: ["report_artifact", "executive_summary"],
  }),
};

export function getCapability(key: string): CapabilityDefinition | undefined {
  if (!isCapabilityKey(key)) return undefined;
  return CAPABILITY_REGISTRY[key];
}

export function listCapabilities(): CapabilityDefinition[] {
  return CAPABILITY_KEYS.map((k) => CAPABILITY_REGISTRY[k]);
}

export function assertCapability(key: string): CapabilityDefinition {
  const capDef = getCapability(key);
  if (!capDef) throw new Error(`unknown_capability:${key}`);
  return capDef;
}

export function isCapabilityAvailable(key: string): boolean {
  const capDef = getCapability(key);
  return capDef?.status === "AVAILABLE";
}

export function isCapabilityUnavailable(key: string): boolean {
  const capDef = getCapability(key);
  return capDef?.status === "UNAVAILABLE" || capDef?.status === "NOT_CONFIGURED";
}
