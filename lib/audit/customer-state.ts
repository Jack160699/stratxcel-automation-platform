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
  return {
    executiveSummary,
    strengths: cleanList(report.strengths),
    priorityRisks,
    actionPlan,
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
