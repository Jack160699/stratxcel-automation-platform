import type { DepartmentKey } from "../departments/types.ts";

/**
 * V2 internal catalogue metadata — does not replace existing SERVICE_CATALOGUE keys.
 */
export interface ServiceCatalogueV2Metadata {
  serviceKey: string;
  defaultDepartmentWorkflow: readonly DepartmentKey[];
  deliverableClasses: readonly string[];
  requiredCapabilityClasses: readonly string[];
  entitlementClasses: readonly string[];
}

export const SERVICE_CATALOGUE_V2: Record<string, ServiceCatalogueV2Metadata> = {
  brand_audit: {
    serviceKey: "brand_audit",
    defaultDepartmentWorkflow: ["executive", "research", "brand", "analytics", "reporting", "quality"],
    deliverableClasses: ["brand_audit_report"],
    requiredCapabilityClasses: ["research.web", "analytics.read", "report.generate"],
    entitlementClasses: [],
  },
  social_campaign: {
    serviceKey: "social_campaign",
    defaultDepartmentWorkflow: [
      "executive",
      "strategy",
      "research",
      "brand",
      "creative",
      "content",
      "media",
      "quality",
      "compliance",
      "social",
    ],
    deliverableClasses: ["social_campaign_pack", "caption_set", "image_final"],
    requiredCapabilityClasses: ["content.shortform", "media.image_generation", "social.schedule"],
    entitlementClasses: ["social_posts"],
  },
  content_calendar: {
    serviceKey: "content_calendar",
    defaultDepartmentWorkflow: ["executive", "strategy", "content", "social", "quality"],
    deliverableClasses: ["content_calendar"],
    requiredCapabilityClasses: ["content.shortform", "social.schedule"],
    entitlementClasses: ["social_posts"],
  },
  website_landing_page: {
    serviceKey: "website_landing_page",
    defaultDepartmentWorkflow: ["executive", "research", "brand", "content", "website", "quality", "compliance"],
    deliverableClasses: ["website_draft"],
    requiredCapabilityClasses: ["website.generate"],
    entitlementClasses: ["website_maintenance"],
  },
  seo_audit: {
    serviceKey: "seo_audit",
    defaultDepartmentWorkflow: ["executive", "research", "seo", "content", "quality", "analytics"],
    deliverableClasses: ["seo_audit_report"],
    requiredCapabilityClasses: ["seo.audit", "research.serp"],
    entitlementClasses: [],
  },
  proposal: {
    serviceKey: "proposal",
    defaultDepartmentWorkflow: ["executive", "sales", "brand", "content", "quality", "compliance"],
    deliverableClasses: ["proposal_document"],
    requiredCapabilityClasses: ["content.longform", "report.generate"],
    entitlementClasses: [],
  },
  report: {
    serviceKey: "report",
    defaultDepartmentWorkflow: ["executive", "analytics", "reporting", "quality"],
    deliverableClasses: ["report_artifact"],
    requiredCapabilityClasses: ["analytics.read", "report.generate"],
    entitlementClasses: [],
  },
  custom_mission: {
    serviceKey: "custom_mission",
    defaultDepartmentWorkflow: ["executive", "strategy"],
    deliverableClasses: ["mission_charter"],
    requiredCapabilityClasses: [],
    entitlementClasses: [],
  },
  owner_operating_brain_context: {
    serviceKey: "owner_operating_brain_context",
    defaultDepartmentWorkflow: ["executive", "operations"],
    deliverableClasses: ["owner_brain_plan"],
    requiredCapabilityClasses: [],
    entitlementClasses: [],
  },
  thirty_day_growth_plan: {
    serviceKey: "thirty_day_growth_plan",
    defaultDepartmentWorkflow: [
      "executive",
      "strategy",
      "research",
      "brand",
      "content",
      "media",
      "quality",
      "compliance",
      "social",
      "analytics",
    ],
    deliverableClasses: ["thirty_day_growth_plan", "social_execution_allocation"],
    requiredCapabilityClasses: ["content.shortform", "research.web", "analytics.read"],
    entitlementClasses: ["social_posts"],
  },
};

export function getServiceCatalogueV2(serviceKey: string): ServiceCatalogueV2Metadata | undefined {
  return SERVICE_CATALOGUE_V2[serviceKey];
}
