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

w("packages/workforce-core/src/intelligence/security.ts", `import type { ScopedEvidenceRecord } from "./types.ts";
import { assertEvidenceTenantScope, filterScopedEvidence } from "./evidence/model.ts";

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export function assertBrandBrainTenant(args: { tenantId: string; brandBrainTenantId?: string | null }): void {
  if (args.brandBrainTenantId && args.brandBrainTenantId !== args.tenantId) {
    throw new TenantIsolationError("brand_brain_tenant_mismatch");
  }
}

export function assertTenantScopedEvidence(
  records: readonly ScopedEvidenceRecord[],
  ctx: { tenantId: string; missionId: string },
): ScopedEvidenceRecord[] {
  const scoped = filterScopedEvidence(records, ctx);
  if (scoped.length !== records.length) {
    throw new TenantIsolationError("cross_tenant_evidence_rejected");
  }
  for (const r of scoped) assertEvidenceTenantScope(r, ctx);
  return scoped;
}
`);

w("packages/workforce-core/src/intelligence/evidence/model.ts", `import type {
  EvidenceClaim, EvidenceQualityVerdict, EvidenceSourceType, IntelligenceClaimStatus, ScopedEvidenceRecord,
} from "../types.ts";
import { EVIDENCE_FRESHNESS_WINDOWS, FIRST_PARTY_SOURCE_TYPES } from "../types.ts";

export class EvidenceScopeError extends Error {
  constructor(message: string) { super(message); this.name = "EvidenceScopeError"; }
}
export class EvidenceGovernanceError extends Error {
  constructor(message: string) { super(message); this.name = "EvidenceGovernanceError"; }
}

export interface EvidenceValidationContext { tenantId: string; missionId: string; nowIso: string; }

const EXTERNAL = new Set<EvidenceSourceType>(["research_web", "research_serp", "third_party_report"]);

function ageDays(retrievedAtIso: string, nowIso: string): number {
  return Math.floor((Date.parse(nowIso) - Date.parse(retrievedAtIso)) / 86400000);
}

export function assertEvidenceTenantScope(record: ScopedEvidenceRecord, ctx: { tenantId: string; missionId: string }): void {
  if (record.tenantId !== ctx.tenantId) throw new EvidenceScopeError(\`cross_tenant_evidence:\${record.id}\`);
  if (record.missionId !== ctx.missionId) throw new EvidenceScopeError(\`cross_mission_evidence:\${record.id}\`);
}

export function filterScopedEvidence(records: readonly ScopedEvidenceRecord[], ctx: { tenantId: string; missionId: string }): ScopedEvidenceRecord[] {
  return records.filter((r) => { try { assertEvidenceTenantScope(r, ctx); return true; } catch { return false; } });
}

export function isEvidenceFresh(record: ScopedEvidenceRecord, nowIso: string): boolean {
  return ageDays(record.retrievedAtIso, nowIso) <= EVIDENCE_FRESHNESS_WINDOWS[record.sourceType];
}

export function classifyFirstParty(record: ScopedEvidenceRecord): boolean {
  return record.isFirstParty || FIRST_PARTY_SOURCE_TYPES.has(record.sourceType);
}

export function resolveClaimStatus(args: {
  statement: string;
  requestedStatus: IntelligenceClaimStatus;
  supportingRecords: readonly ScopedEvidenceRecord[];
  ctx: EvidenceValidationContext;
}) {
  const rejections: string[] = [];
  const fresh = args.supportingRecords.filter((r) => {
    try { assertEvidenceTenantScope(r, args.ctx); } catch { rejections.push(\`scope:\${r.id}\`); return false; }
    if (!isEvidenceFresh(r, args.ctx.nowIso)) { rejections.push(\`stale:\${r.id}\`); return false; }
    return true;
  });
  if (fresh.length === 0) return { status: "RESEARCH_REQUIRED" as const, qualityVerdict: "INSUFFICIENT" as const, evidenceIds: [], rejectionReasons: rejections };

  const firstParty = fresh.filter(classifyFirstParty);
  const external = fresh.filter((r) => EXTERNAL.has(r.sourceType));
  const supports = (set: ScopedEvidenceRecord[]) => set.some((r) => r.supportedClaims.some((c) => c === args.statement || args.statement.includes(c)));

  let status: IntelligenceClaimStatus = args.requestedStatus;
  let qualityVerdict: EvidenceQualityVerdict = "INSUFFICIENT";
  if (supports(firstParty)) {
    status = firstParty.some((r) => r.sourceType === "customer_provided") ? "KNOWN_CUSTOMER_PROVIDED" : "KNOWN";
    qualityVerdict = "SUPPORTED";
  } else if (supports(external)) {
    if (status === "KNOWN" || status === "KNOWN_CUSTOMER_PROVIDED") {
      rejections.push("external_claim_cannot_become_known");
      status = "DERIVED";
    }
    qualityVerdict = "PARTIALLY_SUPPORTED";
  } else if (status === "KNOWN") {
    status = "ASSUMPTION";
    qualityVerdict = "INSUFFICIENT";
  }
  return { status, qualityVerdict, evidenceIds: fresh.map((r) => r.id), rejectionReasons: rejections };
}

export function buildEvidenceClaim(args: {
  claimId: string; statement: string; domain: string; requestedStatus: IntelligenceClaimStatus;
  supportingRecords: readonly ScopedEvidenceRecord[]; ctx: EvidenceValidationContext;
}): EvidenceClaim {
  const r = resolveClaimStatus(args);
  return { claimId: args.claimId, statement: args.statement, domain: args.domain, status: r.status, evidenceIds: r.evidenceIds, qualityVerdict: r.qualityVerdict };
}

export function assessEvidenceQuality(records: readonly ScopedEvidenceRecord[], ctx: EvidenceValidationContext): EvidenceQualityVerdict {
  const scoped = filterScopedEvidence(records, ctx).filter((r) => isEvidenceFresh(r, ctx.nowIso));
  if (scoped.length === 0) return "INSUFFICIENT";
  const fp = scoped.filter(classifyFirstParty).length;
  const ext = scoped.filter((r) => EXTERNAL.has(r.sourceType)).length;
  if (fp >= 2 || (fp === 1 && ext === 0)) return "SUPPORTED";
  if (fp >= 1 && ext >= 1) return "PARTIALLY_SUPPORTED";
  if (ext >= 2) return "PARTIALLY_SUPPORTED";
  return "INSUFFICIENT";
}
`);

w("packages/workforce-core/src/intelligence/evidence/contradiction.ts", `import type { EvidenceClaim, ScopedEvidenceRecord } from "../types.ts";
import { resolveClaimStatus, type EvidenceValidationContext } from "./model.ts";

export interface ContradictionFinding {
  claimA: string; claimB: string; evidenceIdsA: readonly string[]; evidenceIdsB: readonly string[];
  severity: "low" | "medium" | "high"; resolution: "prefer_first_party" | "mark_conflicting" | "research_required"; rationale: string;
}

const PAIRS: [RegExp, RegExp][] = [[/no website/i, /has website/i], [/high traffic/i, /low traffic/i], [/slow response/i, /fast response/i]];

export function detectContradictions(args: { claims: readonly EvidenceClaim[]; records: readonly ScopedEvidenceRecord[]; ctx: EvidenceValidationContext }): ContradictionFinding[] {
  const out: ContradictionFinding[] = [];
  for (let i = 0; i < args.claims.length; i++) {
    for (let j = i + 1; j < args.claims.length; j++) {
      const a = args.claims[i]!; const b = args.claims[j]!;
      if (!PAIRS.some(([x, y]) => (x.test(a.statement) && y.test(b.statement)) || (x.test(b.statement) && y.test(a.statement)))) continue;
      const ra = resolveClaimStatus({ statement: a.statement, requestedStatus: a.status, supportingRecords: args.records, ctx: args.ctx });
      const rb = resolveClaimStatus({ statement: b.statement, requestedStatus: b.status, supportingRecords: args.records, ctx: args.ctx });
      out.push({ claimA: a.statement, claimB: b.statement, evidenceIdsA: ra.evidenceIds, evidenceIdsB: rb.evidenceIds, severity: ra.evidenceIds.length && !rb.evidenceIds.length ? "low" : "high", resolution: ra.evidenceIds.length && !rb.evidenceIds.length ? "prefer_first_party" : "research_required", rationale: "Conflicting evidence-backed claims" });
    }
  }
  return out;
}

export function applyContradictionVerdicts(claims: readonly EvidenceClaim[], contradictions: readonly ContradictionFinding[]): EvidenceClaim[] {
  const bad = new Set(contradictions.flatMap((c) => [c.claimA, c.claimB]));
  return claims.map((c) => bad.has(c.statement) ? { ...c, qualityVerdict: "CONFLICTING" as const, status: c.status === "KNOWN" ? "DERIVED" : c.status } : c);
}
`);

w("packages/workforce-core/src/intelligence/research/planner.ts", `import { createMissionBudget } from "../../budgets/hierarchy.ts";
import { getCapability } from "../../capabilities/registry.ts";
import { assertRole } from "../../roles/registry.ts";
import type { BusinessGrowthPlannerInput } from "../../planning/types.ts";
import type { ResearchPlanArtifact, ResearchTaskSpec } from "../types.ts";

const ROLES = ["market_researcher", "audience_researcher", "competitor_researcher", "trend_researcher", "evidence_reviewer"] as const;

export interface ResearchPlannerInput {
  tenantId: string; missionId: string; currentDateIso: string;
  plannerInput: Pick<BusinessGrowthPlannerInput, "brandBrain" | "targetAudience" | "geography" | "positioning" | "productsServices" | "businessGoals" | "existingResearchEvidence" | "businessSignals">;
  researchGaps: readonly string[]; budgetCents?: number;
}

function task(id: string, role: (typeof ROLES)[number], objective: string, cap: string, budget: number): ResearchTaskSpec {
  assertRole("research", role);
  const status = getCapability(cap)?.status ?? "UNAVAILABLE";
  return { taskId: id, department: "research", specialistRole: role, objective, questions: [objective], requiredCapability: cap, capabilityStatus: status, budgetCents: budget, evidenceOutputClass: "research_evidence" };
}

export function buildResearchPlan(input: ResearchPlannerInput): ResearchPlanArtifact {
  for (const r of ROLES) assertRole("research", r);
  const budgetEnvelope = createMissionBudget(input.budgetCents ?? 0);
  const each = Math.max(0, Math.floor((input.budgetCents ?? 0) / ROLES.length));
  const brand = input.plannerInput.brandBrain.business_name ?? "business";
  return {
    id: \`research_plan_\${input.missionId}\`, tenantId: input.tenantId, missionId: input.missionId,
    tasks: [
      task("rt_1", "market_researcher", \`Map market for \${brand}\`, "research.web", each),
      task("rt_2", "audience_researcher", \`Profile \${input.plannerInput.targetAudience}\`, "research.web", each),
      task("rt_3", "competitor_researcher", "Competitor positioning", "research.serp", each),
      task("rt_4", "trend_researcher", "Trend scan", "research.web", each),
      task("rt_5", "evidence_reviewer", "Evidence QA", "research.web", each),
    ],
    budgetEnvelope,
    synthesisObjective: "Evidence-backed claims only — PLANNED capabilities, no live provider calls here",
    generatedAtIso: input.currentDateIso,
  };
}
`);

w("packages/workforce-core/src/intelligence/research/synthesis.ts", `import type { ResearchPlanArtifact, ResearchSynthesisArtifact, ScopedEvidenceRecord } from "../types.ts";
import { buildEvidenceClaim, filterScopedEvidence, type EvidenceValidationContext } from "../evidence/model.ts";
import { applyContradictionVerdicts, detectContradictions } from "../evidence/contradiction.ts";

export interface ResearchSynthesisInput {
  tenantId: string; missionId: string; currentDateIso: string; plan: ResearchPlanArtifact;
  evidenceRecords: readonly ScopedEvidenceRecord[]; gapStatements?: readonly string[];
}

export function synthesizeResearchFindings(input: ResearchSynthesisInput): ResearchSynthesisArtifact {
  const ctx: EvidenceValidationContext = { tenantId: input.tenantId, missionId: input.missionId, nowIso: input.currentDateIso };
  const scoped = filterScopedEvidence(input.evidenceRecords, ctx);
  const raw = scoped.flatMap((record, idx) => record.supportedClaims.map((statement, j) => buildEvidenceClaim({
    claimId: \`c_\${idx}_\${j}\`, statement, domain: record.sourceType,
    requestedStatus: record.isFirstParty ? "KNOWN" : "DERIVED", supportingRecords: [record], ctx,
  })));
  const contradictions = detectContradictions({ claims: raw, records: scoped, ctx });
  const claims = applyContradictionVerdicts(raw, contradictions);
  return {
    id: \`synthesis_\${input.missionId}\`, tenantId: input.tenantId, missionId: input.missionId,
    summary: claims.some((c) => c.qualityVerdict === "SUPPORTED") ? \`Synthesized \${claims.length} claims\` : "Insufficient evidence — retain RESEARCH_REQUIRED",
    claims, gaps: input.gapStatements ?? [], evidenceIds: scoped.map((r) => r.id), generatedAtIso: input.currentDateIso,
  };
}
`);

w("packages/workforce-core/src/intelligence/brand/readiness.ts", `import type { BrandBrainContent } from "@stratxcel/brand-brain";
import type { BrandReadinessAssessment, BrandReadinessLevel } from "../types.ts";

const REQUIRED = ["business_name", "tone_of_voice", "target_audience"] as const;
const PROHIBITED = [/\\bguaranteed\\b/i, /\\b\\d+%\\s*(roi|roas|conversion|growth)\\b/i, /\\b#1\\b/i, /\\bwill double\\b/i, /\\bmarket leader\\b/i];

export class ProhibitedClaimError extends Error { constructor(m: string) { super(m); this.name = "ProhibitedClaimError"; } }

export function assessBrandReadiness(brandBrain: BrandBrainContent): BrandReadinessAssessment {
  const presentFields: string[] = []; const missingRequired: string[] = [];
  for (const f of REQUIRED) {
    const v = brandBrain[f]; const ok = typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v != null;
    (ok ? presentFields : missingRequired).push(f);
  }
  const warnings: string[] = [];
  if (!brandBrain.products?.length && !brandBrain.industry?.trim()) warnings.push("Offer context missing — do not invent SKUs");
  let level: BrandReadinessLevel = missingRequired.length === REQUIRED.length ? "MISSING_REQUIRED_CONTEXT" : missingRequired.length ? "PARTIAL" : "READY";
  const scan = JSON.stringify(brandBrain);
  return { level, presentFields, missingRequired, warnings, prohibitedClaimViolations: PROHIBITED.filter((rx) => rx.test(scan)).map((rx) => rx.source) };
}

export function assertNoProhibitedClaims(text: string): void {
  for (const rx of PROHIBITED) if (rx.test(text)) throw new ProhibitedClaimError(\`prohibited_claim:\${rx.source}\`);
}
`);

w("packages/workforce-core/src/intelligence/diagnosis/engine.ts", `import { createMissionBudget } from "../../budgets/hierarchy.ts";
import { diagnoseBusinessGrowth, resolveEntryMode } from "../../planning/diagnosis.ts";
import type { BusinessGrowthDiagnosisFinding } from "../../planning/growth-types.ts";
import type { BusinessMaturity, BusinessStrength, IntelligenceDiagnosisInput, IntelligenceDiagnosisResult } from "../types.ts";
import { assessBrandReadiness } from "../brand/readiness.ts";
import { assessEvidenceQuality, filterScopedEvidence } from "../evidence/model.ts";

function maturity(input: IntelligenceDiagnosisInput, entry: ReturnType<typeof resolveEntryMode>): BusinessMaturity {
  const s = input.plannerInput.businessSignals ?? input.businessSignals ?? {};
  if (entry === "NEW_BUSINESS" || s.hasWebsite === false) return "PRE_LAUNCH";
  if (typeof s.monthlyInquiries === "number" && s.monthlyInquiries >= 100) return "GROWTH";
  if (s.websiteTrafficStrength === "high" || s.socialPresenceStrength === "high") return "ESTABLISHED";
  return "UNKNOWN";
}

function strengths(findings: readonly BusinessGrowthDiagnosisFinding[]): BusinessStrength[] {
  return findings.filter((f) => f.severity === "info" || f.recommendedActionClass.startsWith("preserve_")).map((f, i) => ({
    id: \`st_\${i + 1}\`, label: f.domain, domain: f.domain, description: f.finding, evidenceIds: [...f.evidenceIds], confidence: f.confidence,
  }));
}

export function runIntelligenceDiagnosis(input: IntelligenceDiagnosisInput): IntelligenceDiagnosisResult {
  const plannerInput = { ...input.plannerInput, budgetEnvelope: input.plannerInput.budgetEnvelope ?? createMissionBudget(0) };
  const entryMode = resolveEntryMode(plannerInput);
  const diagnosis = diagnoseBusinessGrowth(plannerInput);
  assessBrandReadiness(plannerInput.brandBrain);
  const ctx = { tenantId: plannerInput.tenantId, missionId: plannerInput.missionId, nowIso: plannerInput.currentDateIso };
  const scoped = filterScopedEvidence(input.evidenceRecords ?? [], ctx);
  const quality = assessEvidenceQuality(scoped, ctx);
  const hasEvidence = (plannerInput.businessSignals?.signalEvidenceIds?.length ?? 0) > 0 || plannerInput.existingResearchEvidence.length > 0;
  const evidenceCoverage = quality === "INSUFFICIENT" && !hasEvidence ? "INSUFFICIENT_EVIDENCE" : "SUFFICIENT";
  const signals = plannerInput.businessSignals ?? {};
  const foundationStatus = entryMode === "NEW_BUSINESS" && signals.hasWebsite === false ? "MISSING_FOUNDATION" : signals.hasWebsite === false ? "PARTIAL" : "COMPLETE";
  return {
    tenantId: plannerInput.tenantId, missionId: plannerInput.missionId, entryMode, maturity: maturity(input, entryMode), strengths: strengths(diagnosis.findings),
    diagnosis: {
      ...diagnosis,
      executiveSummary: foundationStatus === "MISSING_FOUNDATION" ? "New business without website: MISSING_FOUNDATION before channel scale." : evidenceCoverage === "INSUFFICIENT_EVIDENCE" ? "Insufficient evidence — missing data is not poor performance." : diagnosis.executiveSummary,
      researchGaps: evidenceCoverage === "INSUFFICIENT_EVIDENCE" ? [...diagnosis.researchGaps, "Research required for external performance claims"] : diagnosis.researchGaps,
    },
    foundationStatus, evidenceCoverage,
    researchRequired: evidenceCoverage === "INSUFFICIENT_EVIDENCE" || diagnosis.researchGaps.length > 0,
    generatedAtIso: plannerInput.currentDateIso,
  };
}

export { resolveEntryMode, diagnoseBusinessGrowth };
`);

w("packages/workforce-core/src/intelligence/bottlenecks/engine.ts", `import { deriveBottlenecks } from "../../planning/diagnosis.ts";
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
`);

console.log("batch2 done");
