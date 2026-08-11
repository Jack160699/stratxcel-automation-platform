import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} rel @param {string} content */
function w(rel, content) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  if (!fs.existsSync(p)) throw new Error(`failed to write ${rel}`);
  console.log("OK", rel, fs.statSync(p).size);
}

const files = {};

files["packages/workforce-core/src/intelligence/types.ts"] = `import type { BrandBrainContent } from "@stratxcel/brand-brain";
import type { DepartmentKey } from "../departments/types.ts";
import type { EvidenceReference } from "../evidence/types.ts";
import type { MissionBudgetEnvelope } from "../budgets/hierarchy.ts";
import type {
  BusinessGrowthDiagnosis,
  CustomerEntryMode,
  GrowthBottleneck,
  GrowthRecommendation,
} from "../planning/growth-types.ts";
import type { BusinessGrowthPlannerInput, BusinessSignals } from "../planning/types.ts";
import type { KnowledgeClaimStatus } from "../planning/knowledge.ts";
import type { DepartmentHandoff } from "../handoffs/create.ts";
import type { IntelligenceEvent } from "./events.ts";
import type { IntelligenceSpecialistRunPlan } from "./hermes/delegation.ts";

export type IntelligenceClaimStatus = KnowledgeClaimStatus | "KNOWN_CUSTOMER_PROVIDED";
export type EvidenceQualityVerdict = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "CONFLICTING" | "INSUFFICIENT";
export type EvidenceSourceType =
  | "brand_brain" | "customer_provided" | "integration_state" | "first_party_analytics"
  | "crm_snapshot" | "website_snapshot" | "research_web" | "research_serp"
  | "third_party_report" | "positioning_context" | "derived_inference";
export type BusinessMaturity = "PRE_LAUNCH" | "EARLY_STAGE" | "ESTABLISHED" | "GROWTH" | "MATURE" | "UNKNOWN";
export type BrandReadinessLevel = "READY" | "PARTIAL" | "MISSING_REQUIRED_CONTEXT";
export type CausalEdgeKind = "LIKELY_CONTRIBUTOR" | "CORRELATED_SIGNAL" | "CONFIRMED_CAUSE";
export type BottleneckNodeKind = "root_cause" | "symptom" | "contributing_factor";
export type WorkExecutionClass = "PURCHASED_EXECUTION" | "RECOMMENDED_FUTURE_WORK";
export type CommercialFitOutcome =
  | "SMALLEST_COVERING_OPTION" | "ALREADY_ENTITLED" | "PARTIAL_COVERAGE" | "CUSTOM" | "NO_CHANGE_NEEDED";

export interface ScopedEvidenceRecord {
  id: string;
  tenantId: string;
  missionId: string;
  sourceType: EvidenceSourceType;
  sourceLabel: string;
  retrievedAtIso: string;
  summary: string;
  supportedClaims: readonly string[];
  confidence: "low" | "medium" | "high";
  isFirstParty: boolean;
  externalReference?: EvidenceReference;
}

export interface EvidenceClaim {
  claimId: string;
  statement: string;
  status: IntelligenceClaimStatus;
  evidenceIds: readonly string[];
  domain: string;
  qualityVerdict: EvidenceQualityVerdict;
}

export interface BusinessStrength {
  id: string;
  label: string;
  domain: string;
  description: string;
  evidenceIds: readonly string[];
  confidence: "low" | "medium" | "high";
}

export interface IntelligenceDiagnosisResult {
  tenantId: string;
  missionId: string;
  entryMode: CustomerEntryMode;
  maturity: BusinessMaturity;
  strengths: readonly BusinessStrength[];
  diagnosis: BusinessGrowthDiagnosis;
  foundationStatus: "COMPLETE" | "MISSING_FOUNDATION" | "PARTIAL";
  evidenceCoverage: "SUFFICIENT" | "INSUFFICIENT_EVIDENCE";
  researchRequired: boolean;
  generatedAtIso: string;
}

export interface BottleneckCausalEdge {
  fromBottleneckId: string;
  toBottleneckId: string;
  kind: CausalEdgeKind;
  rationale: string;
}

export interface IntelligenceBottleneck extends GrowthBottleneck {
  nodeKind: BottleneckNodeKind;
  causalRole: "root" | "symptom" | "neutral";
  customerNeedScore: number;
}

export interface IntelligenceBottleneckGraph {
  bottlenecks: readonly IntelligenceBottleneck[];
  causalEdges: readonly BottleneckCausalEdge[];
  rankedRootCauses: readonly string[];
}

export interface MeasurementPlanItem {
  metricClass: string;
  dataSource: string;
  cadence: "weekly" | "monthly" | "mission_end";
  purpose: string;
  requiresIntegration: boolean;
}

export interface StrategyWorkItem {
  id: string;
  objective: string;
  tactic: string;
  department: DepartmentKey;
  specialistRole: string;
  executionClass: WorkExecutionClass;
  bottleneckIds: readonly string[];
  evidenceIds: readonly string[];
  measurementItems: readonly MeasurementPlanItem[];
}

export interface GrowthStrategyArtifact {
  id: string;
  tenantId: string;
  missionId: string;
  businessObjective: string;
  strategicThesis: string;
  workItems: readonly StrategyWorkItem[];
  measurementPlan: readonly MeasurementPlanItem[];
  reviewerRoles: readonly { department: DepartmentKey; role: string }[];
  generatedAtIso: string;
}

export interface ResearchTaskSpec {
  taskId: string;
  department: "research";
  specialistRole: string;
  objective: string;
  questions: readonly string[];
  requiredCapability: string;
  capabilityStatus: "PLANNED" | "AVAILABLE" | "NOT_CONFIGURED" | "UNAVAILABLE";
  budgetCents: number;
  evidenceOutputClass: string;
}

export interface ResearchPlanArtifact {
  id: string;
  tenantId: string;
  missionId: string;
  tasks: readonly ResearchTaskSpec[];
  budgetEnvelope: MissionBudgetEnvelope;
  synthesisObjective: string;
  generatedAtIso: string;
}

export interface ResearchSynthesisArtifact {
  id: string;
  tenantId: string;
  missionId: string;
  summary: string;
  claims: readonly EvidenceClaim[];
  gaps: readonly string[];
  evidenceIds: readonly string[];
  generatedAtIso: string;
}

export interface BrandReadinessAssessment {
  level: BrandReadinessLevel;
  presentFields: readonly string[];
  missingRequired: readonly string[];
  warnings: readonly string[];
  prohibitedClaimViolations: readonly string[];
}

export interface PlanCatalogueEntryInput {
  planKey: string;
  label: string;
  tierRank: number;
  coveredDomains: readonly string[];
  coveredCapabilities: readonly string[];
  entitlementKeys: readonly string[];
  isPurchasable: boolean;
}

export interface CommercialFitRecommendation {
  outcome: CommercialFitOutcome;
  recommendedPlanKey: string | null;
  recommendedLabel: string;
  reason: string;
  coveringBottleneckIds: readonly string[];
  uncoveredDomains: readonly string[];
  doNotActivateSubscription: true;
  doNotChargeCard: true;
  doNotGrantEntitlements: true;
}

export interface AuditArtifactSection { heading: string; body: string; evidenceIds: readonly string[]; }

export interface AuditQualityReview {
  creatorDepartment: DepartmentKey;
  creatorRole: string;
  reviewerDepartment: DepartmentKey;
  reviewerRole: string;
  decision: "PASS" | "REVISE" | "REJECT";
  genericOutputPenaltyApplied: boolean;
  notes: readonly string[];
}

export interface CustomerAuditArtifact {
  id: string;
  tenantId: string;
  missionId: string;
  title: string;
  executiveSummary: string;
  sections: readonly AuditArtifactSection[];
  strengths: readonly string[];
  priorities: readonly string[];
  recommendationsSummary: readonly string[];
  qualityReview: AuditQualityReview;
  generatedAtIso: string;
}

export interface IntelligenceDiagnosisInput {
  plannerInput: BusinessGrowthPlannerInput;
  evidenceRecords?: readonly ScopedEvidenceRecord[];
  brandBrainTenantId?: string | null;
  businessSignals?: BusinessSignals;
}

export interface IntelligenceStrategyInput {
  tenantId: string;
  missionId: string;
  currentDateIso: string;
  diagnosis: IntelligenceDiagnosisResult;
  bottleneckGraph: IntelligenceBottleneckGraph;
  recommendations: readonly GrowthRecommendation[];
  entitlementSnapshot: BusinessGrowthPlannerInput["entitlementSnapshot"];
  entryMode: CustomerEntryMode;
}

export interface IntelligenceAuditInput {
  tenantId: string;
  missionId: string;
  currentDateIso: string;
  diagnosis: IntelligenceDiagnosisResult;
  bottleneckGraph: IntelligenceBottleneckGraph;
  strategy: GrowthStrategyArtifact;
  recommendations: readonly GrowthRecommendation[];
  commercialFit: CommercialFitRecommendation;
}

export interface IntelligencePipelineContext {
  tenantId: string;
  missionId: string;
  currentDateIso: string;
  plannerInput: BusinessGrowthPlannerInput;
  evidenceRecords?: readonly ScopedEvidenceRecord[];
  brandBrainTenantId?: string | null;
  researchBudgetCents?: number;
  catalogue?: readonly PlanCatalogueEntryInput[];
}

export interface IntelligencePipelineResult {
  researchPlan: ResearchPlanArtifact;
  synthesis: ResearchSynthesisArtifact;
  brandReadiness: BrandReadinessAssessment;
  diagnosis: IntelligenceDiagnosisResult;
  bottleneckGraph: IntelligenceBottleneckGraph;
  recommendations: readonly GrowthRecommendation[];
  commercialFit: CommercialFitRecommendation;
  strategy: GrowthStrategyArtifact;
  audit: CustomerAuditArtifact;
  specialistPlan: IntelligenceSpecialistRunPlan;
  handoffs: readonly DepartmentHandoff[];
  events: readonly IntelligenceEvent[];
}

export const EVIDENCE_FRESHNESS_WINDOWS: Readonly<Record<EvidenceSourceType, number>> = {
  brand_brain: 365, customer_provided: 180, integration_state: 7, first_party_analytics: 30,
  crm_snapshot: 14, website_snapshot: 30, research_web: 90, research_serp: 60,
  third_party_report: 120, positioning_context: 365, derived_inference: 30,
};

export const FIRST_PARTY_SOURCE_TYPES: ReadonlySet<EvidenceSourceType> = new Set([
  "brand_brain", "customer_provided", "integration_state", "first_party_analytics",
  "crm_snapshot", "website_snapshot", "positioning_context",
]);
`;

// NOTE: remaining files appended below by continuation script
for (const [rel, content] of Object.entries(files)) {
  w(rel, content);
}

console.log("batch1 complete", Object.keys(files).length);
