import type { CapabilityDefinition, CapabilityKey, CapabilityStatus } from "./types.ts";
import {
  CAPABILITY_KEYS,
  isCapabilityKey,
  isNonExecutableStatus,
  isStaticExecutableStatus,
} from "./types.ts";

/**
 * Build a capability definition. `status` is required — never defaulted to AVAILABLE.
 */
function cap(key: CapabilityKey, definition: Omit<CapabilityDefinition, "key">): CapabilityDefinition {
  return { key, ...definition };
}

export const CAPABILITY_REGISTRY: Record<CapabilityKey, CapabilityDefinition> = {
  "research.web": cap("research.web", {
    label: "Web research",
    riskLevel: "low",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["research_evidence", "research_summary"],
    providerKeys: ["research-web-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "research.serp": cap("research.serp", {
    label: "SERP research",
    riskLevel: "low",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["serp_evidence", "keyword_map"],
    providerKeys: ["research-serp-placeholder"],
    integrationRequirements: ["search_console"],
    tenantScoped: true,
    implementationPath: "packages/search-discovery (partial; workforce path planned)",
  }),
  "content.shortform": cap("content.shortform", {
    label: "Short-form content",
    riskLevel: "medium",
    externalMutation: false,
    status: "NOT_CONFIGURED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["content_brief", "brand_slice"],
    supportedOutputArtifacts: ["shortform_copy", "caption_set"],
    providerKeys: ["content-shortform-hermes"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath:
      "PENDING_AI_RUNTIME_PR_45 — Hermes/AI runtime shortform path not merged; workforce provider remains placeholder",
    requiredFeatureFlags: ["content_shortform"],
  }),
  "content.longform": cap("content.longform", {
    label: "Long-form content",
    riskLevel: "medium",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["content_brief"],
    supportedOutputArtifacts: ["longform_draft", "script"],
    providerKeys: ["content-longform-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "media.image_generation": cap("media.image_generation", {
    label: "Image generation",
    riskLevel: "medium",
    externalMutation: false,
    status: "NOT_CONFIGURED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["art_direction", "image_brief"],
    supportedOutputArtifacts: ["image_candidate", "image_final"],
    providerKeys: ["media-image-placeholder"],
    integrationRequirements: ["media_generator"],
    tenantScoped: true,
    implementationPath: "provider boundary reserved for Creative Studio (Workstream 3)",
  }),
  "media.carousel_generation": cap("media.carousel_generation", {
    label: "Carousel generation",
    riskLevel: "medium",
    externalMutation: false,
    status: "UNAVAILABLE",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["carousel_brief", "art_direction"],
    supportedOutputArtifacts: ["carousel_candidate"],
    providerKeys: ["media-carousel-placeholder"],
    integrationRequirements: ["media_generator"],
    tenantScoped: true,
    implementationPath: "no real carousel pipeline without fake image generation",
  }),
  "media.video_generation": cap("media.video_generation", {
    label: "Video generation",
    riskLevel: "medium",
    externalMutation: false,
    status: "UNAVAILABLE",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["video_brief", "storyboard"],
    supportedOutputArtifacts: ["video_candidate", "reel_candidate"],
    providerKeys: ["media-video-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "intentionally unsupported — no controlled video provider",
  }),
  "social.schedule": cap("social.schedule", {
    label: "Social scheduling",
    riskLevel: "high",
    externalMutation: false,
    status: "AVAILABLE",
    requiredEntitlementClass: "social_posts",
    approvalRequired: true,
    supportedInputArtifacts: ["social_final"],
    supportedOutputArtifacts: ["schedule_receipt"],
    providerKeys: ["social-schedule-queue"],
    integrationRequirements: ["social_account"],
    tenantScoped: true,
    implementationPath:
      "packages/workforce-core/src/adapters/social.ts + lib/social/workforce/capability-host.ts",
    requiredFeatureFlags: ["social_scheduling"],
  }),
  "social.publish": cap("social.publish", {
    label: "Social publishing",
    riskLevel: "critical",
    externalMutation: true,
    status: "AVAILABLE",
    requiredEntitlementClass: "social_posts",
    approvalRequired: true,
    supportedInputArtifacts: ["social_final"],
    supportedOutputArtifacts: ["publish_receipt"],
    providerKeys: ["social-publish-meta"],
    integrationRequirements: ["social_account"],
    tenantScoped: true,
    implementationPath:
      "packages/workforce-core/src/adapters/social.ts + lib/social/workforce/capability-host.ts",
    requiredFeatureFlags: ["social_publishing"],
  }),
  "seo.audit": cap("seo.audit", {
    label: "SEO audit",
    riskLevel: "low",
    externalMutation: false,
    status: "AVAILABLE",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["seo_audit_report"],
    providerKeys: ["seo-audit-search-discovery"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath:
      "packages/workforce-core/src/adapters/seo-audit.ts → search-web/seo-audit buildSeoAuditReport",
    requiredFeatureFlags: ["search_web"],
  }),
  "seo.article": cap("seo.article", {
    label: "SEO article",
    riskLevel: "low",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["seo_brief", "keyword_map"],
    supportedOutputArtifacts: ["seo_article_draft"],
    providerKeys: ["seo-article-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "seo.publish": cap("seo.publish", {
    label: "SEO publish",
    riskLevel: "high",
    externalMutation: true,
    status: "NOT_CONFIGURED",
    requiredEntitlementClass: null,
    approvalRequired: true,
    supportedInputArtifacts: ["seo_article_approved"],
    supportedOutputArtifacts: ["seo_publish_receipt"],
    providerKeys: ["seo-publish-placeholder"],
    integrationRequirements: ["cms_or_site_host"],
    tenantScoped: true,
    implementationPath: "publish path stub — credentials/CMS bridge incomplete",
  }),
  "website.generate": cap("website.generate", {
    label: "Website generation",
    riskLevel: "high",
    externalMutation: false,
    status: "AVAILABLE",
    requiredEntitlementClass: "website_maintenance",
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["website_draft"],
    providerKeys: ["website-generate-domains"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath:
      "packages/workforce-core/src/adapters/website-generate.ts → generate5PageSite (draft only)",
    requiredFeatureFlags: ["website_generate"],
  }),
  "website.deploy": cap("website.deploy", {
    label: "Website deploy",
    riskLevel: "critical",
    externalMutation: true,
    status: "PLANNED",
    requiredEntitlementClass: "website_maintenance",
    approvalRequired: true,
    supportedInputArtifacts: ["website_approved"],
    supportedOutputArtifacts: ["deploy_receipt"],
    providerKeys: ["website-deploy-placeholder"],
    integrationRequirements: ["domain_dns"],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "website.audit": cap("website.audit", {
    label: "Website audit",
    riskLevel: "low",
    externalMutation: false,
    status: "AVAILABLE",
    // Entitlement separate from website.generate (no website_maintenance required).
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["website_snapshot"],
    supportedOutputArtifacts: ["website_audit_report"],
    providerKeys: ["website-audit-internal"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/search-web/website-audit.ts",
    requiredFeatureFlags: ["search_web"],
  }),
  "ads.plan": cap("ads.plan", {
    label: "Ads planning",
    riskLevel: "high",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: "meta_ad_campaigns",
    approvalRequired: false,
    supportedInputArtifacts: ["campaign_brief"],
    supportedOutputArtifacts: ["ads_plan"],
    providerKeys: ["ads-plan-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "ads.publish": cap("ads.publish", {
    label: "Ads publishing",
    riskLevel: "critical",
    externalMutation: true,
    status: "PLANNED",
    requiredEntitlementClass: "meta_ad_campaigns",
    approvalRequired: true,
    supportedInputArtifacts: ["ads_plan_approved"],
    supportedOutputArtifacts: ["ads_publish_receipt"],
    providerKeys: ["ads-publish-placeholder"],
    integrationRequirements: ["meta_ads_account"],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "ads.audit": cap("ads.audit", {
    label: "Ads audit",
    riskLevel: "medium",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: "meta_ad_campaigns",
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["ads_audit_report"],
    providerKeys: ["ads-audit-placeholder"],
    integrationRequirements: ["meta_ads_account"],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "crm.read": cap("crm.read", {
    label: "CRM read",
    riskLevel: "medium",
    externalMutation: false,
    status: "AVAILABLE",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["crm_snapshot"],
    providerKeys: ["crm-supabase"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath:
      "packages/workforce-core/src/adapters/crm.ts → @stratxcel/leads-and-crm repository",
    requiredFeatureFlags: ["crm"],
  }),
  "crm.write": cap("crm.write", {
    label: "CRM write",
    riskLevel: "high",
    externalMutation: true,
    status: "AVAILABLE",
    requiredEntitlementClass: null,
    approvalRequired: true,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["crm_write_receipt"],
    providerKeys: ["crm-supabase"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath:
      "packages/workforce-core/src/adapters/crm.ts → @stratxcel/leads-and-crm repository",
    requiredFeatureFlags: ["crm"],
  }),
  "crm.followup_plan": cap("crm.followup_plan", {
    label: "CRM follow-up plan",
    riskLevel: "medium",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["crm_snapshot"],
    supportedOutputArtifacts: ["crm_followup_plan"],
    providerKeys: ["crm-followup-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "whatsapp.send": cap("whatsapp.send", {
    label: "WhatsApp send",
    riskLevel: "critical",
    externalMutation: true,
    status: "AVAILABLE",
    requiredEntitlementClass: "whatsapp_contacts",
    approvalRequired: true,
    supportedInputArtifacts: ["whatsapp_message_draft", "consent_record"],
    supportedOutputArtifacts: ["whatsapp_send_receipt"],
    providerKeys: ["whatsapp-meta"],
    integrationRequirements: ["whatsapp_binding"],
    tenantScoped: true,
    implementationPath:
      "packages/workforce-core/src/adapters/whatsapp.ts → sendOutboundWhatsAppMessage",
  }),
  "whatsapp.followup_plan": cap("whatsapp.followup_plan", {
    label: "WhatsApp follow-up plan",
    riskLevel: "medium",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: "whatsapp_contacts",
    approvalRequired: false,
    supportedInputArtifacts: ["crm_followup_plan"],
    supportedOutputArtifacts: ["whatsapp_followup_plan"],
    providerKeys: ["whatsapp-followup-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "analytics.read": cap("analytics.read", {
    label: "Analytics read",
    riskLevel: "low",
    externalMutation: false,
    status: "NOT_CONFIGURED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["analytics_evidence", "metric_snapshot"],
    providerKeys: ["analytics-read-reporting"],
    integrationRequirements: ["analytics_property"],
    tenantScoped: true,
    implementationPath:
      "status/diagnostics only today — real metric readers not wired (GA4/social_metrics exist but not through this capability)",
  }),
  "analytics.attribution": cap("analytics.attribution", {
    label: "Analytics attribution",
    riskLevel: "low",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["attribution_report"],
    providerKeys: ["analytics-attribution-placeholder"],
    integrationRequirements: ["analytics_property"],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "report.generate": cap("report.generate", {
    label: "Report generation",
    riskLevel: "low",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["analytics_evidence"],
    supportedOutputArtifacts: ["report_artifact", "executive_summary"],
    providerKeys: ["report-generate-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "brand.audit": cap("brand.audit", {
    label: "Brand audit",
    riskLevel: "low",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["brand_brain"],
    supportedOutputArtifacts: ["brand_audit_report"],
    providerKeys: ["brand-audit-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "conversion.audit": cap("conversion.audit", {
    label: "Conversion audit",
    riskLevel: "low",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: ["website_snapshot", "funnel_snapshot"],
    supportedOutputArtifacts: ["conversion_audit_report"],
    providerKeys: ["conversion-audit-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "sales.analyze": cap("sales.analyze", {
    label: "Sales process analyze",
    riskLevel: "low",
    externalMutation: false,
    status: "PLANNED",
    requiredEntitlementClass: null,
    approvalRequired: false,
    supportedInputArtifacts: [],
    supportedOutputArtifacts: ["sales_analysis"],
    providerKeys: ["sales-analyze-placeholder"],
    integrationRequirements: [],
    tenantScoped: true,
    implementationPath: "packages/workforce-core/src/capabilities (contract only)",
  }),
  "content.publish": cap("content.publish", {
    label: "Content publish",
    riskLevel: "high",
    externalMutation: true,
    status: "NOT_CONFIGURED",
    requiredEntitlementClass: null,
    approvalRequired: true,
    supportedInputArtifacts: ["content_approved"],
    supportedOutputArtifacts: ["content_publish_receipt"],
    providerKeys: ["content-publish-placeholder"],
    integrationRequirements: ["cms_or_site_host"],
    tenantScoped: true,
    implementationPath: "publish bridge incomplete",
  }),
};

export function validateCapabilityDefinition(def: CapabilityDefinition): string[] {
  const errors: string[] = [];
  if (!isCapabilityKey(def.key)) errors.push(`unknown_key:${def.key}`);
  if (!def.label?.trim()) errors.push(`missing_label:${def.key}`);
  if (!def.status) errors.push(`missing_status:${def.key}`);
  if (!def.implementationPath?.trim()) errors.push(`missing_implementation_path:${def.key}`);
  if (def.externalMutation && !def.approvalRequired) {
    errors.push(`external_mutation_requires_approval:${def.key}`);
  }
  if (def.tenantScoped !== true && def.tenantScoped !== false) {
    errors.push(`invalid_tenant_scoped:${def.key}`);
  }
  if (!Array.isArray(def.providerKeys)) errors.push(`invalid_provider_keys:${def.key}`);
  if (!Array.isArray(def.integrationRequirements)) errors.push(`invalid_integration_requirements:${def.key}`);
  if (!Array.isArray(def.supportedInputArtifacts)) errors.push(`invalid_input_artifacts:${def.key}`);
  if (!Array.isArray(def.supportedOutputArtifacts)) errors.push(`invalid_output_artifacts:${def.key}`);
  return errors;
}

export function assertRegistryIntegrity(): void {
  const keys = Object.keys(CAPABILITY_REGISTRY);
  if (keys.length !== CAPABILITY_KEYS.length) {
    throw new Error(
      `capability_registry_size_mismatch:registry=${keys.length},keys=${CAPABILITY_KEYS.length}`,
    );
  }
  const seen = new Set<string>();
  for (const key of CAPABILITY_KEYS) {
    if (seen.has(key)) throw new Error(`duplicate_capability_key:${key}`);
    seen.add(key);
    const def = CAPABILITY_REGISTRY[key];
    if (!def) throw new Error(`missing_capability_definition:${key}`);
    if (def.key !== key) throw new Error(`capability_key_mismatch:${key}`);
    const errors = validateCapabilityDefinition(def);
    if (errors.length) throw new Error(`invalid_capability:${errors.join(",")}`);
  }
  for (const key of keys) {
    if (!isCapabilityKey(key)) throw new Error(`extraneous_capability_key:${key}`);
  }
}

assertRegistryIntegrity();

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
  return !!capDef && isStaticExecutableStatus(capDef.status);
}

export function isCapabilityUnavailable(key: string): boolean {
  const capDef = getCapability(key);
  return !!capDef && isNonExecutableStatus(capDef.status);
}

export function countCapabilitiesByStatus(): Record<CapabilityStatus, number> {
  const counts: Record<CapabilityStatus, number> = {
    AVAILABLE: 0,
    NOT_CONFIGURED: 0,
    PLANNED: 0,
    UNAVAILABLE: 0,
  };
  for (const def of listCapabilities()) {
    counts[def.status] += 1;
  }
  return counts;
}

/**
 * Static catalogue AVAILABLE count vs provider-ready count.
 * Provider-ready = IMPLEMENTED provider probe ready — does NOT evaluate
 * tenant entitlement, integration, shadow, kill, or authorization.
 * For tenant runtime matrix use lib/workforce/capability-runtime-matrix.ts.
 */
export async function countCapabilityOperationalMatrix(args: {
  tenantId: string;
}): Promise<{
  staticAvailable: number;
  /** @deprecated Use providerOperational — this is NOT full runtime readiness. */
  runtimeOperational: number;
  providerOperational: number;
  staticByStatus: Record<CapabilityStatus, number>;
}> {
  const staticByStatus = countCapabilitiesByStatus();
  const { getProvidersForCapability } = await import("../providers/registry.ts");
  let providerOperational = 0;
  for (const def of listCapabilities()) {
    if (def.status !== "AVAILABLE") continue;
    const providers = getProvidersForCapability(def.key);
    let ready = false;
    for (const provider of providers) {
      if (provider.status !== "IMPLEMENTED") continue;
      const probe = await provider.probeReadiness({
        tenantId: args.tenantId,
        capability: def.key,
      });
      if (probe.ready && probe.status === "IMPLEMENTED") {
        ready = true;
        break;
      }
    }
    if (ready) providerOperational += 1;
  }
  return {
    staticAvailable: staticByStatus.AVAILABLE,
    providerOperational,
    runtimeOperational: providerOperational,
    staticByStatus,
  };
}
