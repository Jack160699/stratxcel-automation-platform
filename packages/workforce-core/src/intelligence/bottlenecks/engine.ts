import { deriveBottlenecks } from "../../planning/diagnosis.ts";
import type { GrowthBottleneck, GrowthBottleneckCode } from "../../planning/growth-types.ts";
import type { IntelligenceBottleneck, IntelligenceBottleneckGraph, IntelligenceDiagnosisResult } from "../types.ts";

const ROOT = new Set<GrowthBottleneckCode>(["MISSING_DIGITAL_FOUNDATION", "POOR_LEAD_CAPTURE", "WEAK_SEARCH_VISIBILITY"]);
const SYM = new Set<GrowthBottleneckCode>(["LOW_DISCOVERY", "LOW_CLOSE_RATE", "INSUFFICIENT_DEMAND"]);
const WEIGHT: Partial<Record<GrowthBottleneckCode, number>> = { SLOW_LEAD_RESPONSE: 100, WEAK_FOLLOW_UP: 95, POOR_LEAD_CAPTURE: 90, MISSING_DIGITAL_FOUNDATION: 88, LOW_DISCOVERY: 45 };

export function scoreBottleneckPriority(bn: GrowthBottleneck): number {
  const base = WEIGHT[bn.code] ?? bn.priorityScore;
  return base + (bn.severity === "critical" ? 12 : bn.severity === "high" ? 8 : 0) + (bn.evidenceIds.length ? 4 : -8);
}

function enrich(bn: GrowthBottleneck): IntelligenceBottleneck {
  const score = scoreBottleneckPriority(bn);
  return { ...bn, priorityScore: score, customerNeedScore: score, nodeKind: ROOT.has(bn.code) ? "root_cause" : SYM.has(bn.code) ? "symptom" : "contributing_factor", causalRole: ROOT.has(bn.code) ? "root" : SYM.has(bn.code) ? "symptom" : "neutral" };
}

export function deriveIntelligenceBottlenecks(diagnosis: IntelligenceDiagnosisResult): IntelligenceBottleneckGraph {
  const bottlenecks = deriveBottlenecks(diagnosis.diagnosis).map(enrich).sort((a, b) => b.customerNeedScore - a.customerNeedScore);
  const byCode = new Map(bottlenecks.map((b) => [b.code, b]));
  const link = (from: GrowthBottleneckCode, to: GrowthBottleneckCode, kind: "LIKELY_CONTRIBUTOR" | "CORRELATED_SIGNAL" | "CONFIRMED_CAUSE", rationale: string) => {
    const f = byCode.get(from); const t = byCode.get(to);
    return f && t ? { fromBottleneckId: f.id, toBottleneckId: t.id, kind, rationale } : null;
  };
  const causalEdges = [link("MISSING_DIGITAL_FOUNDATION", "LOW_DISCOVERY", "LIKELY_CONTRIBUTOR", "Foundation limits discovery"), link("POOR_LEAD_CAPTURE", "WEAK_WEBSITE_CONVERSION", "CONFIRMED_CAUSE", "Capture affects conversion"), link("SLOW_LEAD_RESPONSE", "LOW_CLOSE_RATE", "CORRELATED_SIGNAL", "Response correlates with close rate")].filter(Boolean) as IntelligenceBottleneckGraph["causalEdges"][number][];
  return { bottlenecks, causalEdges, rankedRootCauses: bottlenecks.filter((b) => b.causalRole === "root").map((b) => b.id) };
}

export { deriveBottlenecks };
