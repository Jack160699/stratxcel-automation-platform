import type {
  AuditQualityOutcome,
  AuditReportFinding,
  AuditReportV1,
} from "./types.ts";
import type { ResearchResult } from "@stratxcel/search-discovery";

const PLACEHOLDER = /\b(lorem ipsum|insert here|tbd|placeholder|generic business|your company)\b/i;

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

function score(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
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
  const rawPlan =
    value.plan && typeof value.plan === "object" && !Array.isArray(value.plan)
      ? value.plan as Record<string, unknown>
      : {};
  const sourceIds = new Set(args.research.sources.map((source) => source.id));

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

  return {
    reportVersion: "automatic_audit_v1",
    generatedAt: args.generatedAt,
    businessName: args.businessName,
    executiveSummary,
    scores: {
      overall: score(rawScores.overall),
      digitalPresence: score(rawScores.digitalPresence),
      brandClarity: score(rawScores.brandClarity),
      growthReadiness: score(rawScores.growthReadiness),
      conversionReadiness: score(rawScores.conversionReadiness),
    },
    strengths: textList(value.strengths, 12),
    priorityRisks,
    findings,
    opportunities,
    actionPlan,
    plan: {
      days30: textList(rawPlan.days30, 12),
      days60: textList(rawPlan.days60, 12),
      days90: textList(rawPlan.days90, 12),
    },
    nextActions: textList(value.nextActions, 12),
    sources: args.research.sources.map((source) => ({
      id: source.id,
      url: source.url,
      title: source.title,
      provider: source.provider,
      retrievedAt: source.retrievedAt,
    })),
    limitations: textList(value.limitations, 12),
    generation: {
      method: "automatic_audit_v1",
      brandBrainVersion: args.brandBrainVersion,
    },
  };
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
} {
  const reasons: string[] = [];
  if (
    input.research.status !== "PASS" ||
    input.research.sources.length < 3 ||
    new Set(input.research.sources.map((source) => source.domain)).size < 2
  ) {
    return {
      outcome: "INSUFFICIENT_EVIDENCE",
      score: 0,
      reasons: ["minimum_grounded_evidence_not_met"],
      confidenceBand: "UNKNOWN",
    };
  }
  if (!input.report) {
    return {
      outcome: "GENERATION_FAILED",
      score: 0,
      reasons: ["report_shape_invalid"],
      confidenceBand: "UNKNOWN",
    };
  }

  let total = 0;
  if (input.report.executiveSummary.length >= 180) total += 0.18;
  else reasons.push("executive_summary_too_short");

  const personalized = input.report.executiveSummary
    .toLocaleLowerCase()
    .includes(input.businessName.toLocaleLowerCase());
  if (personalized) total += 0.08;
  else reasons.push("business_personalization_missing");

  if (input.report.priorityRisks.length >= 2) total += 0.08;
  else reasons.push("too_few_priority_risks");
  if (input.report.strengths.length >= 2) total += 0.06;
  else reasons.push("too_few_strengths");
  if (input.report.findings.length >= 3) total += 0.14;
  else reasons.push("too_few_findings");

  const sourceIds = new Set(input.research.sources.map((source) => source.id));
  const citedFindings = input.report.findings.filter(
    (finding) =>
      finding.evidenceSourceIds.length > 0 &&
      finding.evidenceSourceIds.every((id) => sourceIds.has(id)),
  );
  if (citedFindings.length === input.report.findings.length && citedFindings.length > 0) total += 0.18;
  else {
    total = Math.min(total, 0.79);
    reasons.push("uncited_or_unknown_finding_sources");
  }

  if (input.report.opportunities.length >= 2) total += 0.06;
  else reasons.push("too_few_opportunities");
  if (input.report.actionPlan.length >= 3) total += 0.08;
  else reasons.push("action_plan_too_small");
  if (
    input.report.plan.days30.length > 0 &&
    input.report.plan.days60.length > 0 &&
    input.report.plan.days90.length > 0
  ) total += 0.08;
  else reasons.push("thirty_sixty_ninety_plan_incomplete");
  if (input.report.nextActions.length >= 2) total += 0.04;
  else reasons.push("next_actions_too_small");

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

  if (reasons.includes("uncited_or_unknown_finding_sources")) {
    total = Math.min(total, 0.79);
  }
  const rounded = Math.round(Math.max(0, Math.min(1, total)) * 10_000) / 10_000;
  return {
    outcome: rounded >= 0.8 ? "PASS" : "LOW_CONFIDENCE",
    score: rounded,
    reasons,
    confidenceBand: rounded >= 0.9 ? "HIGH" : rounded >= 0.8 ? "MEDIUM" : "LOW",
  };
}
