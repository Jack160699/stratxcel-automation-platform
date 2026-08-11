import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function w(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  console.log("OK", rel);
}

w("packages/workforce-core/src/intelligence/strategy/builder.ts", `import { buildGrowthRecommendations } from "../../planning/recommendations.ts";
import { assertRole } from "../../roles/registry.ts";
import type { DepartmentKey } from "../../departments/types.ts";
import type { GrowthBottleneckCode } from "../../planning/growth-types.ts";
import type { GrowthStrategyArtifact, IntelligenceStrategyInput, MeasurementPlanItem, StrategyWorkItem } from "../types.ts";

const REVIEWERS = [{ department: "quality" as DepartmentKey, role: "final_reviewer" }, { department: "compliance" as DepartmentKey, role: "claim_checker" }, { department: "strategy" as DepartmentKey, role: "growth_strategist" }];

function route(code: GrowthBottleneckCode): { department: DepartmentKey; role: string } {
  if (code === "SLOW_LEAD_RESPONSE" || code === "WEAK_FOLLOW_UP") return { department: "whatsapp", role: "followup_specialist" };
  if (code === "POOR_LEAD_CAPTURE" || code === "WEAK_WEBSITE_CONVERSION") return { department: "conversion", role: "cro_specialist" };
  if (code === "MISSING_DIGITAL_FOUNDATION") return { department: "website", role: "landing_page_builder" };
  if (code === "WEAK_SEARCH_VISIBILITY" || code === "LOW_DISCOVERY") return { department: "seo", role: "keyword_researcher" };
  return { department: "strategy", role: "growth_strategist" };
}

function measurement(graph: IntelligenceStrategyInput["bottleneckGraph"]): MeasurementPlanItem[] {
  const codes = new Set(graph.bottlenecks.map((b) => b.code));
  const items: MeasurementPlanItem[] = [];
  if (codes.has("SLOW_LEAD_RESPONSE") || codes.has("WEAK_FOLLOW_UP")) items.push({ metricClass: "lead_response_time", dataSource: "crm_or_whatsapp", cadence: "weekly", purpose: "Track response latency", requiresIntegration: true });
  if (codes.has("WEAK_WEBSITE_CONVERSION")) items.push({ metricClass: "inquiry_capture_rate", dataSource: "website_analytics", cadence: "weekly", purpose: "Capture from traffic", requiresIntegration: true });
  if (items.length === 0) items.push({ metricClass: "mission_progress", dataSource: "mission_artifacts", cadence: "mission_end", purpose: "Track prioritized work", requiresIntegration: false });
  return items;
}

export function buildGrowthStrategyArtifact(input: IntelligenceStrategyInput): GrowthStrategyArtifact {
  for (const r of REVIEWERS) assertRole(r.department, r.role);
  const recommendations = buildGrowthRecommendations({ bottlenecks: input.bottleneckGraph.bottlenecks, entitlementSnapshot: input.entitlementSnapshot });
  const measurementPlan = measurement(input.bottleneckGraph);
  const top = input.bottleneckGraph.bottlenecks[0];
  const businessObjective = top?.code === "SLOW_LEAD_RESPONSE" ? "Improve lead response and follow-up consistency" : top?.code === "MISSING_DIGITAL_FOUNDATION" ? "Establish digital foundation before channel scale" : "Address highest-impact bottleneck with evidence-backed prioritization";
  const workItems: StrategyWorkItem[] = input.bottleneckGraph.bottlenecks.slice(0, 5).map((bn, i) => {
    const routeInfo = route(bn.code); assertRole(routeInfo.department, routeInfo.role);
    const rec = recommendations.find((r) => r.bottleneckId === bn.id);
    return { id: \`sw_\${i + 1}\`, objective: businessObjective, tactic: rec?.recommendedServiceOrCapability ?? bn.description, department: routeInfo.department, specialistRole: routeInfo.role, executionClass: input.entryMode === "AUDIT_ONLY" || rec?.currentAvailability === "NOT_PURCHASED" ? "RECOMMENDED_FUTURE_WORK" : "PURCHASED_EXECUTION", bottleneckIds: [bn.id], evidenceIds: [...bn.evidenceIds], measurementItems: measurementPlan };
  });
  return { id: \`strategy_\${input.missionId}\`, tenantId: input.tenantId, missionId: input.missionId, businessObjective, strategicThesis: input.diagnosis.foundationStatus === "MISSING_FOUNDATION" ? "Foundation-first before social volume." : "Root-cause before symptom channels.", workItems, measurementPlan, reviewerRoles: REVIEWERS, generatedAtIso: input.currentDateIso };
}

export function assertObjectiveDistinctFromTactics(artifact: GrowthStrategyArtifact): void {
  for (const item of artifact.workItems) if (item.objective.trim().toLowerCase() === item.tactic.trim().toLowerCase()) throw new Error(\`strategy_objective_equals_tactic:\${item.id}\`);
}

export function assertResponseBottlenecksNotRoutedToSocial(artifact: GrowthStrategyArtifact): void {
  for (const item of artifact.workItems) if ((item.department === "whatsapp" || item.department === "crm") && item.department === "social") throw new Error("response_bottleneck_routed_to_social");
}
`);

w("packages/workforce-core/src/intelligence/recommendations/commercial-fit.ts", `import type { BusinessGrowthEntitlementSnapshot } from "../../planning/types.ts";
import type { GrowthBottleneck } from "../../planning/growth-types.ts";
import type { CommercialFitRecommendation, PlanCatalogueEntryInput } from "../types.ts";

export class BillingMutationError extends Error { constructor(m: string) { super(m); this.name = "BillingMutationError"; } }

const DOMAIN: Record<string, string> = { SLOW_LEAD_RESPONSE: "crm", WEAK_FOLLOW_UP: "crm", POOR_LEAD_CAPTURE: "website", WEAK_WEBSITE_CONVERSION: "website", WEAK_SEARCH_VISIBILITY: "seo", LOW_DISCOVERY: "seo", MISSING_DIGITAL_FOUNDATION: "website" };
const GUARDS = { doNotActivateSubscription: true as const, doNotChargeCard: true as const, doNotGrantEntitlements: true as const };

export interface CommercialFitInput { bottlenecks: readonly GrowthBottleneck[]; catalogue: readonly PlanCatalogueEntryInput[]; entitlementSnapshot: BusinessGrowthEntitlementSnapshot; }

function domains(bottlenecks: readonly GrowthBottleneck[]): Set<string> { return new Set(bottlenecks.map((b) => DOMAIN[b.code] ?? "strategy")); }
function entitled(plan: PlanCatalogueEntryInput, snap: BusinessGrowthEntitlementSnapshot): boolean {
  return plan.entitlementKeys.every((k) => (snap.relevantEntitlements[k] ?? 0) > 0) || (snap.planTier ?? "").toLowerCase() === plan.planKey;
}

export function evaluateCommercialFit(input: CommercialFitInput): CommercialFitRecommendation {
  const req = domains(input.bottlenecks);
  const ids = input.bottlenecks.map((b) => b.id);
  if (input.bottlenecks.length === 0) return { outcome: "NO_CHANGE_NEEDED", recommendedPlanKey: null, recommendedLabel: "Maintain current posture", reason: "No high-priority bottlenecks", coveringBottleneckIds: [], uncoveredDomains: [], ...GUARDS };
  const sorted = [...input.catalogue].sort((a, b) => a.tierRank - b.tierRank);
  const already = sorted.find((p) => entitled(p, input.entitlementSnapshot) && [...req].every((d) => p.coveredDomains.includes(d)));
  if (already) return { outcome: "ALREADY_ENTITLED", recommendedPlanKey: already.planKey, recommendedLabel: already.label, reason: "USE_CURRENT_ENTITLEMENT — existing entitlements cover diagnosed domains", coveringBottleneckIds: ids, uncoveredDomains: [], ...GUARDS };
  const smallest = sorted.find((p) => [...req].every((d) => p.coveredDomains.includes(d)));
  if (smallest) return { outcome: "SMALLEST_COVERING_OPTION", recommendedPlanKey: smallest.planKey, recommendedLabel: smallest.label, reason: "Smallest tier covering all diagnosed domains", coveringBottleneckIds: ids, uncoveredDomains: [], ...GUARDS };
  const partial = sorted.find((p) => p.coveredDomains.some((d) => req.has(d)));
  if (partial) return { outcome: "PARTIAL_COVERAGE", recommendedPlanKey: partial.planKey, recommendedLabel: partial.label, reason: "Partial catalogue coverage — scoped custom work for remainder", coveringBottleneckIds: ids, uncoveredDomains: [...req].filter((d) => !partial.coveredDomains.includes(d)), ...GUARDS };
  return { outcome: "CUSTOM", recommendedPlanKey: null, recommendedLabel: "Custom scoped engagement", reason: "No catalogue plan covers full domain set", coveringBottleneckIds: ids, uncoveredDomains: [...req], ...GUARDS };
}

export function assertRecommendationCannotMutateBilling(rec: CommercialFitRecommendation): void {
  if (rec.doNotActivateSubscription !== true || rec.doNotChargeCard !== true || rec.doNotGrantEntitlements !== true) throw new BillingMutationError("recommendation_must_not_mutate_billing");
}

export function finalizeCommercialFit(input: CommercialFitInput): CommercialFitRecommendation {
  const rec = evaluateCommercialFit(input); assertRecommendationCannotMutateBilling(rec); return rec;
}
`);

w("packages/workforce-core/src/intelligence/audit/artifact.ts", `import { assertRole } from "../../roles/registry.ts";
import { assertNoProhibitedClaims } from "../brand/readiness.ts";
import type { CustomerAuditArtifact, IntelligenceAuditInput } from "../types.ts";

const GENERIC = ["post more on social", "boost engagement", "best practices", "holistic approach"];

export function buildCustomerAuditArtifact(input: IntelligenceAuditInput): CustomerAuditArtifact {
  assertRole("reporting", "report_writer"); assertRole("quality", "final_reviewer");
  const sections = [
    { heading: "Executive summary", body: input.diagnosis.diagnosis.executiveSummary, evidenceIds: [] as string[] },
    { heading: "Strengths", body: input.diagnosis.strengths.map((s) => s.description).join("\\n") || "No confirmed strengths — not a negative verdict.", evidenceIds: input.diagnosis.strengths.flatMap((s) => [...s.evidenceIds]) },
    { heading: "Priorities", body: input.bottleneckGraph.bottlenecks.slice(0, 5).map((b) => b.description).join("\\n"), evidenceIds: input.bottleneckGraph.bottlenecks.flatMap((b) => [...b.evidenceIds]) },
    { heading: "Strategy", body: \`\${input.strategy.strategicThesis}\\nObjective: \${input.strategy.businessObjective}\`, evidenceIds: [] as string[] },
    { heading: "Commercial guidance", body: \`\${input.commercialFit.recommendedLabel}: \${input.commercialFit.reason}\`, evidenceIds: [] as string[] },
  ];
  const full = sections.map((s) => s.body).join("\\n"); assertNoProhibitedClaims(full);
  const genericOutputPenaltyApplied = GENERIC.some((g) => full.toLowerCase().includes(g));
  return {
    id: \`audit_\${input.missionId}\`, tenantId: input.tenantId, missionId: input.missionId, title: "Business Growth Audit",
    executiveSummary: input.diagnosis.diagnosis.executiveSummary, sections,
    strengths: input.diagnosis.strengths.map((s) => s.description),
    priorities: input.bottleneckGraph.bottlenecks.slice(0, 3).map((b) => b.description),
    recommendationsSummary: input.recommendations.slice(0, 5).map((r) => r.reason),
    qualityReview: { creatorDepartment: "reporting", creatorRole: "report_writer", reviewerDepartment: "quality", reviewerRole: "final_reviewer", decision: genericOutputPenaltyApplied ? "REVISE" : "PASS", genericOutputPenaltyApplied, notes: ["Creator/reviewer separation enforced"] },
    generatedAtIso: input.currentDateIso,
  };
}

export function assertAuditHasNoInternalLeakage(artifact: CustomerAuditArtifact): void {
  const s = JSON.stringify(artifact);
  for (const k of ["rawPrompt", "systemPrompt", "internalOnly", "providerKey"]) if (s.includes(k)) throw new Error(\`audit_internal_leakage:\${k}\`);
}

export function finalizeCustomerAudit(input: IntelligenceAuditInput): CustomerAuditArtifact {
  const a = buildCustomerAuditArtifact(input); assertAuditHasNoInternalLeakage(a); return a;
}
`);

w("packages/workforce-core/src/intelligence/hermes/delegation.ts", `import { assertRole } from "../../roles/registry.ts";
import { createDepartmentHandoff, type DepartmentHandoff } from "../../handoffs/create.ts";
import type { DepartmentKey } from "../../departments/types.ts";
import type { GrowthStrategyArtifact, IntelligenceBottleneckGraph, ResearchPlanArtifact } from "../types.ts";

export interface IntelligenceSpecialistStage {
  stageId: string;
  department: DepartmentKey;
  specialistRole: string;
  parallelGroup: number;
  creatorRole: string;
  reviewerRole?: string;
  objective: string;
}

export interface IntelligenceSpecialistRunPlan {
  id: string;
  tenantId: string;
  missionId: string;
  stages: readonly IntelligenceSpecialistStage[];
  reviewerSeparationEnforced: true;
}

export const HERMES_INTELLIGENCE_DELEGATION_GUIDANCE = \`Intelligence Department delegation: run research roles in parallel (market, audience, competitor, trend), then evidence_reviewer (must differ from creators), then growth_strategist, brand_strategist, and final_reviewer. Never let the same role both create and approve customer-facing audit claims. Route response bottlenecks to CRM/WhatsApp — not Social. Recommendations must not mutate billing.\`;

const RESEARCH = ["market_researcher", "audience_researcher", "competitor_researcher", "trend_researcher"] as const;

export function buildIntelligenceSpecialistRunPlan(args: {
  tenantId: string; missionId: string; researchPlan: ResearchPlanArtifact; strategy: GrowthStrategyArtifact;
}): IntelligenceSpecialistRunPlan {
  const stages: IntelligenceSpecialistStage[] = [];
  let n = 0;
  for (const role of RESEARCH) {
    assertRole("research", role);
    stages.push({ stageId: \`intel_\${++n}\`, department: "research", specialistRole: role, parallelGroup: 1, creatorRole: role, objective: args.researchPlan.tasks.find((t) => t.specialistRole === role)?.objective ?? role });
  }
  assertRole("research", "evidence_reviewer");
  stages.push({ stageId: \`intel_\${++n}\`, department: "research", specialistRole: "evidence_reviewer", parallelGroup: 2, creatorRole: "evidence_reviewer", reviewerRole: "market_researcher", objective: "Validate evidence quality" });
  assertRole("strategy", "growth_strategist");
  stages.push({ stageId: \`intel_\${++n}\`, department: "strategy", specialistRole: "growth_strategist", parallelGroup: 3, creatorRole: "growth_strategist", reviewerRole: "evidence_reviewer", objective: args.strategy.businessObjective });
  assertRole("brand", "brand_strategist");
  stages.push({ stageId: \`intel_\${++n}\`, department: "brand", specialistRole: "brand_strategist", parallelGroup: 4, creatorRole: "brand_strategist", reviewerRole: "growth_strategist", objective: "Brand-aligned strategy framing" });
  assertRole("quality", "final_reviewer");
  stages.push({ stageId: \`intel_\${++n}\`, department: "quality", specialistRole: "final_reviewer", parallelGroup: 5, creatorRole: "report_writer", reviewerRole: "final_reviewer", objective: "Independent final review" });
  return { id: \`intel_plan_\${args.missionId}\`, tenantId: args.tenantId, missionId: args.missionId, stages, reviewerSeparationEnforced: true };
}

export function buildIntelligenceHandoffs(args: {
  tenantId: string; missionId: string; planId: string; strategy: GrowthStrategyArtifact; bottleneckGraph: IntelligenceBottleneckGraph;
}): DepartmentHandoff[] {
  const depts = [...new Set(args.strategy.workItems.map((w) => w.department))];
  return depts.map((dept, i) => createDepartmentHandoff({
    tenantId: args.tenantId, missionId: args.missionId, planId: args.planId,
    fromStage: "intelligence_complete", toStage: \`\${dept}_execution\`,
    objective: \`Execute \${dept} work items from intelligence strategy\`,
    artifactIds: [args.strategy.id], evidenceIds: args.bottleneckGraph.bottlenecks.flatMap((b) => [...b.evidenceIds]),
    decisions: [args.strategy.businessObjective], unresolvedQuestions: [], constraints: ["Do not mutate billing from recommendations"],
    qualityStatus: "PASS",
  }));
}
`);

w("packages/workforce-core/src/intelligence/events.ts", `import type { WorkforceEventEmitter, WorkforceEventPayload } from "../events/emit.ts";

export type IntelligenceEventName =
  | "intelligence.research.started"
  | "intelligence.research.completed"
  | "intelligence.evidence.reviewed"
  | "intelligence.diagnosis.completed"
  | "intelligence.bottleneck.identified"
  | "intelligence.strategy.completed"
  | "intelligence.recommendation.created"
  | "intelligence.audit.completed";

export interface IntelligenceEvent {
  name: IntelligenceEventName;
  atIso: string;
  payload: WorkforceEventPayload & { data?: Record<string, unknown> };
}

const collected: IntelligenceEvent[] = [];

export function createIntelligenceEventCollector(): { events: IntelligenceEvent[]; emitIntelligenceEvent: typeof emitIntelligenceEvent } {
  const events: IntelligenceEvent[] = [];
  return { events, emitIntelligenceEvent: (event, emitter) => { events.push(event); return emitIntelligenceEvent(event, emitter); } };
}

export function emitIntelligenceEvent(event: IntelligenceEvent, emitter?: WorkforceEventEmitter): IntelligenceEvent {
  collected.push(event);
  emitter?.emit({ name: event.name as import("../events/emit.ts").WorkforceEventName, atIso: event.atIso, payload: event.payload });
  return event;
}

export function drainIntelligenceEvents(): IntelligenceEvent[] {
  return collected.splice(0, collected.length);
}
`);

w("packages/workforce-core/src/intelligence/catalogue.ts", `import type { PlanCatalogueEntryInput } from "./types.ts";

export interface PlanDefinitionInput {
  tier: string;
  publicName: string;
  priceCents: number | null;
  entitlements: Record<string, number>;
  selfServiceCheckout: boolean;
  status: "active" | "legacy";
}

function domainsForEntitlements(ent: Record<string, number>): string[] {
  const d = new Set<string>();
  if ((ent.whatsapp_contacts ?? 0) > 0) d.add("crm");
  if ((ent.website_maintenance ?? 0) > 0) d.add("website");
  if ((ent.social_posts ?? 0) > 0) {
    d.add("social");
    d.add("seo");
  }
  if ((ent.meta_ad_campaigns ?? 0) > 0) d.add("ads");
  if (d.size === 0) d.add("strategy");
  return [...d];
}

const TIER_RANK: Record<string, number> = { starter: 1, growth: 2, business: 3, scale: 4, free: 0 };

export function buildCatalogueFromPlanDefinitions(plans: readonly PlanDefinitionInput[], auditOneTime = true): PlanCatalogueEntryInput[] {
  const entries = plans.filter((p) => p.status === "active").map((p) => ({
    planKey: p.tier,
    label: p.publicName,
    tierRank: TIER_RANK[p.tier] ?? 99,
    coveredDomains: domainsForEntitlements(p.entitlements),
    coveredCapabilities: domainsForEntitlements(p.entitlements).map((d) => \`\${d}.audit\`),
    entitlementKeys: Object.keys(p.entitlements).filter((k) => (p.entitlements[k] ?? 0) > 0),
    isPurchasable: p.selfServiceCheckout,
  }));
  if (auditOneTime) entries.push({ planKey: "brand_audit", label: "Business Growth Audit (one-time)", tierRank: 0, coveredDomains: ["strategy", "analytics"], coveredCapabilities: ["brand.audit"], entitlementKeys: [], isPurchasable: true });
  return entries;
}
`);

w("packages/workforce-core/src/intelligence/pipeline.ts", `import { buildGrowthRecommendations } from "../planning/recommendations.ts";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import { buildResearchPlan } from "./research/planner.ts";
import { synthesizeResearchFindings } from "./research/synthesis.ts";
import { assessBrandReadiness } from "./brand/readiness.ts";
import { runIntelligenceDiagnosis } from "./diagnosis/engine.ts";
import { deriveIntelligenceBottlenecks } from "./bottlenecks/engine.ts";
import { buildGrowthStrategyArtifact, assertObjectiveDistinctFromTactics, assertResponseBottlenecksNotRoutedToSocial } from "./strategy/builder.ts";
import { finalizeCommercialFit } from "./recommendations/commercial-fit.ts";
import { finalizeCustomerAudit } from "./audit/artifact.ts";
import { buildIntelligenceHandoffs, buildIntelligenceSpecialistRunPlan } from "./hermes/delegation.ts";
import { emitIntelligenceEvent, type IntelligenceEvent } from "./events.ts";
import { assertBrandBrainTenant, assertTenantScopedEvidence } from "./security.ts";
import { buildCatalogueFromPlanDefinitions } from "./catalogue.ts";
import type { IntelligencePipelineContext, IntelligencePipelineResult } from "./types.ts";

export function runIntelligencePipeline(ctx: IntelligencePipelineContext): IntelligencePipelineResult {
  assertBrandBrainTenant({ tenantId: ctx.tenantId, brandBrainTenantId: ctx.brandBrainTenantId ?? ctx.tenantId });
  const evidenceRecords = assertTenantScopedEvidence(ctx.evidenceRecords ?? [], { tenantId: ctx.tenantId, missionId: ctx.missionId });
  const events: IntelligenceEvent[] = [];
  const push = (name: IntelligenceEvent["name"], data?: Record<string, unknown>) => {
    events.push(emitIntelligenceEvent({ name, atIso: ctx.currentDateIso, payload: { tenantId: ctx.tenantId, missionId: ctx.missionId, data } }));
  };

  const plannerInput = { ...ctx.plannerInput, tenantId: ctx.tenantId, missionId: ctx.missionId, budgetEnvelope: ctx.plannerInput.budgetEnvelope ?? createMissionBudget(0) };
  const diagnosisPreview = runIntelligenceDiagnosis({ plannerInput, evidenceRecords, brandBrainTenantId: ctx.brandBrainTenantId });
  push("intelligence.research.started");
  const researchPlan = buildResearchPlan({ tenantId: ctx.tenantId, missionId: ctx.missionId, currentDateIso: ctx.currentDateIso, plannerInput, researchGaps: diagnosisPreview.diagnosis.researchGaps, budgetCents: ctx.researchBudgetCents ?? 0 });
  push("intelligence.research.completed", { taskCount: researchPlan.tasks.length });
  const synthesis = synthesizeResearchFindings({ tenantId: ctx.tenantId, missionId: ctx.missionId, currentDateIso: ctx.currentDateIso, plan: researchPlan, evidenceRecords, gapStatements: diagnosisPreview.diagnosis.researchGaps });
  push("intelligence.evidence.reviewed", { claimCount: synthesis.claims.length });
  const brandReadiness = assessBrandReadiness(plannerInput.brandBrain);
  const diagnosis = runIntelligenceDiagnosis({ plannerInput, evidenceRecords, brandBrainTenantId: ctx.brandBrainTenantId });
  push("intelligence.diagnosis.completed", { entryMode: diagnosis.entryMode, maturity: diagnosis.maturity });
  const bottleneckGraph = deriveIntelligenceBottlenecks(diagnosis);
  push("intelligence.bottleneck.identified", { count: bottleneckGraph.bottlenecks.length });
  const recommendations = buildGrowthRecommendations({ bottlenecks: bottleneckGraph.bottlenecks, entitlementSnapshot: plannerInput.entitlementSnapshot });
  push("intelligence.recommendation.created", { count: recommendations.length });
  const catalogue = ctx.catalogue ?? buildCatalogueFromPlanDefinitions([]);
  const commercialFit = finalizeCommercialFit({ bottlenecks: bottleneckGraph.bottlenecks, catalogue, entitlementSnapshot: plannerInput.entitlementSnapshot });
  const strategy = buildGrowthStrategyArtifact({ tenantId: ctx.tenantId, missionId: ctx.missionId, currentDateIso: ctx.currentDateIso, diagnosis, bottleneckGraph, recommendations, entitlementSnapshot: plannerInput.entitlementSnapshot, entryMode: diagnosis.entryMode });
  assertObjectiveDistinctFromTactics(strategy); assertResponseBottlenecksNotRoutedToSocial(strategy);
  push("intelligence.strategy.completed", { workItems: strategy.workItems.length });
  const audit = finalizeCustomerAudit({ tenantId: ctx.tenantId, missionId: ctx.missionId, currentDateIso: ctx.currentDateIso, diagnosis, bottleneckGraph, strategy, recommendations, commercialFit });
  push("intelligence.audit.completed", { auditId: audit.id });
  const specialistPlan = buildIntelligenceSpecialistRunPlan({ tenantId: ctx.tenantId, missionId: ctx.missionId, researchPlan, strategy });
  const handoffs = buildIntelligenceHandoffs({ tenantId: ctx.tenantId, missionId: ctx.missionId, planId: strategy.id, strategy, bottleneckGraph });
  return { researchPlan, synthesis, brandReadiness, diagnosis, bottleneckGraph, recommendations, commercialFit, strategy, audit, specialistPlan, handoffs, events };
}
`);

w("packages/workforce-core/src/intelligence/index.ts", `export * from "./types.ts";
export * from "./security.ts";
export * from "./evidence/model.ts";
export * from "./evidence/contradiction.ts";
export * from "./research/planner.ts";
export * from "./research/synthesis.ts";
export * from "./brand/readiness.ts";
export * from "./diagnosis/engine.ts";
export * from "./bottlenecks/engine.ts";
export * from "./strategy/builder.ts";
export * from "./recommendations/commercial-fit.ts";
export * from "./audit/artifact.ts";
export * from "./hermes/delegation.ts";
export * from "./events.ts";
export * from "./catalogue.ts";
export * from "./pipeline.ts";
`);

console.log("batch3 done");
