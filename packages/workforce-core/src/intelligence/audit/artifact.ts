import { assertRole } from "../../roles/registry.ts";
import { assertNoProhibitedClaims } from "../brand/readiness.ts";
import type { CustomerAuditArtifact, IntelligenceAuditInput } from "../types.ts";

const GENERIC = ["post more on social", "boost engagement", "best practices", "holistic approach"];

export function buildCustomerAuditArtifact(input: IntelligenceAuditInput): CustomerAuditArtifact {
  assertRole("reporting", "report_writer"); assertRole("quality", "final_reviewer");
  const sections = [
    { heading: "Executive summary", body: input.diagnosis.diagnosis.executiveSummary, evidenceIds: [] as string[] },
    { heading: "Strengths", body: input.diagnosis.strengths.map((s) => s.description).join("\n") || "No confirmed strengths — not a negative verdict.", evidenceIds: input.diagnosis.strengths.flatMap((s) => [...s.evidenceIds]) },
    { heading: "Priorities", body: input.bottleneckGraph.bottlenecks.slice(0, 5).map((b) => b.description).join("\n"), evidenceIds: input.bottleneckGraph.bottlenecks.flatMap((b) => [...b.evidenceIds]) },
    { heading: "Strategy", body: `${input.strategy.strategicThesis}\nObjective: ${input.strategy.businessObjective}`, evidenceIds: [] as string[] },
    { heading: "Commercial guidance", body: `${input.commercialFit.recommendedLabel}: ${input.commercialFit.reason}`, evidenceIds: [] as string[] },
  ];
  const full = sections.map((s) => s.body).join("\n"); assertNoProhibitedClaims(full);
  const genericOutputPenaltyApplied = GENERIC.some((g) => full.toLowerCase().includes(g));
  return {
    id: `audit_${input.missionId}`, tenantId: input.tenantId, missionId: input.missionId, title: "Business Growth Audit",
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
  for (const k of ["rawPrompt", "systemPrompt", "internalOnly", "providerKey"]) if (s.includes(k)) throw new Error(`audit_internal_leakage:${k}`);
}

export function finalizeCustomerAudit(input: IntelligenceAuditInput): CustomerAuditArtifact {
  const a = buildCustomerAuditArtifact(input); assertAuditHasNoInternalLeakage(a); return a;
}
