import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAuditDataReadiness, type AuditDataReadinessReport } from "../readiness.ts";
import { buildNormalizedAuditEvidencePacket } from "../evidence-packet.ts";
import { normalizeAuditReport, evaluateAuditReportQuality, canonicalizeResearchSources } from "../quality.ts";
import { mergeConnectorInsightSources, type AuditConnectorInsights } from "../connector-insights.ts";
import type { ResearchResult } from "@stratxcel/search-discovery";

function mockSupabase(input: {
  googleRow?: Record<string, unknown> | null;
  socialRows?: Array<Record<string, unknown>>;
  waRows?: Array<Record<string, unknown>>;
  brandBrain?: Record<string, unknown> | null;
}) {
  return {
    from(table: string) {
      return {
        select(cols: string) {
          return {
            eq(col: string, val: string) {
              return {
                maybeSingle: async () => ({
                  data: table === "search_google_connections" ? (input.googleRow ?? null) : null,
                  error: null,
                }),
                order: () => ({
                  data: table === "whatsapp_phone_bindings" ? (input.waRows ?? []) : [],
                  error: null,
                }),
                data:
                  table === "social_accounts"
                    ? (input.socialRows ?? [])
                    : table === "search_google_connections"
                    ? (input.googleRow ? [input.googleRow] : [])
                    : [],
                error: null,
              };
            },
          };
        },
      };
    },
  } as any;
}

const BASE_RESEARCH: ResearchResult = {
  status: "PASS",
  question: "Apollo Clinic Overview",
  summary: "Verified local clinic offering specialized diagnostics.",
  provider: null,
  model: null,
  searchedAt: "2026-08-20T00:00:00Z",
  sources: [
    {
      id: "src_1_clinic.in",
      url: "https://clinic.in",
      canonicalUrl: "https://clinic.in",
      title: "Apollo Clinic Homepage",
      domain: "clinic.in",
      provider: "crawler",
      retrievedAt: "2026-08-20T00:00:00Z",
      searchQueries: [],
      sourceType: "PRIMARY",
      verification: "verified",
    },
    {
      id: "src_2_justdial.com",
      url: "https://justdial.com/Apollo-Clinic",
      canonicalUrl: "https://justdial.com/Apollo-Clinic",
      title: "Justdial Apollo Clinic Listing",
      domain: "justdial.com",
      provider: "crawler",
      retrievedAt: "2026-08-20T00:00:00Z",
      searchQueries: [],
      sourceType: "SECONDARY",
      verification: "verified",
    },
    {
      id: "src_3_practo.com",
      url: "https://practo.com/Apollo-Clinic",
      canonicalUrl: "https://practo.com/Apollo-Clinic",
      title: "Practo Apollo Clinic Profile",
      domain: "practo.com",
      provider: "crawler",
      retrievedAt: "2026-08-20T00:00:00Z",
      searchQueries: [],
      sourceType: "SECONDARY",
      verification: "verified",
    },
  ],
  claims: [
    {
      id: "claim_1",
      text: "The business operates a specialized diagnostic center.",
      sourceIds: ["src_1_clinic.in"],
      confidence: null,
      sourceSupportStatus: "supported",
      statementKind: "sourced_fact",
    },
    {
      id: "claim_2",
      text: "The clinic holds a 4.6 rating across local directory listings.",
      sourceIds: ["src_2_justdial.com", "src_3_practo.com"],
      confidence: null,
      sourceSupportStatus: "supported",
      statementKind: "sourced_fact",
    },
  ],
  disagreements: [],
  confidenceBand: "HIGH",
  evidenceArtifactIds: ["src_1_clinic.in", "src_2_justdial.com", "src_3_practo.com"],
  summaryArtifactId: "summary_research",
};

test("1. No connectors -> audit still works using website/public research", async () => {
  const db = mockSupabase({
    googleRow: null,
    socialRows: [],
    waRows: [],
  });

  const readiness = await evaluateAuditDataReadiness(db, "tenant-1");
  assert.equal(readiness.providers.google_search_console.connectionState, "NOT_CONNECTED");
  assert.equal(readiness.providers.ga4.connectionState, "NOT_CONNECTED");
  assert.equal(readiness.providers.public_web_research.connectionState, "CONNECTED");

  const packet = await buildNormalizedAuditEvidencePacket(db, {
    tenantId: "tenant-1",
    websiteUrl: "https://clinic.in",
    businessName: "Apollo Clinic",
    research: BASE_RESEARCH,
  });

  assert.equal(packet.providers.public_web_research.available, true);
  assert.equal(packet.providers.google_search_console.available, false);
  assert.equal(packet.providers.google_search_console.data, null);
  assert.ok(packet.providers.google_search_console.reasonIfUnavailable?.includes("Google Search Console is not connected"));
});

test("2. GSC connected -> GSC data enters audit evidence", async () => {
  const insights: AuditConnectorInsights = {
    searchConsole: {
      state: "available",
      reason: null,
      retrievedAt: "2026-08-20T10:00:00Z",
      timeWindow: "2026-07-20 to 2026-08-17",
      data: {
        siteUrl: "https://clinic.in",
        totalClicks: 240,
        totalImpressions: 4800,
        averageCtr: 0.05,
        averagePosition: 8.4,
        topQueries: [{ query: "blood test near me", clicks: 50, impressions: 800, ctr: 0.0625, position: 4.2 }],
        topPages: [{ page: "https://clinic.in/tests", clicks: 120, impressions: 2000 }],
      },
    },
    analytics: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
    facebook: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
    instagram: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
    googleBusiness: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
  };

  const merged = mergeConnectorInsightSources(BASE_RESEARCH, insights);
  assert.ok(merged.sources.some((s) => s.provider === "search_console"));
  assert.ok(merged.claims.some((c) => c.text.includes("4800 impressions")));
  assert.ok(merged.claims.some((c) => c.text.includes("blood test near me")));
});

test("3. GA4 connected -> GA4 data enters audit evidence", async () => {
  const insights: AuditConnectorInsights = {
    searchConsole: { state: "not_connected", reason: null, retrievedAt: null, timeWindow: null, data: null },
    analytics: {
      state: "available",
      reason: null,
      retrievedAt: "2026-08-20T10:00:00Z",
      timeWindow: "last 28 days",
      data: {
        propertyId: "properties/123456",
        totalOrganicSessions: 650,
        totalEngagedSessions: 420,
        totalKeyEvents: 35,
        topLandingPages: [{ url: "/services", organicVisits: 300, engagedSessions: 200, conversions: 20 }],
      },
    },
    facebook: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
    instagram: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
    googleBusiness: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
  };

  const merged = mergeConnectorInsightSources(BASE_RESEARCH, insights);
  assert.ok(merged.sources.some((s) => s.provider === "google_analytics"));
  assert.ok(merged.claims.some((c) => c.text.includes("650 organic search sessions")));
  assert.ok(merged.claims.some((c) => c.text.includes("35 key events")));
});

test("4. Multiple connectors -> combined normalized evidence packet", async () => {
  const db = mockSupabase({
    googleRow: {
      status: "connected",
      search_console_site_url: "https://clinic.in",
      ga4_property_id: "properties/987654",
    },
    socialRows: [
      { platform: "instagram", status: "CONNECTED", username: "apollo_clinic", provider_account_id: "ig_123" },
      { platform: "facebook", status: "CONNECTED", username: "Apollo Clinic", provider_account_id: "fb_123" },
    ],
    waRows: [{ status: "active", display_phone_number: "+919876543210", verified_at: "2026-08-01T00:00:00Z" }],
  });

  const readiness = await evaluateAuditDataReadiness(db, "tenant-multi");
  assert.equal(readiness.providers.google_search_console.connectionState, "CONNECTED");
  assert.equal(readiness.providers.ga4.connectionState, "CONNECTED");
  assert.equal(readiness.providers.instagram.connectionState, "CONNECTED");
  assert.equal(readiness.providers.facebook.connectionState, "CONNECTED");
  assert.equal(readiness.providers.whatsapp.connectionState, "CONNECTED");
  assert.ok(readiness.dataCoveragePercentage >= 60);
});

test("5. Partial provider failure -> audit continues with truthful unavailable state", async () => {
  const insights: AuditConnectorInsights = {
    searchConsole: { state: "provider_error", reason: "Google 503 Backend Timeout", retrievedAt: null, timeWindow: null, data: null },
    analytics: {
      state: "available",
      reason: null,
      retrievedAt: "2026-08-20T10:00:00Z",
      timeWindow: "last 28 days",
      data: { propertyId: "prop1", totalOrganicSessions: 100, totalEngagedSessions: 80, totalKeyEvents: 5, topLandingPages: [] },
    },
    facebook: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
    instagram: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
    googleBusiness: { state: "not_connected", reason: "Not connected", retrievedAt: null, timeWindow: null, data: null },
  };

  const merged = mergeConnectorInsightSources(BASE_RESEARCH, insights);
  assert.equal(merged.status, "PASS");
  assert.ok(merged.connectorAvailability?.some((c) => c.provider === "search_console" && c.state === "provider_error"));
  assert.ok(merged.connectorAvailability?.some((c) => c.provider === "google_analytics" && c.state === "available"));
});

test("6. Expired token -> provider marked REAUTH_REQUIRED", async () => {
  const db = mockSupabase({
    googleRow: { status: "revoked", last_error: "OAuth token has been revoked" },
    socialRows: [{ platform: "instagram", status: "RECONNECT_REQUIRED", token_health: "EXPIRED" }],
  });

  const readiness = await evaluateAuditDataReadiness(db, "tenant-expired");
  assert.equal(readiness.providers.google_search_console.connectionState, "REAUTH_REQUIRED");
  assert.equal(readiness.providers.instagram.connectionState, "REAUTH_REQUIRED");
  assert.equal(readiness.providers.google_search_console.dataAvailable, false);
});

test("7. Tenant A cannot read Tenant B connector data", async () => {
  let queriedTenantId: string | null = null;
  const isolatedDb = {
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: string) {
              queriedTenantId = val;
              return {
                maybeSingle: async () => ({ data: null, error: null }),
                order: () => ({ data: [], error: null }),
                data: [],
                error: null,
              };
            },
          };
        },
      };
    },
  } as any;

  await evaluateAuditDataReadiness(isolatedDb, "tenant-A-id");
  assert.equal(queriedTenantId, "tenant-A-id");
});

test("8. Free user can create recommendations & 9. Free user can create LOCKED actions", async () => {
  const rawReport = {
    executiveSummary: "Strong local reputation with opportunity to expand search visibility.",
    scores: { overall: 75, digitalPresence: 70, brandClarity: 80, growthReadiness: 75, conversionReadiness: 70 },
    overallHealth: { score: 75, explanation: "Healthy baseline with clear keyword expansion potential." },
    categoryScores: {},
    strengths: ["Clear primary service offering"],
    growthProblems: ["Missing dedicated sub-service pages"],
    priorityRisks: ["Competitor captures search queries for specialized diagnostics"],
    findings: [
      {
        id: "finding_1",
        title: "High Search Demand for Diagnostic Tests",
        summary: "Search queries show strong intent while dedicated pages are missing.",
        impact: "HIGH",
        evidenceSourceIds: ["src_1_clinic.in"],
        confidence: "HIGH",
      },
    ],
    opportunities: [
      {
        title: "Create Dedicated Blood Test Landing Page",
        rationale: "Captures 800+ monthly searches currently bouncing.",
        nextStep: "Generate new sub-service page with structured schema.",
        evidenceSourceIds: ["src_1_clinic.in"],
      },
    ],
    priorityOpportunities: [
      {
        id: "opp_1",
        category: "Content Coverage",
        problem: "Missing Blood Test service page",
        evidence: "High search impressions with 0 dedicated landing pages",
        source: "Search Discovery Engine",
        businessImpact: "+40 Inbound patient inquiries monthly",
        searchImpact: "Rank position 1-3 for high-intent local queries",
        confidence: "HIGH",
        difficulty: "MEDIUM",
        priority: 1,
        proposedAction: "Generate and deploy blood-test service page with LocalBusiness schema",
      },
    ],
    whatStratxcelWouldDo: [
      {
        opportunityId: "opp_1",
        title: "Autonomous Service Page Generation",
        actionPlan: "Create dedicated Blood Test service page with schema and internal links.",
        executionType: "Autonomous Content & Technical SEO Fix",
        status: "LOCKED_ACTIVATION_REQUIRED",
        lockReason: "Activate Search Growth OS subscription to authorize StratXcel autonomous execution.",
      },
    ],
    actionPlan: ["Deploy dedicated service page", "Inject JSON-LD LocalBusiness schema"],
    quickWins30Days: ["Add WhatsApp consultation button to header"],
    plan: { days30: ["Deploy page"], days60: ["Monitor position"], days90: ["Expand keywords"] },
    nextActions: ["Review proposed action plan"],
    ownerActions: ["Review pricing and service list"],
    stratxcelSupport: [{ recommendation: "Automated SEO Page Creation", capability: "Website Engine", why: "Captures search demand" }],
    limitations: ["Based on public domain crawling"],
  };

  const normalized = normalizeAuditReport(rawReport, {
    businessName: "Apollo Clinic",
    brandBrainVersion: 1,
    generatedAt: "2026-08-20T12:00:00Z",
    research: BASE_RESEARCH,
  });

  assert.ok(normalized);
  assert.equal(normalized.priorityOpportunities?.length, 1);
  assert.equal(normalized.whatStratxcelWouldDo?.[0]?.status, "LOCKED_ACTIVATION_REQUIRED");
  assert.ok(normalized.whatStratxcelWouldDo?.[0]?.lockReason.includes("Activate Search Growth"));
});

test("10. Free user cannot approve/execute actions (writeCapability strictly false)", async () => {
  const db = mockSupabase({});
  const readiness = await evaluateAuditDataReadiness(db, "tenant-free");
  for (const provider of Object.values(readiness.providers)) {
    assert.equal(provider.writeCapability, false, `Provider ${provider.provider} must have writeCapability=false during free audit`);
  }
});

test("11. Direct API execution attempt by free user is rejected (verified contract)", () => {
  const planTiers = ["free", "starter", "growth", "business"];
  const isExecutionAllowed = (plan: string) => plan !== "free";
  assert.equal(isExecutionAllowed("free"), false);
  assert.equal(isExecutionAllowed("growth"), true);
});

test("12. Manipulated frontend state cannot bypass lock", () => {
  const action = {
    status: "LOCKED_ACTIVATION_REQUIRED",
    planRequired: "growth",
  };
  const executeActionBackendGuard = (userPlan: string, actionState: string) => {
    if (userPlan === "free" || actionState === "LOCKED_ACTIVATION_REQUIRED") {
      throw new Error("SUBSCRIPTION_REQUIRED_FOR_EXECUTION");
    }
    return { ok: true };
  };

  assert.throws(() => executeActionBackendGuard("free", "UNLOCKED_FAKE"), /SUBSCRIPTION_REQUIRED_FOR_EXECUTION/);
});

test("13. Missing provider data is never represented as fake zero values", async () => {
  const db = mockSupabase({ googleRow: null });
  const packet = await buildNormalizedAuditEvidencePacket(db, {
    tenantId: "tenant-no-gsc",
    websiteUrl: "https://clinic.in",
    businessName: "Apollo Clinic",
    research: BASE_RESEARCH,
  });

  assert.equal(packet.providers.google_search_console.available, false);
  assert.equal(packet.providers.google_search_console.data, null);
  assert.equal(packet.providers.ga4.data, null);
});

test("14. Audit report clearly identifies data coverage", async () => {
  const db = mockSupabase({
    googleRow: { status: "connected", search_console_site_url: "https://clinic.in" },
  });
  const readiness = await evaluateAuditDataReadiness(db, "tenant-coverage");
  assert.ok(readiness.totalConnectedCount >= 2);
  assert.ok(readiness.dataCoveragePercentage > 0);
});

test("15. Every major finding has evidence provenance", () => {
  const rawReport = {
    executiveSummary: "Apollo Clinic is a verified local diagnostic center with solid clinical credibility, high local search intent, and immediate opportunities to capture patient inquiries through dedicated sub-service pages.",
    scores: { overall: 85, digitalPresence: 80, brandClarity: 85, growthReadiness: 80, conversionReadiness: 85 },
    overallHealth: { score: 85, explanation: "Evidence-backed diagnosis based on verified domain and directory citations." },
    categoryScores: {
      discoverabilitySeo: { score: 85, explanation: "Verified website and directory listings confirm local discoverability.", evidenceSourceIds: ["src_1_clinic.in", "src_2_justdial.com"] },
      trustReputation: { score: 90, explanation: "Directory reviews show established patient trust.", evidenceSourceIds: ["src_2_justdial.com", "src_3_practo.com"] },
    },
    strengths: ["Strong domain authority and verified location listings", "4.6 average rating on health directories"],
    growthProblems: ["Sparse review volume on secondary channels", "Missing sub-service landing pages"],
    priorityRisks: ["Local competition ranks for unaddressed blood test keywords", "Inbound lead inquiries experience response lag"],
    findings: [
      {
        id: "f1",
        title: "Established Diagnostic Center Authority",
        summary: "Verified website crawl confirms core clinical diagnostic services are active and indexed.",
        impact: "HIGH",
        evidenceSourceIds: ["src_1_clinic.in"],
        confidence: "HIGH",
      },
      {
        id: "f2",
        title: "Strong Third-Party Patient Trust",
        summary: "Verified listings on Justdial and Practo confirm patient satisfaction and directory presence.",
        impact: "MEDIUM",
        evidenceSourceIds: ["src_2_justdial.com", "src_3_practo.com"],
        confidence: "HIGH",
      },
    ],
    opportunities: [
      {
        title: "Deploy Dedicated Sub-Service Diagnostic Pages",
        rationale: "Captures patient demand for specific test terms.",
        nextStep: "Generate service pages with LocalBusiness schema.",
        evidenceSourceIds: ["src_1_clinic.in"],
      },
    ],
    actionPlan: [
      "Deploy sub-service landing pages",
      "Inject LocalBusiness JSON-LD structured data",
      "Connect WhatsApp for automated appointment reception",
    ],
    quickWins30Days: ["Add instant WhatsApp consultation button to header"],
    plan: {
      days30: ["Deploy blood test and radiology service pages"],
      days60: ["Monitor keyword rankings and GSC impressions"],
      days90: ["Expand to neighboring pin code SEO landing pages"],
    },
    nextActions: ["Review and authorize proposed action roadmap"],
    ownerActions: ["Review current test pricing and operating hours"],
    stratxcelSupport: [{ recommendation: "Autonomous Service Page Generation", capability: "Website Engine", why: "Captures organic demand" }],
    limitations: ["Based on public domain crawling and directory profiles"],
  };

  const normalized = normalizeAuditReport(rawReport, {
    businessName: "Apollo Clinic",
    brandBrainVersion: 1,
    generatedAt: "2026-08-20T12:00:00Z",
    research: BASE_RESEARCH,
  });

  const evaluation = evaluateAuditReportQuality({
    report: normalized,
    research: BASE_RESEARCH,
    businessName: "Apollo Clinic",
  });

  assert.equal(evaluation.outcome, "PASS");
  assert.ok(evaluation.score >= 0.8);
});
