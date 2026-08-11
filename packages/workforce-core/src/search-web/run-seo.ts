import { createDepartmentHandoff } from "../handoffs/create.ts";
import type { DepartmentHandoff } from "../handoffs/create.ts";
import type { WorkforceStage } from "../planning/types.ts";
import { buildSeoArticleBrief, buildSeoArticleDraft } from "./article-pipeline.ts";
import { resolveSerpCapabilityGate } from "./capability-gate.ts";
import { buildSeoDepartmentStages } from "./department-workflows.ts";
import { buildInternalLinkPlan } from "./internal-linking.ts";
import { buildContentGapMap, buildKeywordMap } from "./keyword-map.ts";
import { buildLocalSeoRecommendation } from "./local-seo.ts";
import { createSeoPublishRequest } from "./publish-boundary.ts";
import { buildSeoAuditReport } from "./seo-audit.ts";
import { buildSerpAnalysis } from "./serp.ts";
import type {
  ContentGapMap,
  InternalLinkPlan,
  KeywordMap,
  KnownPage,
  LocalSeoRecommendation,
  QueryEvidence,
  SeoArticleBrief,
  SeoArticleDraft,
  SeoAuditReport,
  SeoPublishRequest,
  SeoResearchBrief,
  SerpAnalysis,
} from "./types.ts";
import type { TechnicalPage } from "@stratxcel/search-discovery";

export type RunSeoDepartmentInput = {
  tenantId: string;
  missionId: string;
  planId: string;
  businessObjective: string;
  targetTopics: readonly string[];
  geography?: string;
  queryEvidence: readonly QueryEvidence[];
  evidenceIds: readonly string[];
  propertyUrl: string;
  pages: TechnicalPage[];
  site: { https: boolean; robotsPresent: boolean; sitemapPresent: boolean };
  services: readonly string[];
  locations?: readonly string[];
  existingPages: readonly { url: string; title?: string; topics?: readonly string[] }[];
  knownPages: readonly KnownPage[];
  linkSuggestions?: readonly {
    sourceUrl: string;
    targetUrl: string;
    anchorHint: string;
    rationale: string;
  }[];
  articleOutline: readonly string[];
  articleTitle: string;
  articleBody: string;
  factualClaims: readonly { claim: string; evidenceId: string }[];
  local?: {
    services: readonly string[];
    cities: readonly string[];
    gbpConnected?: boolean;
  };
};

export type SeoDepartmentRunResult = {
  stages: WorkforceStage[];
  researchBrief: SeoResearchBrief;
  serpAnalysis: SerpAnalysis;
  keywordMap: KeywordMap;
  auditReport: SeoAuditReport;
  contentGapMap: ContentGapMap;
  articleBrief: SeoArticleBrief;
  articleDraft: SeoArticleDraft;
  internalLinkPlan: InternalLinkPlan;
  publishRequest: SeoPublishRequest;
  localSeo?: LocalSeoRecommendation;
  handoffs: DepartmentHandoff[];
  serpGate: ReturnType<typeof resolveSerpCapabilityGate>;
};

export function runSeoDepartment(input: RunSeoDepartmentInput): SeoDepartmentRunResult {
  const stages = buildSeoDepartmentStages();
  const serpGate = resolveSerpCapabilityGate();

  const researchBrief: SeoResearchBrief = {
    kind: "seo_research_brief",
    id: `seo_research_brief_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    businessObjective: input.businessObjective,
    targetTopics: [...input.targetTopics],
    geography: input.geography,
    evidenceIds: [...input.evidenceIds],
    openQuestions: serpGate.executable ? [] : ["SERP provider evidence required before ranking claims"],
  };

  const serpAnalysis = buildSerpAnalysis({
    tenantId: input.tenantId,
    observedHits: [],
    providerAvailable: serpGate.executable,
  });

  const keywordMap = buildKeywordMap({
    tenantId: input.tenantId,
    queryEvidence: input.queryEvidence,
  });

  const auditReport = buildSeoAuditReport({
    trustedTenantId: input.tenantId,
    siteTenantId: input.tenantId,
    propertyUrl: input.propertyUrl,
    pages: input.pages,
    site: input.site,
    evidenceIds: input.evidenceIds,
  });

  const contentGapMap = buildContentGapMap({
    tenantId: input.tenantId,
    services: input.services,
    locations: input.locations,
    existingPages: input.existingPages,
    evidenceIds: input.evidenceIds,
  });

  const articleBrief = buildSeoArticleBrief({
    tenantId: input.tenantId,
    primaryQuery: input.queryEvidence[0]?.query ?? input.targetTopics[0] ?? "topic",
    intent: input.queryEvidence[0]?.intent ?? "informational",
    outline: input.articleOutline,
    evidenceIds: input.evidenceIds,
    businessObjective: input.businessObjective,
  });

  const articleDraft = buildSeoArticleDraft({
    tenantId: input.tenantId,
    brief: articleBrief,
    title: input.articleTitle,
    body: input.articleBody,
    factualClaims: input.factualClaims,
  });

  const internalLinkPlan = buildInternalLinkPlan({
    tenantId: input.tenantId,
    knownPages: input.knownPages,
    suggestions: input.linkSuggestions ?? [],
  });

  const publishRequest = createSeoPublishRequest({
    tenantId: input.tenantId,
    articleDraft,
  });

  const localSeo = input.local
    ? buildLocalSeoRecommendation({
        tenantId: input.tenantId,
        services: input.local.services,
        cities: input.local.cities,
        gbpConnected: input.local.gbpConnected,
      })
    : undefined;

  const artifactIds = [
    researchBrief.id,
    serpAnalysis.id,
    keywordMap.id,
    auditReport.id,
    contentGapMap.id,
    articleBrief.id,
    articleDraft.id,
    internalLinkPlan.id,
    publishRequest.id,
  ];

  const handoffs: DepartmentHandoff[] = [
    createDepartmentHandoff({
      tenantId: input.tenantId,
      missionId: input.missionId,
      planId: input.planId,
      fromStage: "seo_research",
      toStage: "seo_serp",
      objective: "Hand off research brief for SERP analysis",
      artifactIds: [researchBrief.id],
      evidenceIds: input.evidenceIds,
      decisions: ["Proceed with evidence-backed keyword work only"],
      unresolvedQuestions: researchBrief.openQuestions,
      constraints: ["Never fabricate SERP rankings or volumes"],
      qualityStatus: "not_reviewed",
    }),
    createDepartmentHandoff({
      tenantId: input.tenantId,
      missionId: input.missionId,
      planId: input.planId,
      fromStage: "seo_article_draft",
      toStage: "seo_internal_links",
      objective: "Hand off draft for internal linking against known inventory",
      artifactIds,
      evidenceIds: input.evidenceIds,
      decisions: ["Publish remains unauthorized until explicit approval"],
      unresolvedQuestions: [],
      constraints: ["No invented URLs", "No production SEO publish from generation alone"],
      qualityStatus: "not_reviewed",
    }),
  ];

  return {
    stages,
    researchBrief,
    serpAnalysis,
    keywordMap,
    auditReport,
    contentGapMap,
    articleBrief,
    articleDraft,
    internalLinkPlan,
    publishRequest,
    localSeo,
    handoffs,
    serpGate,
  };
}
