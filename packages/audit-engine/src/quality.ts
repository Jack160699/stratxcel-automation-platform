import type {
  AuditQualityOutcome,
  AuditReportFinding,
  AuditReportV1,
  AuditScoreDimension,
} from "./types.ts";
import type { ResearchResult } from "@stratxcel/search-discovery";

const PLACEHOLDER = /\b(lorem ipsum|insert here|tbd|placeholder|generic business|your company)\b/i;

const CATEGORY_KEYS = [
  "brandPositioning",
  "websiteConversion",
  "discoverabilitySeo",
  "socialContent",
  "leadGeneration",
  "trustReputation",
  "customerJourney",
  "automationOperations",
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 2_000))
    .filter(Boolean)
    .slice(0, max);
}

function scoreOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function scoreRequired(value: unknown, fallback = 0): number {
  return scoreOrNull(value) ?? fallback;
}

function emptyDimension(explanation = "Not enough data"): AuditScoreDimension {
  return { score: null, explanation, evidenceSourceIds: [] };
}

function normalizeDimension(
  value: unknown,
  sourceIds: Set<string>,
): AuditScoreDimension {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyDimension();
  }
  const row = value as Record<string, unknown>;
  const explanation = text(row.explanation).slice(0, 2_000) || "Not enough data";
  const evidenceSourceIds = textList(row.evidenceSourceIds ?? row.evidenceIds, 12)
    .filter((id) => sourceIds.has(id));
  const score = scoreOrNull(row.score);
  if (score == null || evidenceSourceIds.length === 0) {
    return {
      score: null,
      explanation: explanation || "Not enough data",
      evidenceSourceIds,
    };
  }
  return { score, explanation, evidenceSourceIds };
}

function planLists(rawPlan: Record<string, unknown>): {
  days30: string[];
  days60: string[];
  days90: string[];
} {
  return {
    days30: textList(rawPlan.days30 ?? rawPlan.days1To30, 12),
    days60: textList(rawPlan.days60 ?? rawPlan.days31To60, 12),
    days90: textList(rawPlan.days90 ?? rawPlan.days61To90, 12),
  };
}

export function canonicalizeResearchSources(
  research: ResearchResult,
): ResearchResult {
  const sources = research.sources.map((source, index) => {
    const stableId = source.id?.startsWith("src_")
      ? source.id
      : `src_${index + 1}_${source.domain.replace(/[^a-z0-9.-]/gi, "").slice(0, 40) || "source"}`;
    return { ...source, id: stableId };
  });
  const idMap = new Map(research.sources.map((source, index) => [source.id, sources[index]!.id]));
  const claims = research.claims.map((claim) => ({
    ...claim,
    sourceIds: claim.sourceIds
      .map((id) => idMap.get(id) ?? id)
      .filter((id, index, arr) => arr.indexOf(id) === index),
  }));
  return {
    ...research,
    sources,
    claims,
    // Canonical evidence IDs are the persisted research_data.sources IDs.
    evidenceArtifactIds: sources.map((source) => source.id),
    summaryArtifactId: research.summaryArtifactId
      ? "summary_research"
      : sources.length
        ? "summary_research"
        : null,
  };
}

export function normalizeAuditReport(
  raw: unknown,
  args: {
    businessName: string;
    brandBrainVersion: number;
    generatedAt: string;
    research: ResearchResult;
  },
): AuditReportV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const executiveSummary = text(value.executiveSummary).slice(0, 8_000);
  const priorityRisks = textList(value.priorityRisks, 12);
  const actionPlan = textList(value.actionPlan, 20);
  if (!executiveSummary || priorityRisks.length === 0 || actionPlan.length === 0) return null;

  const rawScores =
    value.scores && typeof value.scores === "object" && !Array.isArray(value.scores)
      ? value.scores as Record<string, unknown>
      : {};
  const rawOverallHealth =
    value.overallHealth && typeof value.overallHealth === "object" && !Array.isArray(value.overallHealth)
      ? value.overallHealth as Record<string, unknown>
      : value.overallScore && typeof value.overallScore === "object" && !Array.isArray(value.overallScore)
        ? value.overallScore as Record<string, unknown>
        : {};
  const rawCategoryScores =
    value.categoryScores && typeof value.categoryScores === "object" && !Array.isArray(value.categoryScores)
      ? value.categoryScores as Record<string, unknown>
      : {};
  const rawPlan =
    value.plan && typeof value.plan === "object" && !Array.isArray(value.plan)
      ? value.plan as Record<string, unknown>
      : {};
  const sourceIds = new Set(args.research.sources.map((source) => source.id));
  const plan = planLists(rawPlan);

  const findings = Array.isArray(value.findings)
    ? value.findings.flatMap((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const finding = item as Record<string, unknown>;
        const title = text(finding.title).slice(0, 240);
        const summary = text(finding.summary).slice(0, 2_000);
        if (!title || !summary) return [];
        const evidenceSourceIds = textList(finding.evidenceSourceIds, 12)
          .filter((id) => sourceIds.has(id));
        const impact: AuditReportFinding["impact"] =
          finding.impact === "HIGH" || finding.impact === "LOW" ? finding.impact : "MEDIUM";
        const confidence: AuditReportFinding["confidence"] =
          finding.confidence === "HIGH" || finding.confidence === "LOW"
            ? finding.confidence
            : "MEDIUM";
        return [{
          id: text(finding.id).slice(0, 120) || `finding_${index + 1}`,
          title,
          summary,
          impact,
          evidenceSourceIds,
          confidence,
        }];
      })
    : [];

  const opportunities = Array.isArray(value.opportunities)
    ? value.opportunities.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const opportunity = item as Record<string, unknown>;
        const title = text(opportunity.title).slice(0, 240);
        const rationale = text(opportunity.rationale).slice(0, 2_000);
        const nextStep = text(opportunity.nextStep).slice(0, 1_000);
        if (!title || !rationale || !nextStep) return [];
        return [{
          title,
          rationale,
          nextStep,
          evidenceSourceIds: textList(opportunity.evidenceSourceIds, 12)
            .filter((id) => sourceIds.has(id)),
        }];
      })
    : [];

  const categoryScores = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [key, normalizeDimension(rawCategoryScores[key], sourceIds)]),
  ) as AuditReportV1["categoryScores"];

  const overallScore = scoreRequired(
    rawOverallHealth.score ?? rawScores.overall ?? value.overallScore,
    scoreRequired(rawScores.overall, 0),
  );
  const overallExplanation = text(rawOverallHealth.explanation).slice(0, 2_000)
    || "Overall readiness based on available Brand Brain context and public evidence.";

  const growthProblems = textList(value.growthProblems, 12);
  const strengths = textList(value.strengths, 12);
  const limitations = textList(
    value.researchLimitations ?? value.limitations,
    12,
  );
  const stratxcelSupport = Array.isArray(value.stratxcelSupport)
    ? value.stratxcelSupport.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        const recommendation = text(row.recommendation).slice(0, 1_000);
        const capability = text(row.capability).slice(0, 240);
        const why = text(row.why).slice(0, 1_000);
        if (!recommendation || !capability || !why) return [];
        // Keep support restrained: reject hard-sell phrasing.
        if (/\b(buy now|limited offer|upsell|must purchase)\b/i.test(`${recommendation} ${why}`)) {
          return [];
        }
        return [{ recommendation, capability, why }];
      }).slice(0, 8)
    : [];

  return {
    reportVersion: "automatic_audit_v1",
    generatedAt: args.generatedAt,
    businessName: args.businessName,
    executiveSummary,
    scores: {
      overall: overallScore,
      digitalPresence: scoreOrNull(rawScores.digitalPresence),
      brandClarity: scoreOrNull(rawScores.brandClarity),
      growthReadiness: scoreOrNull(rawScores.growthReadiness),
      conversionReadiness: scoreOrNull(rawScores.conversionReadiness),
    },
    overallHealth: {
      score: overallScore,
      explanation: overallExplanation,
    },
    categoryScores,
    strengths,
    growthProblems,
    priorityRisks,
    findings,
    opportunities,
    actionPlan,
    quickWins30Days: textList(value.quickWins30Days, 12),
    plan,
    nextActions: textList(value.nextActions, 12),
    ownerActions: textList(value.ownerActions, 12),
    stratxcelSupport,
    sources: args.research.sources.map((source) => ({
      id: source.id,
      url: source.url,
      title: source.title,
      provider: source.provider,
      retrievedAt: source.retrievedAt,
    })),
    connectorAvailability: (args.research.connectorAvailability ?? []).map((record) => ({
      provider: record.provider,
      state: record.state,
      reason: record.reason,
      retrievedAt: record.retrievedAt,
      timeWindow: record.timeWindow,
    })),
    limitations,
    researchLimitations: limitations,
    executiveSearchHealth: value.executiveSearchHealth && typeof value.executiveSearchHealth === "object"
      ? {
          searchAuthorityScore: scoreRequired((value.executiveSearchHealth as any).searchAuthorityScore, overallScore),
          confidence: (value.executiveSearchHealth as any).confidence === "HIGH" || (value.executiveSearchHealth as any).confidence === "LOW" ? (value.executiveSearchHealth as any).confidence : "MEDIUM",
          dataCoverage: text((value.executiveSearchHealth as any).dataCoverage) || "Standard Data Coverage",
        }
      : undefined,
    organicSearchPerformance: value.organicSearchPerformance && typeof value.organicSearchPerformance === "object"
      ? {
          totalClicks: scoreOrNull((value.organicSearchPerformance as any).totalClicks),
          totalImpressions: scoreOrNull((value.organicSearchPerformance as any).totalImpressions),
          averageCtr: typeof (value.organicSearchPerformance as any).averageCtr === "number" ? (value.organicSearchPerformance as any).averageCtr : null,
          averagePosition: typeof (value.organicSearchPerformance as any).averagePosition === "number" ? (value.organicSearchPerformance as any).averagePosition : null,
          topQueries: Array.isArray((value.organicSearchPerformance as any).topQueries) ? (value.organicSearchPerformance as any).topQueries.slice(0, 10) : [],
          topLandingPages: Array.isArray((value.organicSearchPerformance as any).topLandingPages) ? (value.organicSearchPerformance as any).topLandingPages.slice(0, 10) : [],
          performanceSummary: text((value.organicSearchPerformance as any).performanceSummary) || "Organic search diagnostics evaluated.",
        }
      : undefined,
    technicalSeoFindings: value.technicalSeoFindings && typeof value.technicalSeoFindings === "object"
      ? {
          score: scoreRequired((value.technicalSeoFindings as any).score, 75),
          issuesCount: scoreRequired((value.technicalSeoFindings as any).issuesCount, 0),
          criticalIssues: textList((value.technicalSeoFindings as any).criticalIssues, 8),
          recommendations: textList((value.technicalSeoFindings as any).recommendations, 8),
        }
      : undefined,
    contentCoverage: value.contentCoverage && typeof value.contentCoverage === "object"
      ? {
          missingServices: textList((value.contentCoverage as any).missingServices, 8),
          missingLocations: textList((value.contentCoverage as any).missingLocations, 8),
          weakPages: textList((value.contentCoverage as any).weakPages, 8),
          recommendations: textList((value.contentCoverage as any).recommendations, 8),
        }
      : undefined,
    competitorSignals: value.competitorSignals && typeof value.competitorSignals === "object"
      ? {
          knownCompetitors: textList((value.competitorSignals as any).knownCompetitors, 8),
          comparativeInsights: textList((value.competitorSignals as any).comparativeInsights, 8),
          verifiedFindings: textList((value.competitorSignals as any).verifiedFindings, 8),
          unknownAreas: textList((value.competitorSignals as any).unknownAreas, 8),
        }
      : undefined,
    whyTheyWin: Array.isArray(value.whyTheyWin)
      ? (value.whyTheyWin as any[]).map((wtw) => ({
          competitorDomain: text(wtw.competitorDomain) || "competitor.com",
          competitorName: text(wtw.competitorName) || "Competitor",
          query: text(wtw.query) || "target search query",
          gap: text(wtw.gap) || "Competitor ranks ahead in search results",
          evidence: textList(wtw.evidence, 6),
          sources: textList(wtw.sources, 4),
          confidence: wtw.confidence === "HIGH" || wtw.confidence === "LOW" ? wtw.confidence : "MEDIUM",
          likelyReasons: textList(wtw.likelyReasons, 6),
          unknowns: textList(wtw.unknowns, 4),
          recommendedAction: text(wtw.recommendedAction) || "Optimize dedicated content and technical signals",
        })).slice(0, 10)
      : undefined,
    localAndEntity: value.localAndEntity && typeof value.localAndEntity === "object"
      ? {
          gbpStatus: text((value.localAndEntity as any).gbpStatus) || "Not connected",
          entityConsistency: text((value.localAndEntity as any).entityConsistency) || "Baseline verified",
          localOpportunities: textList((value.localAndEntity as any).localOpportunities, 8),
        }
      : undefined,
    aiSearchReadiness: value.aiSearchReadiness && typeof value.aiSearchReadiness === "object"
      ? {
          citationScore: scoreRequired((value.aiSearchReadiness as any).citationScore, 50),
          entityCompleteness: text((value.aiSearchReadiness as any).entityCompleteness) || "Heuristic entity check",
          recommendations: textList((value.aiSearchReadiness as any).recommendations, 8),
        }
      : undefined,
    priorityOpportunities: Array.isArray(value.priorityOpportunities)
      ? (value.priorityOpportunities as any[]).map((opp, idx) => ({
          id: text(opp.id) || `opp_${idx + 1}`,
          category: text(opp.category) || "Search Opportunity",
          problem: text(opp.problem) || text(opp.title) || "Opportunity identified",
          evidence: text(opp.evidence) || text(opp.rationale) || "Based on audit data",
          source: text(opp.source) || "Search Discovery",
          affectedUrl: text(opp.affectedUrl) || undefined,
          affectedQuery: text(opp.affectedQuery) || undefined,
          businessImpact: text(opp.businessImpact) || "High potential growth",
          searchImpact: text(opp.searchImpact) || "Improves organic impressions",
          confidence: opp.confidence === "HIGH" || opp.confidence === "LOW" ? opp.confidence : "MEDIUM",
          difficulty: opp.difficulty === "HARD" || opp.difficulty === "EASY" ? opp.difficulty : "MEDIUM",
          priority: typeof opp.priority === "number" ? opp.priority : idx + 1,
          proposedAction: text(opp.proposedAction) || text(opp.nextStep) || "Execute recommended optimization",
        })).slice(0, 10)
      : undefined,
    whatStratxcelWouldDo: Array.isArray(value.whatStratxcelWouldDo)
      ? (value.whatStratxcelWouldDo as any[]).map((act, idx) => ({
          opportunityId: text(act.opportunityId) || `act_${idx + 1}`,
          title: text(act.title) || "Search Action Plan",
          actionPlan: text(act.actionPlan) || "Automated optimization execution",
          executionType: text(act.executionType) || "Technical & Content Optimization",
          status: "LOCKED_ACTIVATION_REQUIRED" as const,
          lockReason: "Activate Search Growth OS subscription to authorize StratXcel autonomous execution.",
        })).slice(0, 10)
      : undefined,
    generation: {
      method: "automatic_audit_v1",
      brandBrainVersion: args.brandBrainVersion,
    },
  };
}

function materialUnsupportedClaims(research: ResearchResult): number {
  return research.claims.filter((claim) =>
    claim.statementKind === "sourced_fact"
    && (claim.sourceSupportStatus === "unsupported" || claim.sourceIds.length === 0),
  ).length;
}

function sparsePublicPresence(research: ResearchResult): boolean {
  const domains = new Set(research.sources.map((source) => source.domain));
  return research.sources.length < 3 || domains.size < 2;
}

export function evaluateAuditReportQuality(input: {
  report: AuditReportV1 | null;
  research: ResearchResult;
  businessName: string;
}): {
  outcome: AuditQualityOutcome;
  score: number;
  reasons: string[];
  confidenceBand: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  publicPresence: "SUFFICIENT" | "INSUFFICIENT_PUBLIC_PRESENCE";
} {
  const reasons: string[] = [];
  const unsupported = materialUnsupportedClaims(input.research);
  const presence = sparsePublicPresence(input.research)
    ? "INSUFFICIENT_PUBLIC_PRESENCE" as const
    : "SUFFICIENT" as const;

  if (unsupported > 0) {
    return {
      outcome: "LOW_CONFIDENCE",
      score: 0,
      reasons: [`unsupported_material_claims:${unsupported}`],
      confidenceBand: "LOW",
      publicPresence: presence,
    };
  }

  if (input.research.status === "FAILED") {
    return {
      outcome: "RESEARCH_FAILED",
      score: 0,
      reasons: ["research_failed"],
      confidenceBand: "UNKNOWN",
      publicPresence: presence,
    };
  }

  // Sparse public presence is allowed. Absence of online proof can itself be a finding.
  // Only block when research truly failed closed with zero usable context AND no Brand Brain path.
  if (input.research.status === "INSUFFICIENT_EVIDENCE" && input.research.sources.length === 0) {
    // Still allow a report if one was generated honestly from first-party Brand Brain context.
    reasons.push("INSUFFICIENT_PUBLIC_PRESENCE");
  } else if (presence === "INSUFFICIENT_PUBLIC_PRESENCE") {
    reasons.push("INSUFFICIENT_PUBLIC_PRESENCE");
  }

  if (!input.report) {
    return {
      outcome: "GENERATION_FAILED",
      score: 0,
      reasons: [...reasons, "report_shape_invalid"],
      confidenceBand: "UNKNOWN",
      publicPresence: presence,
    };
  }

  let total = 0;
  if (input.report.executiveSummary.length >= 180) total += 0.16;
  else reasons.push("executive_summary_too_short");

  const personalized = input.report.executiveSummary
    .toLocaleLowerCase()
    .includes(input.businessName.toLocaleLowerCase());
  if (personalized) total += 0.06;
  else reasons.push("business_personalization_missing");

  if (input.report.priorityRisks.length >= 2) total += 0.06;
  else reasons.push("too_few_priority_risks");
  if (input.report.strengths.length >= 1) total += 0.05;
  else reasons.push("too_few_strengths");
  if ((input.report.growthProblems?.length ?? 0) >= 1 || input.report.findings.length >= 2) {
    total += 0.08;
  } else reasons.push("too_few_growth_problems_or_findings");

  const sourceIds = new Set(input.research.sources.map((source) => source.id));
  const citedFindings = input.report.findings.filter(
    (finding) =>
      finding.evidenceSourceIds.length === 0
      || finding.evidenceSourceIds.every((id) => sourceIds.has(id)),
  );
  const inventedCitations = input.report.findings.some(
    (finding) => finding.evidenceSourceIds.some((id) => !sourceIds.has(id)),
  );
  if (inventedCitations) {
    total = Math.min(total, 0.79);
    reasons.push("uncited_or_unknown_finding_sources");
  } else if (citedFindings.length === input.report.findings.length) {
    total += 0.14;
  }

  // Category scores must be null (Not enough data) when evidence is missing — never invented.
  const inventedCategoryScores = Object.values(input.report.categoryScores).filter((dimension) => {
    if (dimension.score == null) return false;
    return dimension.evidenceSourceIds.length === 0
      || dimension.evidenceSourceIds.some((id) => !sourceIds.has(id));
  });
  if (inventedCategoryScores.length > 0) {
    total = Math.min(total, 0.79);
    reasons.push("category_score_without_evidence");
  } else {
    total += 0.08;
  }

  if (input.report.opportunities.length >= 1) total += 0.05;
  else reasons.push("too_few_opportunities");
  if (input.report.actionPlan.length >= 3) total += 0.06;
  else reasons.push("action_plan_too_small");
  if (input.report.quickWins30Days.length >= 1) total += 0.04;
  else reasons.push("quick_wins_missing");
  if (
    input.report.plan.days30.length > 0 &&
    input.report.plan.days60.length > 0 &&
    input.report.plan.days90.length > 0
  ) total += 0.06;
  else reasons.push("thirty_sixty_ninety_plan_incomplete");
  if (input.report.ownerActions.length >= 1) total += 0.04;
  else reasons.push("owner_actions_missing");
  if (input.report.nextActions.length >= 1) total += 0.02;
  else reasons.push("next_actions_too_small");

  if (presence === "INSUFFICIENT_PUBLIC_PRESENCE") {
    const disclosesSparse = input.report.limitations.some((item) =>
      /limited|sparse|few|no website|insufficient public|low (online|public) presence/i.test(item),
    ) || input.report.findings.some((finding) =>
      /no website|limited (online|public)|sparse|instagram only|few reviews/i.test(
        `${finding.title} ${finding.summary}`,
      ),
    );
    if (disclosesSparse) total += 0.06;
    else {
      total = Math.min(total, 0.79);
      reasons.push("sparse_presence_not_disclosed");
    }
  } else {
    total += 0.04;
  }

  const reportText = JSON.stringify(input.report);
  if (!PLACEHOLDER.test(reportText)) total += 0.02;
  else reasons.push("placeholder_language_detected");

  if ((input.research.disagreements?.length ?? 0) > 0) {
    const acknowledges = input.report.limitations.some((item) => /conflict|disagree|contradict/i.test(item));
    if (!acknowledges) {
      total = Math.min(total, 0.79);
      reasons.push("research_disagreement_not_disclosed");
    }
  }

  const reportCitationIds = new Set([
    ...input.report.findings.flatMap((finding) => finding.evidenceSourceIds),
    ...Object.values(input.report.categoryScores).flatMap((dimension) => dimension.evidenceSourceIds),
    ...input.report.opportunities.flatMap((opportunity) => opportunity.evidenceSourceIds),
  ]);
  for (const id of reportCitationIds) {
    if (!sourceIds.has(id)) {
      total = Math.min(total, 0.79);
      reasons.push("report_citation_missing_from_research_data");
      break;
    }
  }

  const rounded = Math.round(Math.max(0, Math.min(1, total)) * 10_000) / 10_000;
  return {
    outcome: rounded >= 0.8 ? "PASS" : "LOW_CONFIDENCE",
    score: rounded,
    reasons,
    confidenceBand: rounded >= 0.9 ? "HIGH" : rounded >= 0.8 ? "MEDIUM" : "LOW",
    publicPresence: presence,
  };
}
