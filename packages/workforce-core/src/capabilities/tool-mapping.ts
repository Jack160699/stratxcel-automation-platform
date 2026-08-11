import type { CapabilityKey } from "./types.ts";
import { CAPABILITY_KEYS } from "./types.ts";

/**
 * Capability → Stratxcel-controlled tool/service bridges.
 * Not 1:1 with Hermes MCP ToolName — departments must not call providers directly.
 */
export interface CapabilityToolMapping {
  capability: CapabilityKey;
  /** Controlled Stratxcel service/tool bridge keys. */
  toolBridges: readonly string[];
  hermesTools: readonly string[];
  notes: string;
}

const MAPPINGS: Record<CapabilityKey, CapabilityToolMapping> = {
  "research.web": {
    capability: "research.web",
    toolBridges: ["research.web_fetch"],
    hermesTools: ["attach_research_evidence"],
    notes: "PLANNED controlled research bridge",
  },
  "research.serp": {
    capability: "research.serp",
    toolBridges: ["research.serp_query"],
    hermesTools: ["attach_research_evidence"],
    notes: "PLANNED SERP bridge via search-discovery",
  },
  "content.shortform": {
    capability: "content.shortform",
    toolBridges: ["content.shortform_draft"],
    hermesTools: ["get_brand_context", "create_draft_artifact"],
    notes: "Draft short-form via Hermes artifact tools",
  },
  "content.longform": {
    capability: "content.longform",
    toolBridges: ["content.longform_draft"],
    hermesTools: ["get_brand_context", "create_draft_artifact"],
    notes: "PLANNED long-form path",
  },
  "media.image_generation": {
    capability: "media.image_generation",
    toolBridges: ["media.image_generate"],
    hermesTools: [],
    notes: "Provider boundary only — no Hermes native image_gen",
  },
  "media.carousel_generation": {
    capability: "media.carousel_generation",
    toolBridges: ["media.carousel_generate"],
    hermesTools: [],
    notes: "PLANNED carousel renderer",
  },
  "media.video_generation": {
    capability: "media.video_generation",
    toolBridges: [],
    hermesTools: [],
    notes: "UNAVAILABLE — no controlled video provider",
  },
  "social.schedule": {
    capability: "social.schedule",
    toolBridges: ["social.schedule_queue"],
    hermesTools: ["query_publication_status"],
    notes: "Package/schedule queue",
  },
  "social.publish": {
    capability: "social.publish",
    toolBridges: ["social.publish_external"],
    hermesTools: ["submit_publish_request", "get_approval_status", "request_approval"],
    notes: "External mutation — approval + Shadow gated",
  },
  "seo.audit": {
    capability: "seo.audit",
    toolBridges: ["seo.audit_run"],
    hermesTools: ["create_draft_artifact"],
    notes: "search-discovery audit path",
  },
  "seo.article": {
    capability: "seo.article",
    toolBridges: ["seo.article_draft"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED article drafting",
  },
  "seo.publish": {
    capability: "seo.publish",
    toolBridges: ["seo.publish_cms"],
    hermesTools: ["request_approval"],
    notes: "NOT_CONFIGURED CMS publish",
  },
  "website.generate": {
    capability: "website.generate",
    toolBridges: ["website.generate_draft"],
    hermesTools: ["create_website_change_request", "create_draft_artifact"],
    notes: "websites-and-domains draft generation",
  },
  "website.deploy": {
    capability: "website.deploy",
    toolBridges: ["website.deploy_live"],
    hermesTools: ["request_approval"],
    notes: "PLANNED deploy — external mutation",
  },
  "website.audit": {
    capability: "website.audit",
    toolBridges: ["website.audit_run"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED website audit",
  },
  "ads.plan": {
    capability: "ads.plan",
    toolBridges: ["ads.plan_draft"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED ads planning only",
  },
  "ads.publish": {
    capability: "ads.publish",
    toolBridges: ["ads.publish_campaign"],
    hermesTools: ["request_approval"],
    notes: "PLANNED — no Marketing API spend path",
  },
  "ads.audit": {
    capability: "ads.audit",
    toolBridges: ["ads.audit_run"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED ads audit",
  },
  "crm.read": {
    capability: "crm.read",
    toolBridges: ["crm.read_leads"],
    hermesTools: [],
    notes: "leads-and-crm repository read",
  },
  "crm.write": {
    capability: "crm.write",
    toolBridges: ["crm.mutate_lead"],
    hermesTools: ["create_crm_lead", "request_approval"],
    notes: "External mutation — approval required",
  },
  "crm.followup_plan": {
    capability: "crm.followup_plan",
    toolBridges: ["crm.followup_plan_draft"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED follow-up planning",
  },
  "whatsapp.send": {
    capability: "whatsapp.send",
    toolBridges: ["whatsapp.outbound"],
    hermesTools: ["request_approval"],
    notes: "Only sendOutboundWhatsAppMessage after readiness",
  },
  "whatsapp.followup_plan": {
    capability: "whatsapp.followup_plan",
    toolBridges: ["whatsapp.followup_plan_draft"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED — no autonomous send",
  },
  "analytics.read": {
    capability: "analytics.read",
    toolBridges: ["analytics.read_metrics"],
    hermesTools: [],
    notes: "NOT_CONFIGURED analytics bridge",
  },
  "analytics.attribution": {
    capability: "analytics.attribution",
    toolBridges: ["analytics.attribution_report"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED attribution",
  },
  "report.generate": {
    capability: "report.generate",
    toolBridges: ["report.generate_artifact"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED report generation",
  },
  "brand.audit": {
    capability: "brand.audit",
    toolBridges: ["brand.audit_run"],
    hermesTools: ["get_brand_context", "create_draft_artifact"],
    notes: "PLANNED brand audit",
  },
  "conversion.audit": {
    capability: "conversion.audit",
    toolBridges: ["conversion.audit_run"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED conversion audit",
  },
  "sales.analyze": {
    capability: "sales.analyze",
    toolBridges: ["sales.analyze_process"],
    hermesTools: ["create_draft_artifact"],
    notes: "PLANNED sales analysis",
  },
  "content.publish": {
    capability: "content.publish",
    toolBridges: ["content.publish_external"],
    hermesTools: ["request_approval"],
    notes: "NOT_CONFIGURED content publish",
  },
};

export function getCapabilityToolMapping(key: CapabilityKey | string): CapabilityToolMapping | undefined {
  return MAPPINGS[key as CapabilityKey];
}

export function listCapabilityToolMappings(): CapabilityToolMapping[] {
  return CAPABILITY_KEYS.map((k) => MAPPINGS[k]);
}

export function assertCapabilityToolMappingsComplete(): void {
  for (const key of CAPABILITY_KEYS) {
    if (!MAPPINGS[key]) throw new Error(`missing_tool_mapping:${key}`);
    if (MAPPINGS[key].capability !== key) throw new Error(`tool_mapping_key_mismatch:${key}`);
  }
}

assertCapabilityToolMappingsComplete();
