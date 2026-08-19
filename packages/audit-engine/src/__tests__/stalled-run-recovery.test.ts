import assert from "node:assert/strict";
import {
  evaluateAuditReportQuality,
  runAutomaticAuditGeneration,
  type AuditGenerationContext,
  type AuditGenerationStore,
  type AuditReportV1,
  type AuditRunPatch,
} from "../index.ts";
import type { ResearchResult } from "@stratxcel/search-discovery";

function mockResearchResult(): ResearchResult {
  const sources = [
    {
      id: "src_1",
      url: "https://mysite.com",
      canonicalUrl: "https://mysite.com",
      title: "Official Site",
      domain: "mysite.com",
      provider: "google" as const,
      retrievedAt: "2026-08-18T10:00:00.000Z",
      searchQueries: ["My Business"],
      sourceType: "PRIMARY" as const,
      verification: "verified" as const,
    },
    {
      id: "src_2",
      url: "https://directory.com/my-business",
      canonicalUrl: "https://directory.com/my-business",
      title: "Directory Profile",
      domain: "directory.com",
      provider: "google" as const,
      retrievedAt: "2026-08-18T10:00:00.000Z",
      searchQueries: ["My Business reviews"],
      sourceType: "SECONDARY" as const,
      verification: "verified" as const,
    },
    {
      id: "src_3",
      url: "https://industrynews.org/spotlight",
      canonicalUrl: "https://industrynews.org/spotlight",
      title: "Industry Profile",
      domain: "industrynews.org",
      provider: "google" as const,
      retrievedAt: "2026-08-18T10:00:00.000Z",
      searchQueries: ["My Business news"],
      sourceType: "SECONDARY" as const,
      verification: "verified" as const,
    },
  ];
  return {
    status: "PASS",
    question: "Research My Business",
    summary: "Business has active digital presence and local demand.",
    claims: [
      {
        id: "c_1",
        text: "Business offers verified services.",
        sourceIds: ["src_1"],
        confidence: null,
        sourceSupportStatus: "supported",
        statementKind: "sourced_fact",
      },
    ],
    sources,
    evidenceArtifactIds: ["audit_artifact:src_1", "audit_artifact:src_2", "audit_artifact:src_3"],
    summaryArtifactId: "audit_artifact:summary",
    provider: "google",
    model: "gemini-3.6-flash",
    usage: { inputTokens: 100, outputTokens: 200, estimatedCostUsd: 0.05 },
    searchedAt: "2026-08-18T10:00:00.000Z",
  };
}

function mockReport(research = mockResearchResult()): AuditReportV1 {
  const dimension = (
    score: number | null,
    explanation: string,
    evidenceSourceIds: string[],
  ) => ({ score, explanation, evidenceSourceIds });
  return {
    reportVersion: "automatic_audit_v1",
    generatedAt: "2026-08-18T10:05:00.000Z",
    businessName: "My Business",
    executiveSummary:
      "My Business has established fundamentals with clear opportunities to improve local conversion and search discoverability over 30/60/90 days. The core offer is clear and customer demand is visible.",
    scores: {
      overall: 78,
      digitalPresence: 75,
      brandClarity: 80,
      growthReadiness: 76,
      conversionReadiness: 72,
    },
    overallHealth: {
      score: 78,
      explanation: "Healthy foundation with distinct organic growth channels.",
    },
    categoryScores: {
      brandPositioning: dimension(80, "Clear positioning.", ["src_1"]),
      websiteConversion: dimension(72, "Call to actions are present.", ["src_1"]),
      discoverabilitySeo: dimension(75, "Domain is indexed.", ["src_2"]),
      socialContent: dimension(null, "Not enough data", []),
      leadGeneration: dimension(76, "Inbound channels active.", ["src_1", "src_3"]),
      trustReputation: dimension(78, "Established reputation.", ["src_2"]),
      customerJourney: dimension(74, "Direct user flow.", ["src_1"]),
      automationOperations: dimension(null, "Not enough data", []),
    },
    strengths: ["Clear core offer", "Established web presence"],
    growthProblems: ["Local search visibility can be accelerated", "Conversion paths have gaps"],
    priorityRisks: ["Missed high-intent enquiries", "Unoptimized conversion flow"],
    findings: [
      {
        id: "f_1",
        title: "Website has verified structure",
        summary: "The business website is active and lists core service offerings with clear hierarchy.",
        impact: "HIGH",
        evidenceSourceIds: ["src_1"],
        confidence: "HIGH",
      },
      {
        id: "f_2",
        title: "Local directory presence verified",
        summary: "Directory profiles confirm active business operations and customer reviews.",
        impact: "MEDIUM",
        evidenceSourceIds: ["src_2"],
        confidence: "HIGH",
      },
      {
        id: "f_3",
        title: "Industry references indicate demand",
        summary: "Sector search volume indicates viable near-term customer intent.",
        impact: "MEDIUM",
        evidenceSourceIds: ["src_3"],
        confidence: "MEDIUM",
      },
    ],
    opportunities: [
      {
        title: "Automated WhatsApp response",
        rationale: "Instant lead engagement prevents drop-off.",
        nextStep: "Enable 24/7 reception.",
        evidenceSourceIds: ["src_1"],
      },
    ],
    actionPlan: ["Optimize homepage CTA", "Standardize listings", "Measure conversions"],
    quickWins30Days: ["Fix primary inquiry CTA"],
    plan: {
      days30: ["Establish baseline metrics and update CTA"],
      days60: ["Deploy automated lead reception"],
      days90: ["Scale local acquisition channels"],
    },
    nextActions: ["Review recommendations with team"],
    ownerActions: ["Track weekly lead sources"],
    stratxcelSupport: [
      {
        recommendation: "Deploy automated WhatsApp reception",
        capability: "Operations automation",
        why: "Improves lead response time",
      },
    ],
    sources: research.sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      provider: s.provider,
      retrievedAt: s.retrievedAt,
    })),
    connectorAvailability: [],
    limitations: ["Only public sources available at time of research were analyzed."],
    researchLimitations: ["Only public sources available at time of research were analyzed."],
    generation: { method: "automatic_audit_v1", brandBrainVersion: 2 },
  };
}

class TestStore implements AuditGenerationStore {
  context: AuditGenerationContext;
  updates: AuditRunPatch[] = [];
  completions = 0;

  constructor(initialStatus: "QUEUED" | "RUNNING" = "QUEUED", initialStage: "QUEUED" | "RESEARCH" | "ANALYSIS" = "QUEUED") {
    this.context = {
      run: {
        id: "run_stalled_1",
        audit_order_id: "order_stalled_1",
        tenant_id: "tenant_test_1",
        brand_brain_version: 2,
        status: initialStatus,
        stage: initialStage,
        attempt_count: 1,
        max_attempts: 3,
        research_data: {},
        report_data: null,
        evidence_artifact_refs: [],
        ai_receipts: [],
        estimated_cost_usd: 0,
        budget_limit_usd: 1.5,
        heartbeat_at: new Date(Date.now() - 60_000).toISOString(), // 60s old heartbeat
      },
      order: {
        id: "order_stalled_1",
        tenant_id: "tenant_test_1",
        status: "in_review",
        business_name: "My Business",
        industry: "Professional Services",
        website_url: "https://mysite.com",
        social_links: [],
        deep_dive_answers: {},
        goals_answers: {},
        audit_fee_cents: 0,
        payment_link_id: null,
      },
      brandBrain: {
        business_name: "My Business",
        industry: "Professional Services",
        audit_order_id: "order_stalled_1",
      },
    };
  }

  async loadContext() {
    return structuredClone(this.context);
  }

  async updateRun(_runId: string, patch: AuditRunPatch) {
    this.updates.push(structuredClone(patch));
    Object.assign(this.context.run, patch);
  }

  async complete() {
    this.completions += 1;
    this.context.order.status = "completed";
    this.context.run.status = "COMPLETED";
    this.context.run.stage = "COMPLETE";
    return { success: true };
  }
}

async function runRecoveryTests() {
  // Test 1: Stalled RUNNING audit cleanly resumes and updates heartbeat across all stages
  {
    const store = new TestStore("RUNNING", "RESEARCH");
    const research = mockResearchResult();
    let researchExecuted = false;
    let reportExecuted = false;

    const outcome = await runAutomaticAuditGeneration(
      { runId: "run_stalled_1", attemptNumber: 1, maxAttempts: 3 },
      {
        store,
        research: {
          async research() {
            researchExecuted = true;
            return {
              result: research,
              receipt: {
                step: "research",
                requestId: "r1",
                provider: "google",
                model: "gemini-3.6-flash",
                inputTokens: 100,
                outputTokens: 200,
                estimatedCostUsd: 0.05,
                fallbackUsed: false,
                selection: {},
              },
            };
          },
        },
        reports: {
          async generate() {
            reportExecuted = true;
            return {
              report: mockReport(research),
              receipt: {
                step: "report_generation",
                requestId: "rep1",
                provider: "google",
                model: "gemini-3.6-flash",
                inputTokens: 300,
                outputTokens: 500,
                estimatedCostUsd: 0.1,
                fallbackUsed: false,
                selection: {},
              },
            };
          },
        },
      }
    );

    assert.equal(outcome.kind, "COMPLETED");
    assert.equal(researchExecuted, true);
    assert.equal(reportExecuted, true);
    assert.equal(store.completions, 1);
    assert.equal(store.context.run.status, "COMPLETED");
    assert.equal(store.context.run.stage, "COMPLETE");
    assert.equal(store.context.order.status, "completed");

    // Verify all stage transitions updated heartbeat_at
    const heartbeatUpdates = store.updates.filter((u) => Boolean(u.heartbeat_at));
    assert.ok(heartbeatUpdates.length >= 4, "Heartbeat must be updated at every major pipeline stage");
  }

  // Test 2: Resuming with already persisted research skips re-running research step
  {
    const store = new TestStore("RUNNING", "RESEARCH");
    const existingResearch = mockResearchResult();
    store.context.run.research_data = existingResearch;

    let researchCalled = false;
    let reportCalled = false;

    const outcome = await runAutomaticAuditGeneration(
      { runId: "run_stalled_1", attemptNumber: 1, maxAttempts: 3 },
      {
        store,
        research: {
          async research() {
            researchCalled = true;
            return { result: existingResearch, receipt: null };
          },
        },
        reports: {
          async generate() {
            reportCalled = true;
            return {
              report: mockReport(existingResearch),
              receipt: {
                step: "report_generation",
                requestId: "rep2",
                provider: "google",
                model: "gemini-3.6-flash",
                inputTokens: 300,
                outputTokens: 500,
                estimatedCostUsd: 0.1,
                fallbackUsed: false,
                selection: {},
              },
            };
          },
        },
      }
    );

    assert.equal(outcome.kind, "COMPLETED");
    assert.equal(researchCalled, false, "Must reuse persisted research without re-calling research provider");
    assert.equal(reportCalled, true);
    assert.equal(store.completions, 1);
  }

  console.log("stalled-run-recovery.test.ts: ALL PASS");
}

runRecoveryTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
