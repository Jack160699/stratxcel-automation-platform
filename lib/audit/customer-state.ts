export type AuditOrderStatus = "pending_payment" | "paid" | "in_review" | "completed" | "refunded" | "cancelled";

export type AuditCustomerState =
  | "NOT_STARTED"
  | "PAYMENT_PENDING"
  | "INTAKE_REQUIRED"
  | "READY_FOR_EXECUTION"
  | "PROCESSING"
  | "DELIVERED"
  | "NEEDS_ATTENTION"
  | "CLOSED";

export interface AuditDeliveryReport {
  executiveSummary: string;
  strengths: string[];
  priorityRisks: string[];
  actionPlan: string[];
  reportVersion?: string;
  generatedAt?: string;
  scores?: {
    overall: number;
    digitalPresence: number;
    brandClarity: number;
    growthReadiness: number;
    conversionReadiness: number;
  };
  findings?: Array<{
    id: string;
    title: string;
    summary: string;
    impact: "HIGH" | "MEDIUM" | "LOW";
    evidenceSourceIds: string[];
    confidence: "HIGH" | "MEDIUM" | "LOW";
  }>;
  opportunities?: Array<{
    title: string;
    rationale: string;
    nextStep: string;
    evidenceSourceIds: string[];
  }>;
  plan?: { days30: string[]; days60: string[]; days90: string[] };
  nextActions?: string[];
  sources?: Array<{ id: string; url: string; title?: string; provider?: string; retrievedAt?: string }>;
  limitations?: string[];
}

export interface AuditIntakeLike {
  business_name?: unknown;
  industry?: unknown;
  website_url?: unknown;
  deep_dive_answers?: unknown;
  goals_answers?: unknown;
}

export interface AuditStateOrder extends AuditIntakeLike {
  status: AuditOrderStatus;
  report_data?: unknown;
}

const PLACEHOLDER_BUSINESS_NAME = "Pending — completed in intake";
const BRAND_BRAIN_QUESTIONNAIRE_VERSION = "brand_brain_v1";

function isPresent(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAnswer(value: unknown): boolean {
  if (isPresent(value)) return true;
  if (Array.isArray(value)) return value.some((item) => isPresent(item));
  return false;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isBrandBrainQuestionnaire(deepDive: Record<string, unknown>): boolean {
  const meta = objectValue(deepDive.intakeMeta);
  return meta.questionnaireVersion === BRAND_BRAIN_QUESTIONNAIRE_VERSION;
}

function brandBrainIntakeMissingFields(order: AuditIntakeLike, deepDive: Record<string, unknown>, goals: Record<string, unknown>): string[] {
  const required: Array<[string, unknown]> = [
    ["business_name", order.business_name],
    ["businessDescription", deepDive.businessDescription],
    ["businessReach", deepDive.businessReach],
    ["majorProducts", deepDive.majorProducts],
    ["priorityOffering", deepDive.priorityOffering],
    ["customerSegments", deepDive.customerSegments],
    ["reasonsChosen", deepDive.reasonsChosen],
    ["discoveryChannels", deepDive.discoveryChannels],
    ["purchaseChannels", deepDive.purchaseChannels],
    ["biggestProblem", deepDive.biggestProblem],
    ["primaryGoal", goals.primaryGoal],
    ["successDefinition", goals.successDefinition],
  ];

  const missing = required
    .filter(([key, value]) => !hasAnswer(value) || (key === "business_name" && value === PLACEHOLDER_BUSINESS_NAME))
    .map(([key]) => key);

  const reach = typeof deepDive.businessReach === "string" ? deepDive.businessReach : "";
  if (reach && reach !== "online_anywhere" && !hasAnswer(deepDive.location)) missing.push("location");
  return missing;
}

function legacyIntakeMissingFields(order: AuditIntakeLike, deepDive: Record<string, unknown>, goals: Record<string, unknown>): string[] {
  const required: Array<[string, unknown]> = [
    ["business_name", order.business_name],
    ["industry", order.industry],
    ["website_url", order.website_url],
    ["idealCustomers", deepDive.idealCustomers],
    ["majorProducts", deepDive.majorProducts],
    ["competitors", deepDive.competitors],
    ["leadSources", deepDive.leadSources],
    ["differentiation", deepDive.differentiation],
    ["successDefinition", goals.successDefinition],
    ["biggestObstacle", goals.biggestObstacle],
    ["topPriorities", goals.topPriorities],
  ];
  return required
    .filter(([key, value]) => !isPresent(value) || (key === "business_name" && value === PLACEHOLDER_BUSINESS_NAME))
    .map(([key]) => key);
}

export function auditIntakeMissingFields(order: AuditIntakeLike): string[] {
  const deepDive = objectValue(order.deep_dive_answers);
  const goals = objectValue(order.goals_answers);
  return isBrandBrainQuestionnaire(deepDive)
    ? brandBrainIntakeMissingFields(order, deepDive, goals)
    : legacyIntakeMissingFields(order, deepDive, goals);
}

export function isAuditIntakeComplete(order: AuditIntakeLike): boolean {
  return auditIntakeMissingFields(order).length === 0;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 1_500))
    .filter(Boolean)
    .slice(0, 12);
}

export function normalizeAuditDeliveryReport(value: unknown): AuditDeliveryReport | null {
  const report = objectValue(value);
  const executiveSummary = typeof report.executiveSummary === "string"
    ? report.executiveSummary.trim().slice(0, 8_000)
    : "";
  const priorityRisks = cleanList(report.priorityRisks);
  const actionPlan = cleanList(report.actionPlan);
  if (!executiveSummary || priorityRisks.length === 0 || actionPlan.length === 0) return null;
  const scoresValue = objectValue(report.scores);
  const numberScore = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
  };
  const findings = Array.isArray(report.findings)
    ? report.findings.flatMap((item, index) => {
        const finding = objectValue(item);
        const title = typeof finding.title === "string" ? finding.title.trim().slice(0, 240) : "";
        const summary = typeof finding.summary === "string" ? finding.summary.trim().slice(0, 2_000) : "";
        if (!title || !summary) return [];
        const impact: "HIGH" | "MEDIUM" | "LOW" =
          finding.impact === "HIGH" || finding.impact === "LOW" ? finding.impact : "MEDIUM";
        const confidence: "HIGH" | "MEDIUM" | "LOW" =
          finding.confidence === "HIGH" || finding.confidence === "LOW" ? finding.confidence : "MEDIUM";
        return [{
          id: typeof finding.id === "string" ? finding.id.slice(0, 120) : `finding_${index + 1}`,
          title,
          summary,
          impact,
          evidenceSourceIds: cleanList(finding.evidenceSourceIds),
          confidence,
        }];
      })
    : [];
  const opportunities = Array.isArray(report.opportunities)
    ? report.opportunities.flatMap((item) => {
        const opportunity = objectValue(item);
        const title = typeof opportunity.title === "string" ? opportunity.title.trim().slice(0, 240) : "";
        const rationale = typeof opportunity.rationale === "string" ? opportunity.rationale.trim().slice(0, 2_000) : "";
        const nextStep = typeof opportunity.nextStep === "string" ? opportunity.nextStep.trim().slice(0, 1_000) : "";
        if (!title || !rationale || !nextStep) return [];
        return [{ title, rationale, nextStep, evidenceSourceIds: cleanList(opportunity.evidenceSourceIds) }];
      })
    : [];
  const planValue = objectValue(report.plan);
  const sources = Array.isArray(report.sources)
    ? report.sources.flatMap((item) => {
        const source = objectValue(item);
        const id = typeof source.id === "string" ? source.id.slice(0, 160) : "";
        const url = typeof source.url === "string" ? source.url.trim().slice(0, 2_048) : "";
        if (!id || !/^https?:\/\//i.test(url)) return [];
        return [{
          id,
          url,
          title: typeof source.title === "string" ? source.title.trim().slice(0, 500) : undefined,
          provider: typeof source.provider === "string" ? source.provider.slice(0, 60) : undefined,
          retrievedAt: typeof source.retrievedAt === "string" ? source.retrievedAt : undefined,
        }];
      })
    : [];

  return {
    executiveSummary,
    strengths: cleanList(report.strengths),
    priorityRisks,
    actionPlan,
    reportVersion: typeof report.reportVersion === "string" ? report.reportVersion.slice(0, 80) : undefined,
    generatedAt: typeof report.generatedAt === "string" ? report.generatedAt : undefined,
    scores: Object.keys(scoresValue).length > 0 ? {
      overall: numberScore(scoresValue.overall),
      digitalPresence: numberScore(scoresValue.digitalPresence),
      brandClarity: numberScore(scoresValue.brandClarity),
      growthReadiness: numberScore(scoresValue.growthReadiness),
      conversionReadiness: numberScore(scoresValue.conversionReadiness),
    } : undefined,
    findings: findings.length ? findings : undefined,
    opportunities: opportunities.length ? opportunities : undefined,
    plan: Object.keys(planValue).length > 0 ? {
      days30: cleanList(planValue.days30),
      days60: cleanList(planValue.days60),
      days90: cleanList(planValue.days90),
    } : undefined,
    nextActions: cleanList(report.nextActions),
    sources: sources.length ? sources : undefined,
    limitations: cleanList(report.limitations),
  };
}

export function hasValidAuditReport(value: unknown): boolean {
  return normalizeAuditDeliveryReport(value) !== null;
}

export function deriveAuditCustomerState(order: AuditStateOrder | null): AuditCustomerState {
  if (!order) return "NOT_STARTED";
  if (order.status === "pending_payment") return "PAYMENT_PENDING";
  if (order.status === "refunded" || order.status === "cancelled") return "CLOSED";
  if (order.status === "paid") return isAuditIntakeComplete(order) ? "READY_FOR_EXECUTION" : "INTAKE_REQUIRED";
  if (order.status === "in_review") return "PROCESSING";
  return hasValidAuditReport(order.report_data) ? "DELIVERED" : "NEEDS_ATTENTION";
}
