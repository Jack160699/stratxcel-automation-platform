import { buildGrowthRecommendations } from "../../planning/recommendations.ts";
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
    return { id: `sw_${i + 1}`, objective: businessObjective, tactic: rec?.recommendedServiceOrCapability ?? bn.description, department: routeInfo.department, specialistRole: routeInfo.role, executionClass: input.entryMode === "AUDIT_ONLY" || rec?.currentAvailability === "NOT_PURCHASED" ? "RECOMMENDED_FUTURE_WORK" : "PURCHASED_EXECUTION", bottleneckIds: [bn.id], evidenceIds: [...bn.evidenceIds], measurementItems: measurementPlan };
  });
  return { id: `strategy_${input.missionId}`, tenantId: input.tenantId, missionId: input.missionId, businessObjective, strategicThesis: input.diagnosis.foundationStatus === "MISSING_FOUNDATION" ? "Foundation-first before social volume." : "Root-cause before symptom channels.", workItems, measurementPlan, reviewerRoles: REVIEWERS, generatedAtIso: input.currentDateIso };
}

export function assertObjectiveDistinctFromTactics(artifact: GrowthStrategyArtifact): void {
  for (const item of artifact.workItems) if (item.objective.trim().toLowerCase() === item.tactic.trim().toLowerCase()) throw new Error(`strategy_objective_equals_tactic:${item.id}`);
}

export function assertResponseBottlenecksNotRoutedToSocial(artifact: GrowthStrategyArtifact): void {
  for (const item of artifact.workItems) {
    if (item.department !== "social") continue;
    const text = `${item.objective} ${item.tactic}`.toLowerCase();
    if (/slow.?response|follow.?up|lead response|qualification|whatsapp|crm/.test(text)) {
      throw new Error("response_bottleneck_routed_to_social");
    }
  }
}
