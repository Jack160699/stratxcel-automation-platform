import type { CapabilityKey } from "../capabilities/types.ts";
import { getCapability } from "../capabilities/registry.ts";
import type { WorkforceStage } from "../planning/types.ts";
import { isSerpStyleBlocked } from "./capability-gate.ts";

function stage(
  partial: Omit<
    WorkforceStage,
    "state" | "maxAttempts" | "qualityGate" | "budgetCents" | "inputs" | "requiredEvidence" | "allowedCapabilityClasses"
  > &
    Partial<WorkforceStage>,
): WorkforceStage {
  const caps = partial.allowedCapabilityClasses ?? [];
  const blocked = caps
    .map((c) => ({ c, status: getCapability(c)?.status }))
    .find((x) => {
      // research.serp-style: also block PLANNED
      if (x.c === "research.serp" || x.c === "research.web") {
        return isSerpStyleBlocked(x.c);
      }
      return x.status === "UNAVAILABLE" || x.status === "NOT_CONFIGURED";
    });

  return {
    inputs: [],
    requiredEvidence: [],
    budgetCents: 500,
    qualityGate: ["search_intent_fit"],
    maxAttempts: 3,
    ...partial,
    allowedCapabilityClasses: caps as CapabilityKey[],
    state: blocked ? "WAITING_CAPABILITY" : (partial.state ?? "PENDING"),
    blockedCapability: blocked?.c ?? partial.blockedCapability ?? null,
  };
}

/**
 * SEO department stages. Does NOT include seo.publish (external mutation boundary).
 */
export function buildSeoDepartmentStages(): WorkforceStage[] {
  return [
    stage({
      stageId: "seo_research",
      department: "seo",
      specialistRole: "keyword_researcher",
      objective: "Build SEO research brief from business objective",
      dependencies: [],
      outputKind: "seo_research_brief",
      allowedCapabilityClasses: ["seo.audit"],
    }),
    stage({
      stageId: "seo_serp",
      department: "seo",
      specialistRole: "serp_researcher",
      objective: "SERP/competitor analysis with real provider evidence",
      dependencies: ["seo_research"],
      outputKind: "serp_analysis",
      allowedCapabilityClasses: ["research.serp"],
      requiredEvidence: ["serp_evidence"],
    }),
    stage({
      stageId: "seo_keyword_map",
      department: "seo",
      specialistRole: "keyword_researcher",
      objective: "Map keyword opportunities from query evidence only",
      dependencies: ["seo_serp"],
      outputKind: "keyword_map",
      allowedCapabilityClasses: ["seo.audit", "seo.article"],
    }),
    stage({
      stageId: "seo_audit",
      department: "seo",
      specialistRole: "onpage_optimizer",
      objective: "Technical and on-page SEO audit",
      dependencies: ["seo_research"],
      outputKind: "seo_audit_report",
      allowedCapabilityClasses: ["seo.audit"],
    }),
    stage({
      stageId: "seo_gaps",
      department: "seo",
      specialistRole: "keyword_researcher",
      objective: "Content gap map vs services and locations",
      dependencies: ["seo_keyword_map", "seo_audit"],
      outputKind: "content_gap_map",
      allowedCapabilityClasses: ["seo.audit"],
    }),
    stage({
      stageId: "seo_article_brief",
      department: "seo",
      specialistRole: "seo_writer",
      objective: "Keyword/intent article brief with evidence ids",
      dependencies: ["seo_gaps"],
      outputKind: "seo_article_brief",
      allowedCapabilityClasses: ["seo.article"],
      requiredEvidence: ["serp_evidence"],
    }),
    stage({
      stageId: "seo_article_draft",
      department: "content",
      specialistRole: "longform_writer",
      objective: "Draft SEO article with cited factual claims",
      dependencies: ["seo_article_brief"],
      outputKind: "seo_article_draft",
      allowedCapabilityClasses: ["seo.article", "content.longform"],
    }),
    stage({
      stageId: "seo_internal_links",
      department: "seo",
      specialistRole: "internal_linking_specialist",
      objective: "Internal link plan from known page inventory",
      dependencies: ["seo_article_draft"],
      outputKind: "internal_link_plan",
      allowedCapabilityClasses: ["seo.audit"],
    }),
    stage({
      stageId: "seo_quality",
      department: "quality",
      specialistRole: "final_reviewer",
      objective: "QA SEO draft for brand, factuality, and search intent",
      dependencies: ["seo_internal_links"],
      outputKind: "qa_report",
      allowedCapabilityClasses: [],
    }),
  ];
}

/**
 * Website department stages. Uses website.generate (AVAILABLE).
 * Does NOT include website.deploy (external mutation boundary).
 */
export function buildWebsiteDepartmentStages(): WorkforceStage[] {
  return [
    stage({
      stageId: "web_audit",
      department: "website",
      specialistRole: "ux_architect",
      objective: "Website audit preserving strong pages",
      dependencies: [],
      outputKind: "website_audit",
      allowedCapabilityClasses: ["website.generate"],
    }),
    stage({
      stageId: "web_page_brief",
      department: "website",
      specialistRole: "ux_architect",
      objective: "Page objective and UX/conversion brief",
      dependencies: ["web_audit"],
      outputKind: "page_brief",
      allowedCapabilityClasses: ["website.generate"],
    }),
    stage({
      stageId: "web_generate",
      department: "website",
      specialistRole: "landing_page_builder",
      objective: "Generate targeted website change or landing page (preview path)",
      dependencies: ["web_page_brief"],
      outputKind: "website_change",
      allowedCapabilityClasses: ["website.generate"],
    }),
    stage({
      stageId: "web_landing",
      department: "website",
      specialistRole: "page_copy_specialist",
      objective: "Landing page draft: traffic → promise → evidence → offer → CTA → lead capture",
      dependencies: ["web_generate"],
      outputKind: "landing_page_draft",
      allowedCapabilityClasses: ["website.generate", "content.longform"],
    }),
    stage({
      stageId: "web_preview",
      department: "website",
      specialistRole: "deploy_coordinator",
      objective: "Bind revision to preview deploy candidate (no production deploy)",
      dependencies: ["web_landing"],
      outputKind: "website_preview",
      allowedCapabilityClasses: ["website.generate"],
    }),
    stage({
      stageId: "web_quality",
      department: "quality",
      specialistRole: "final_reviewer",
      objective: "QA website preview before any deployment request",
      dependencies: ["web_preview"],
      outputKind: "qa_report",
      allowedCapabilityClasses: [],
    }),
  ];
}
