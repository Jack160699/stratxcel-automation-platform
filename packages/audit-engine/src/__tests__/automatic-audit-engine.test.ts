import assert from "node:assert/strict";
import {
  evaluateAuditReportQuality,
  normalizeAuditReport,
  runAutomaticAuditGeneration,
  type AuditGenerationContext,
  type AuditGenerationStore,
  type AuditReportV1,
  type AuditRunPatch,
  type AuditWorkerOutcome,
} from "../index.ts";
import type { ResearchResult } from "@stratxcel/search-discovery";

function researchResult(overrides: Partial<ResearchResult> = {}): ResearchResult {
  const sources = [
    {
      id: "source_1",
      url: "https://example.com/about",
      canonicalUrl: "https://example.com/about",
      title: "Official business site",
      domain: "example.com",
      provider: "google" as const,
      retrievedAt: "2026-08-12T10:00:00.000Z",
      searchQueries: ["Example Business"],
      sourceType: "PRIMARY" as const,
      verification: "verified" as const,
    },
    {
      id: "source_2",
      url: "https://industry.example.org/market",
      canonicalUrl: "https://industry.example.org/market",
      title: "Industry market reference",
      domain: "industry.example.org",
      provider: "google" as const,
      retrievedAt: "2026-08-12T10:00:00.000Z",
      searchQueries: ["Example Business industry"],
      sourceType: "REPUTABLE_SECONDARY" as const,
      verification: "verified" as const,
    },
    {
      id: "source_3",
      url: "https://directory.example.net/example-business",
      canonicalUrl: "https://directory.example.net/example-business",
      title: "Business directory profile",
      domain: "directory.example.net",
      provider: "openai" as const,
      retrievedAt: "2026-08-12T10:00:00.000Z",
      searchQueries: ["Example Business reviews"],
      sourceType: "SECONDARY" as const,
      verification: "verified" as const,
    },
  ];
  return {
    status: "PASS",
    question: "Research Example Business public presence and market position",
    summary: "Grounded evidence shows a credible offer with discoverability and conversion gaps.",
    claims: sources.map((source, index) => ({
      id: `claim_${index + 1}`,
      text: `Grounded business fact ${index + 1}`,
      sourceIds: [source.id],
      confidence: null,
      sourceSupportStatus: "supported",
      statementKind: "sourced_fact",
    })),
    sources,
    evidenceArtifactIds: sources.map((source) => `audit_artifact:${source.id}`),
    summaryArtifactId: "audit_artifact:summary",
    provider: "google",
    model: "fixture-grounded-model",
    usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsd: 0.12 },
    searchedAt: "2026-08-12T10:00:00.000Z",
    ...overrides,
  };
}

function validReport(research = researchResult()): AuditReportV1 {
  return {
    reportVersion: "automatic_audit_v1",
    generatedAt: "2026-08-12T10:05:00.000Z",
    businessName: "Example Business",
    executiveSummary:
      "Example Business has a credible core offer and visible customer demand, but its public journey does not yet translate that trust into a consistent acquisition and conversion system. The strongest near-term path is to clarify the priority offer, strengthen high-intent pages, and measure each lead source against a focused 90-day growth plan.",
    scores: {
      overall: 74,
      digitalPresence: 70,
      brandClarity: 78,
      growthReadiness: 72,
      conversionReadiness: 66,
    },
    strengths: ["Clear priority service", "Evidence of customer demand"],
    priorityRisks: ["Weak conversion path", "Inconsistent local discoverability"],
    findings: [1, 2, 3].map((index) => ({
      id: `finding_${index}`,
      title: `Evidence-backed finding ${index}`,
      summary: `The public evidence supports a concrete, business-specific finding number ${index}.`,
      impact: index === 1 ? "HIGH" : "MEDIUM",
      evidenceSourceIds: [research.sources[index - 1]!.id],
      confidence: "HIGH",
    })),
    opportunities: [
      { title: "Offer page", rationale: "High-intent demand is not concentrated.", nextStep: "Publish one focused page.", evidenceSourceIds: ["source_1"] },
      { title: "Local proof", rationale: "Third-party visibility can be strengthened.", nextStep: "Standardize listings.", evidenceSourceIds: ["source_3"] },
    ],
    actionPlan: ["Clarify the offer", "Repair the conversion path", "Measure qualified leads"],
    plan: {
      days30: ["Confirm baseline and fix the primary offer page"],
      days60: ["Publish proof and build repeatable acquisition"],
      days90: ["Review conversion data and scale the strongest channel"],
    },
    nextActions: ["Assign an owner", "Book the 30-day checkpoint"],
    sources: research.sources.map((source) => ({
      id: source.id,
      url: source.url,
      title: source.title,
      provider: source.provider,
      retrievedAt: source.retrievedAt,
    })),
    limitations: ["Only public evidence available at the time of research was assessed."],
    generation: { method: "automatic_audit_v1", brandBrainVersion: 2 },
  };
}

function context(): AuditGenerationContext {
  return {
    run: {
      id: "run_1",
      audit_order_id: "order_1",
      tenant_id: "tenant_1",
      brand_brain_version: 2,
      status: "QUEUED",
      stage: "QUEUED",
      attempt_count: 0,
      max_attempts: 3,
      research_data: {},
      report_data: null,
      evidence_artifact_refs: [],
      ai_receipts: [],
      estimated_cost_usd: 0,
      budget_limit_usd: 1.5,
    },
    order: {
      id: "order_1",
      tenant_id: "tenant_1",
      status: "in_review",
      business_name: "Example Business",
      industry: "Professional services",
      website_url: "https://example.com",
      social_links: [],
      deep_dive_answers: {},
      goals_answers: {},
      audit_fee_cents: 99900,
      payment_link_id: "payment_link_1",
    },
    brandBrain: {
      business_name: "Example Business",
      industry: "Professional services",
      audit_order_id: "order_1",
    },
  };
}

class MemoryStore implements AuditGenerationStore {
  current = context();
  updates: AuditRunPatch[] = [];
  completions = 0;
  loadCount = 0;
  onLoad?: (store: MemoryStore) => void;
  completionResult: { success: boolean; reason?: string } = { success: true };

  async loadContext() {
    this.loadCount += 1;
    this.onLoad?.(this);
    return structuredClone(this.current);
  }

  async updateRun(_runId: string, patch: AuditRunPatch) {
    this.updates.push(structuredClone(patch));
    Object.assign(this.current.run, patch);
  }

  async complete() {
    this.completions += 1;
    if (this.completionResult.success) {
      this.current.order.status = "completed";
      this.current.run.status = "COMPLETED";
      this.current.run.stage = "COMPLETE";
    }
    return this.completionResult;
  }
}

function providers(args?: {
  research?: ResearchResult;
  report?: AuditReportV1 | null;
  onResearch?: () => void;
  onReport?: () => void;
}) {
  let researchCalls = 0;
  let reportCalls = 0;
  return {
    researchCalls: () => researchCalls,
    reportCalls: () => reportCalls,
    research: {
      async research() {
        researchCalls += 1;
        args?.onResearch?.();
        return {
          result: args?.research ?? researchResult(),
          receipt: {
            step: "research" as const,
            requestId: "run_1:research:1",
            provider: "google",
            model: "fixture-grounded-model",
            inputTokens: 100,
            outputTokens: 200,
            estimatedCostUsd: 0.12,
            fallbackUsed: false,
            selection: {},
          },
        };
      },
    },
    reports: {
      async generate() {
        reportCalls += 1;
        args?.onReport?.();
        return {
          report: args && "report" in args ? args.report ?? null : validReport(),
          receipt: {
            step: "report_generation" as const,
            requestId: "run_1:report:1",
            provider: "google",
            model: "fixture-report-model",
            inputTokens: 300,
            outputTokens: 600,
            estimatedCostUsd: 0.18,
            fallbackUsed: false,
            selection: {},
          },
        };
      },
    },
  };
}

async function execute(store: MemoryStore, configured = providers(), attemptNumber = 1): Promise<AuditWorkerOutcome> {
  return runAutomaticAuditGeneration(
    { runId: "run_1", attemptNumber, maxAttempts: 3 },
    { store, research: configured.research, reports: configured.reports },
  );
}

{
  const store = new MemoryStore();
  const configured = providers();
  await assert.rejects(
    () => runAutomaticAuditGeneration(
      { runId: "run_1", attemptNumber: 1, maxAttempts: 3, expectedTenantId: "tenant_other" },
      { store, research: configured.research, reports: configured.reports },
    ),
    /audit_generation_tenant_mismatch/,
  );
  assert.equal(store.updates.length, 0);
  assert.equal(configured.researchCalls(), 0);
}

{
  const quality = evaluateAuditReportQuality({
    report: validReport(),
    research: researchResult(),
    businessName: "Example Business",
  });
  assert.equal(quality.outcome, "PASS");
  assert.ok(quality.score >= 0.8);
}

{
  const evidence = researchResult();
  const raw = validReport(evidence);
  const normalized = normalizeAuditReport(raw, {
    businessName: "Example Business",
    brandBrainVersion: 2,
    generatedAt: raw.generatedAt,
    research: evidence,
  });
  assert.ok(normalized);
  assert.equal(normalized?.executiveSummary, raw.executiveSummary);
  assert.equal(normalized?.priorityRisks.length, 2);
  assert.equal(normalized?.actionPlan.length, 3);
}

{
  const store = new MemoryStore();
  const configured = providers();
  const outcome = await execute(store, configured);
  assert.equal(outcome.kind, "COMPLETED");
  assert.equal(store.completions, 1);
  assert.equal(store.current.order.status, "completed");
  assert.equal(configured.researchCalls(), 1);
  assert.equal(configured.reportCalls(), 1);
  assert.equal(store.current.run.estimated_cost_usd, 0.3);
  assert.ok(store.updates.some((patch) => patch.stage === "RESEARCH"));
  assert.ok(store.updates.some((patch) => patch.stage === "QUALITY_GATE"));
  assert.ok(store.updates.some((patch) => patch.stage === "DELIVERY"));
}

{
  const store = new MemoryStore();
  const configured = providers({
    research: researchResult({
      status: "INSUFFICIENT_EVIDENCE",
      sources: [],
      claims: [],
      evidenceArtifactIds: [],
      summaryArtifactId: null,
      reasonCode: "INSUFFICIENT_EVIDENCE",
    }),
  });
  const outcome = await execute(store, configured);
  assert.equal(outcome.kind, "NEEDS_REVIEW");
  assert.equal(store.completions, 0);
  assert.equal(configured.reportCalls(), 0);
  assert.equal(store.current.run.quality_outcome, "INSUFFICIENT_EVIDENCE");
}

{
  const store = new MemoryStore();
  const weak = validReport();
  weak.findings = [];
  weak.opportunities = [];
  weak.plan.days60 = [];
  const outcome = await execute(store, providers({ report: weak }));
  assert.equal(outcome.kind, "NEEDS_REVIEW");
  assert.equal(store.completions, 0);
  assert.equal(store.current.run.quality_outcome, "LOW_CONFIDENCE");
}

{
  const store = new MemoryStore();
  store.current.order.status = "cancelled";
  const configured = providers();
  const outcome = await execute(store, configured);
  assert.equal(outcome.kind, "STOPPED");
  assert.equal(configured.researchCalls(), 0);
  assert.equal(configured.reportCalls(), 0);
  assert.equal(store.completions, 0);
}

{
  const store = new MemoryStore();
  const configured = providers({
    onResearch() {
      store.current.order.status = "refunded";
    },
  });
  const outcome = await execute(store, configured);
  assert.equal(outcome.kind, "STOPPED");
  assert.equal(configured.researchCalls(), 1);
  assert.equal(configured.reportCalls(), 0);
  assert.equal(store.completions, 0);
}

{
  const store = new MemoryStore();
  const configured = providers({
    onReport() {
      store.current.order.status = "cancelled";
    },
  });
  const outcome = await execute(store, configured);
  assert.equal(outcome.kind, "STOPPED");
  assert.equal(configured.reportCalls(), 1);
  assert.equal(store.completions, 0);
}

{
  const store = new MemoryStore();
  const failed = researchResult({ status: "FAILED", reasonCode: "PROVIDER_TIMEOUT" });
  const outcome = await execute(store, providers({ research: failed }), 1);
  assert.equal(outcome.kind, "RETRY");
  assert.equal(store.current.run.failure_code, "PROVIDER_TIMEOUT");
}

{
  const store = new MemoryStore();
  const failed = researchResult({ status: "FAILED", reasonCode: "PROVIDER_TIMEOUT" });
  const outcome = await execute(store, providers({ research: failed }), 3);
  assert.equal(outcome.kind, "NEEDS_REVIEW");
  assert.equal(store.current.run.quality_outcome, "RESEARCH_FAILED");
}

{
  const store = new MemoryStore();
  store.current.run.research_data = researchResult();
  const configured = providers();
  const outcome = await execute(store, configured);
  assert.equal(outcome.kind, "COMPLETED");
  assert.equal(configured.researchCalls(), 0);
  assert.equal(configured.reportCalls(), 1);
}

{
  const store = new MemoryStore();
  store.current.run.status = "COMPLETED";
  store.current.run.stage = "COMPLETE";
  store.current.order.status = "completed";
  const configured = providers();
  const outcome = await execute(store, configured);
  assert.equal(outcome.kind, "COMPLETED");
  assert.equal(store.completions, 0);
  assert.equal(configured.researchCalls(), 0);
}

{
  const report = validReport();
  report.findings[0]!.evidenceSourceIds = ["invented_source"];
  const quality = evaluateAuditReportQuality({
    report,
    research: researchResult(),
    businessName: "Example Business",
  });
  assert.equal(quality.outcome, "LOW_CONFIDENCE");
  assert.ok(quality.reasons.includes("uncited_or_unknown_finding_sources"));
}

{
  const report = validReport();
  const research = researchResult({ disagreements: ["Sources disagree about opening hours"] });
  const quality = evaluateAuditReportQuality({ report, research, businessName: "Example Business" });
  assert.equal(quality.outcome, "LOW_CONFIDENCE");
  assert.ok(quality.reasons.includes("research_disagreement_not_disclosed"));
}

{
  const store = new MemoryStore();
  store.completionResult = { success: false, reason: "audit_cancelled_or_refunded" };
  const outcome = await execute(store);
  assert.equal(outcome.kind, "STOPPED");
  assert.equal(store.current.run.status, "STOPPED");
}

{
  const store = new MemoryStore();
  store.completionResult = { success: false, reason: "quality_pass_required" };
  const outcome = await execute(store);
  assert.equal(outcome.kind, "NEEDS_REVIEW");
  assert.equal(store.current.run.status, "NEEDS_REVIEW");
}

console.log("automatic-audit-engine.test.ts: PASS");
