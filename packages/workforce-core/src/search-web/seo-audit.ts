import { analyzeTechnicalSeo } from "@stratxcel/search-discovery";
import type { TechnicalIssue, TechnicalPage } from "@stratxcel/search-discovery";
import { assertTenantScope } from "./capability-gate.ts";
import type { SeoAuditFinding, SeoAuditReport, SeoFindingClassification } from "./types.ts";

function classifyIssue(issue: TechnicalIssue): SeoFindingClassification {
  const code = issue.code.toUpperCase();
  if (code.includes("INDEX") || code === "NOT_INDEXABLE" || code.includes("ROBOTS") || code.includes("SITEMAP")) {
    return "indexation";
  }
  if (code.includes("STRUCTURED") || code.includes("SCHEMA")) return "structured_data";
  if (code.includes("ORPHAN") || code.includes("INTERNAL_LINK")) return "internal_linking";
  if (code.includes("LCP") || code.includes("INP") || code.includes("CLS") || code.includes("PERF")) {
    return "performance";
  }
  if (code.includes("HTTPS") || code.includes("TRUST") || code.includes("SECURITY")) return "trust";
  if (code.includes("LOCAL") || code.includes("NAP") || code.includes("GBP")) return "local_search";
  if (code.includes("TITLE") || code.includes("META") || code.includes("HEADING") || code.includes("ALT") || code.includes("CANONICAL")) {
    return "on_page";
  }
  if (code.includes("CONTENT_GAP") || code.includes("THIN")) return "content_gap";
  if (code.includes("CTA") || code.includes("CONVERSION") || code.includes("FORM")) {
    return "conversion_relevance";
  }
  if (code.includes("BROKEN") || code.includes("HTTPS") || code.includes("CANONICAL")) return "technical";
  return "technical";
}

function impactPriority(severity: string): number {
  switch (severity) {
    case "Critical":
      return 100;
    case "High":
      return 80;
    case "Medium":
      return 55;
    case "Low":
      return 30;
    default:
      return 40;
  }
}

export function toSeoAuditFinding(issue: TechnicalIssue): SeoAuditFinding {
  return {
    code: issue.code,
    classification: classifyIssue(issue),
    severity: issue.severity,
    evidence: issue.evidence,
    affectedUrl: issue.affectedUrl,
    whyItMatters: issue.whyItMatters,
    recommendedAction: issue.recommendedAction,
    impactPriority: impactPriority(issue.severity),
  };
}

export function buildSeoAuditReport(input: {
  trustedTenantId: string;
  siteTenantId: string;
  propertyUrl: string;
  pages: TechnicalPage[];
  site: { https: boolean; robotsPresent: boolean; sitemapPresent: boolean };
  evidenceIds?: readonly string[];
}): SeoAuditReport {
  assertTenantScope(input.trustedTenantId, input.siteTenantId);
  const issues = analyzeTechnicalSeo(input.pages, input.site);
  const findings = issues
    .map(toSeoAuditFinding)
    .sort((a, b) => b.impactPriority - a.impactPriority);

  return {
    kind: "seo_audit_report",
    id: `seo_audit_report_${crypto.randomUUID()}`,
    tenantId: input.trustedTenantId,
    propertyUrl: input.propertyUrl,
    findings,
    evidenceIds: input.evidenceIds ?? [],
  };
}
