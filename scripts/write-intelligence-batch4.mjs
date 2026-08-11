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

w("packages/workforce-core/src/events/emit.ts", `export type WorkforceEventName =
  | "workforce.plan.created"
  | "workforce.plan.validated"
  | "workforce.stage.ready"
  | "workforce.stage.started"
  | "workforce.stage.completed"
  | "workforce.stage.failed"
  | "workforce.review.completed"
  | "workforce.revision.requested"
  | "workforce.plan.revised"
  | "workforce.handoff.created"
  | "workforce.capability.blocked"
  | "intelligence.research.started"
  | "intelligence.research.completed"
  | "intelligence.evidence.reviewed"
  | "intelligence.diagnosis.completed"
  | "intelligence.bottleneck.identified"
  | "intelligence.strategy.completed"
  | "intelligence.recommendation.created"
  | "intelligence.audit.completed";

export interface WorkforceEventPayload {
  tenantId: string;
  missionId: string;
  planId?: string;
  stageId?: string;
  department?: string;
  role?: string;
  correlationId?: string;
  data?: Record<string, unknown>;
}

export interface WorkforceEvent {
  name: WorkforceEventName;
  atIso: string;
  payload: WorkforceEventPayload;
}

export interface WorkforceEventEmitter {
  emit(event: WorkforceEvent): void | Promise<void>;
}

export function createNoopWorkforceEventEmitter(): WorkforceEventEmitter {
  return { emit() {} };
}

export function createCollectingWorkforceEventEmitter(): WorkforceEventEmitter & { events: WorkforceEvent[] } {
  const events: WorkforceEvent[] = [];
  return {
    events,
    emit(event) {
      events.push(event);
    },
  };
}
`);

const indexPath = path.join(root, "packages/workforce-core/src/index.ts");
let index = fs.readFileSync(indexPath, "utf8");
if (!index.includes('export * from "./intelligence/index.ts"')) {
  index = index.trimEnd() + '\nexport * from "./intelligence/index.ts";\n';
  fs.writeFileSync(indexPath, index, "utf8");
  console.log("OK packages/workforce-core/src/index.ts (patched)");
}

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const testKey = "test:workforce-core";
const intelTest = "node --experimental-strip-types packages/workforce-core/src/__tests__/intelligence.test.ts";
if (!pkg.scripts[testKey].includes("intelligence.test.ts")) {
  pkg.scripts[testKey] = pkg.scripts[testKey] + " && " + intelTest;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("OK package.json (patched)");
}

w("docs/architecture/INTELLIGENCE_DEPARTMENT.md", `# Intelligence Department

**Status:** Workstream 2 — business audit and growth strategy intelligence layer in \`@stratxcel/workforce-core\`.

## Purpose

The Intelligence Department turns tenant/mission-scoped evidence into customer-ready audit and strategy artifacts without inventing performance facts or mutating billing.

## Pipeline (\`runIntelligencePipeline\`)

1. **Tenant checks** — \`assertBrandBrainTenant\`, \`assertTenantScopedEvidence\`
2. **Research plan** — parallel research roles via canonical registry; \`research.web\`/\`research.serp\` remain PLANNED (no live calls in planner)
3. **Evidence quality & contradictions** — freshness windows, first-party precedence, external claims cannot become KNOWN
4. **Brand assessment** — READY | PARTIAL | MISSING_REQUIRED_CONTEXT; prohibited claims blocked
5. **Diagnosis** — wraps \`diagnoseBusinessGrowth\` / \`resolveEntryMode\`; NO DATA ≠ bad performance
6. **Bottlenecks** — causal edges, root vs symptom, customer-need priority scoring
7. **Recommendations** — \`buildGrowthRecommendations\`
8. **Commercial fit** — smallest covering / ALREADY_ENTITLED / PARTIAL / CUSTOM; billing mutation blocked
9. **Strategy** — objective ≠ tactic; CRM/WhatsApp for response bottlenecks (not Social)
10. **Audit artifact** — customer sections, creator/reviewer separation
11. **Hermes specialist plan & handoffs** — delegation guidance for CEO
12. **Events** — \`intelligence.*\` names on WorkforceEventEmitter

## Key modules

| Module | Responsibility |
|--------|----------------|
| \`evidence/model.ts\` | Scoped records, claim status, freshness |
| \`research/planner.ts\` | Research task plan + budget |
| \`diagnosis/engine.ts\` | Maturity vs entry mode, MISSING_FOUNDATION |
| \`bottlenecks/engine.ts\` | Causal graph + priority |
| \`strategy/builder.ts\` | GrowthStrategyArtifact |
| \`recommendations/commercial-fit.ts\` | Catalogue fit, billing guards |
| \`hermes/delegation.ts\` | Specialist run plan + handoffs |
| \`pipeline.ts\` | End-to-end orchestration |

## Hermes CEO

See \`HERMES_INTELLIGENCE_DELEGATION_GUIDANCE\` in \`hermes/delegation.ts\` for stage ordering and reviewer separation rules.

## Tests

\`packages/workforce-core/src/__tests__/intelligence.test.ts\` — audit-only, slow-response CRM routing, foundation-first new business, healthy NO_CHANGE, commercial fit, evidence governance, brand safety, tenant isolation.
`);

const archPath = path.join(root, "docs/architecture/AI_WORKFORCE_ARCHITECTURE.md");
let arch = fs.readFileSync(archPath, "utf8");
const marker = "## Planning concepts";
const insert = `## Intelligence Department

For the evidence-gated audit → diagnosis → bottleneck → strategy → commercial-fit pipeline, see [INTELLIGENCE_DEPARTMENT.md](./INTELLIGENCE_DEPARTMENT.md).

`;
if (!arch.includes("INTELLIGENCE_DEPARTMENT.md")) {
  arch = arch.replace(marker, insert + marker);
  fs.writeFileSync(archPath, arch, "utf8");
  console.log("OK docs/architecture/AI_WORKFORCE_ARCHITECTURE.md (patched)");
}

w("packages/workforce-core/src/__tests__/intelligence.test.ts", `// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/intelligence.test.ts
import assert from "node:assert/strict";
import { createMissionBudget } from "../budgets/hierarchy.ts";
import { snapshotFromContract } from "../planning/allocation.ts";
import { PLAN_DEFINITIONS } from "../../../payments-and-wallet/src/plans.ts";
import { buildCatalogueFromPlanDefinitions } from "../intelligence/catalogue.ts";
import { runIntelligencePipeline } from "../intelligence/pipeline.ts";
import { evaluateCommercialFit, assertRecommendationCannotMutateBilling, BillingMutationError } from "../intelligence/recommendations/commercial-fit.ts";
import { resolveClaimStatus, assertEvidenceTenantScope, EvidenceScopeError } from "../intelligence/evidence/model.ts";
import { assessBrandReadiness, assertNoProhibitedClaims, ProhibitedClaimError } from "../intelligence/brand/readiness.ts";
import { assertBrandBrainTenant, assertTenantScopedEvidence, TenantIsolationError } from "../intelligence/security.ts";
import { buildIntelligenceSpecialistRunPlan, HERMES_INTELLIGENCE_DELEGATION_GUIDANCE } from "../intelligence/hermes/delegation.ts";
import { assertResponseBottlenecksNotRoutedToSocial } from "../intelligence/strategy/builder.ts";
import { narrowCapabilityClasses, CapabilityEscalationError } from "../security/narrowing.ts";
import type { BusinessGrowthPlannerInput } from "../planning/types.ts";
import type { ScopedEvidenceRecord } from "../intelligence/types.ts";

const NOW = "2026-08-11T00:00:00.000Z";
const catalogue = buildCatalogueFromPlanDefinitions(Object.values(PLAN_DEFINITIONS));

function base(overrides: Partial<BusinessGrowthPlannerInput> = {}): BusinessGrowthPlannerInput {
  return {
    tenantId: "tenant-a",
    missionId: "mission-a",
    timezone: "Asia/Kolkata",
    currentDateIso: NOW,
    brandBrain: { business_name: "Test Co", tone_of_voice: "professional", target_audience: "local buyers", industry: "services" },
    productsServices: ["Consulting"],
    targetAudience: "local buyers",
    geography: "Raipur",
    positioning: "Trusted local expert",
    connectedChannels: [],
    businessGoals: ["Improve growth"],
    previousPerformance: [],
    existingResearchEvidence: [],
    activeCampaigns: [],
    availableCapabilities: [],
    entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {} }),
    budgetEnvelope: createMissionBudget(0),
    ...overrides,
  };
}

function record(partial: Partial<ScopedEvidenceRecord> & Pick<ScopedEvidenceRecord, "id" | "supportedClaims">, missionId = "mission-a"): ScopedEvidenceRecord {
  return {
    tenantId: "tenant-a",
    missionId,
    sourceType: "customer_provided",
    sourceLabel: "customer",
    retrievedAtIso: NOW,
    summary: "customer fact",
    confidence: "high",
    isFirstParty: true,
    ...partial,
  };
}

function run() {
  assertBrandBrainTenant({ tenantId: "tenant-a", brandBrainTenantId: "tenant-a" });
  assert.throws(() => assertBrandBrainTenant({ tenantId: "tenant-a", brandBrainTenantId: "tenant-b" }), TenantIsolationError);

  // audit-only local business
  const audit = runIntelligencePipeline({
    tenantId: "tenant-a", missionId: "m-audit", currentDateIso: NOW, brandBrainTenantId: "tenant-a",
    plannerInput: base({
      entryMode: "AUDIT_ONLY",
      entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {}, purchasedServiceKeys: ["brand_audit"] }),
      businessSignals: { websiteTrafficStrength: "low", searchVisibilityStrength: "low", signalEvidenceIds: ["ev1"] },
      existingResearchEvidence: ["ev1"],
    }),
    evidenceRecords: [record({ id: "ev1", supportedClaims: ["local market presence"], sourceType: "customer_provided" }, "m-audit")],
    catalogue,
  });
  assert.equal(audit.diagnosis.entryMode, "AUDIT_ONLY");
  assert.ok(audit.events.some((e) => e.name === "intelligence.audit.completed"));
  assertRecommendationCannotMutateBilling(audit.commercialFit);

  // existing high-lead slow response — CRM not social
  const slow = runIntelligencePipeline({
    tenantId: "tenant-a", missionId: "m-slow", currentDateIso: NOW, brandBrainTenantId: "tenant-a",
    plannerInput: base({
      entryMode: "EXISTING_BUSINESS",
      connectedChannels: ["Instagram"],
      businessSignals: { hasWebsite: true, websiteTrafficStrength: "high", socialPresenceStrength: "high", monthlyInquiries: 500, medianResponseTimeHours: 18, crmFollowUpStrength: "weak", postContactConversionStrength: "high", signalEvidenceIds: ["ev-crm"] },
      existingResearchEvidence: ["ev-crm"],
      entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: { whatsapp_contacts: 500 } }),
    }),
    evidenceRecords: [record({ id: "ev-crm", supportedClaims: ["slow lead response"], sourceType: "crm_snapshot" }, "m-slow")],
    catalogue,
  });
  assert.ok(slow.bottleneckGraph.bottlenecks[0]?.code === "SLOW_LEAD_RESPONSE" || slow.bottleneckGraph.bottlenecks[0]?.code === "WEAK_FOLLOW_UP");
  assert.ok(slow.strategy.workItems.some((w) => w.department === "whatsapp" || w.department === "crm"));
  assert.doesNotMatch(slow.strategy.workItems.map((w) => w.department).join(","), /social/);
  assertResponseBottlenecksNotRoutedToSocial(slow.strategy);

  // new business foundation — no fabricated Instagram
  const neo = runIntelligencePipeline({
    tenantId: "tenant-a", missionId: "m-new", currentDateIso: NOW, brandBrainTenantId: "tenant-a",
    plannerInput: base({ entryMode: "NEW_BUSINESS", businessSignals: { hasWebsite: false, socialPresenceStrength: "none" } }),
    catalogue,
  });
  assert.equal(neo.diagnosis.foundationStatus, "MISSING_FOUNDATION");
  assert.ok(!neo.audit.executiveSummary.toLowerCase().includes("instagram stats"));

  // healthy business NO_CHANGE_NEEDED
  const fitHealthy = evaluateCommercialFit({ bottlenecks: [], catalogue, entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {} }) });
  assert.equal(fitHealthy.outcome, "NO_CHANGE_NEEDED");

  // smallest covering — prefer starter over business when both cover
  const starterCat = catalogue.filter((c) => c.planKey === "starter" || c.planKey === "business");
  const upsell = evaluateCommercialFit({
    bottlenecks: [{ id: "bn1", code: "WEAK_SEARCH_VISIBILITY", domain: "search_seo", description: "weak seo", evidenceIds: [], severity: "medium", estimatedImpactClass: "high", confidence: "medium", upstreamDependencies: [], downstreamEffects: [], priorityScore: 75, status: "open" }],
    catalogue: starterCat,
    entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {} }),
  });
  assert.equal(upsell.outcome, "SMALLEST_COVERING_OPTION");
  assert.equal(upsell.recommendedPlanKey, "starter");

  // already entitled website_maintenance
  const entitled = evaluateCommercialFit({
    bottlenecks: [{ id: "bn2", code: "MISSING_DIGITAL_FOUNDATION", domain: "website", description: "needs site", evidenceIds: [], severity: "high", estimatedImpactClass: "high", confidence: "medium", upstreamDependencies: [], downstreamEffects: [], priorityScore: 88, status: "open" }],
    catalogue,
    entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: { website_maintenance: 1 }, planTier: "growth" }),
  });
  assert.equal(entitled.outcome, "ALREADY_ENTITLED");
  assert.match(entitled.reason, /USE_CURRENT_ENTITLEMENT/);

  // evidence governance
  const ctx = { tenantId: "tenant-a", missionId: "mission-a", nowIso: NOW };
  const external = resolveClaimStatus({ statement: "market share 40%", requestedStatus: "KNOWN", supportingRecords: [record({ id: "ext", supportedClaims: ["market share 40%"], sourceType: "research_web", isFirstParty: false, retrievedAtIso: NOW })], ctx });
  assert.equal(external.status, "DERIVED");
  assert.ok(external.rejectionReasons.includes("external_claim_cannot_become_known"));
  const weak = resolveClaimStatus({ statement: "maybe slow", requestedStatus: "KNOWN", supportingRecords: [record({ id: "w", supportedClaims: ["other"], confidence: "low" })], ctx });
  assert.notEqual(weak.qualityVerdict, "SUPPORTED");
  assert.throws(() => assertEvidenceTenantScope(record({ id: "x", supportedClaims: ["a"], tenantId: "tenant-b" }), { tenantId: "tenant-a", missionId: "mission-a" }), EvidenceScopeError);
  assert.throws(() => assertTenantScopedEvidence([record({ id: "bad", supportedClaims: ["a"], tenantId: "tenant-b" })], { tenantId: "tenant-a", missionId: "mission-a" }), TenantIsolationError);

  // brand
  const partial = assessBrandReadiness({ business_name: "X" });
  assert.equal(partial.level, "PARTIAL");
  assert.throws(() => assertNoProhibitedClaims("We guarantee 200% ROI"), ProhibitedClaimError);

  // security — billing + capability narrowing
  const rec = evaluateCommercialFit({ bottlenecks: [], catalogue, entitlementSnapshot: snapshotFromContract({ allocationPolicy: "UNKNOWN", packageComposition: [], relevantEntitlements: {} }) });
  assert.throws(() => assertRecommendationCannotMutateBilling({ ...rec, doNotChargeCard: false as true }), BillingMutationError);
  assert.throws(() => narrowCapabilityClasses(["content.shortform"], ["social.publish"]), CapabilityEscalationError);

  // hermes delegation guidance present
  assert.ok(HERMES_INTELLIGENCE_DELEGATION_GUIDANCE.includes("evidence_reviewer"));
  const plan = buildIntelligenceSpecialistRunPlan({ tenantId: "tenant-a", missionId: "m1", researchPlan: audit.researchPlan, strategy: audit.strategy });
  assert.ok(plan.reviewerSeparationEnforced);
  assert.ok(plan.stages.some((s) => s.specialistRole === "final_reviewer"));

  console.log("PASS");
}

run();
`);

console.log("batch4 done");
