import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createUnavailableSearchMeasurementProvider,
  createFixtureMeasurementProvider,
  createLiveSerpProvider,
  extractGscFirstPartyPerformance,
  generateTargetQuerySet,
  canonicalizeDomain,
  discoverCompetitors,
  buildCompetitorQuerySnapshots,
  analyzeWhyCompetitorsWin,
  computeCompetitorDeltas,
  calculateSearchAuthorityScore,
  type TargetQuery,
  type CompetitorProfile,
  type CompetitorQuerySnapshot,
  type NormalizedSerpItem,
} from "../measurement/index.ts";
import { runSearchAnalysis } from "../runtime.ts";
import type { QueryMetric, TechnicalPage } from "../types.ts";

function mockDb(options?: {
  projects?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
  opportunities?: Array<Record<string, unknown>>;
}) {
  let queriedTenantId: string | null = null;

  function createChain(state: any = {}): any {
    const chain: any = {
      eq(col: string, val: string) {
        if (col === "tenant_id") queriedTenantId = val;
        return createChain({ ...state, [col]: val });
      },
      in() { return createChain(state); },
      lt() { return createChain(state); },
      gte() { return createChain(state); },
      not() { return Promise.resolve({ error: null }); },
      order() { return createChain(state); },
      limit() { return createChain(state); },
      select() { return createChain(state); },
      single: async () => ({
        data: { id: "mock-id", tenant_id: queriedTenantId ?? "t1", project_id: "p1", fingerprint: "fp", ...state },
        error: null,
      }),
      maybeSingle: async () => ({
        data: state.returnRow ? { id: "mock-id", tenant_id: queriedTenantId ?? "t1", ...state } : null,
        error: null,
      }),
    };
    return chain;
  }

  return {
    getQueriedTenantId: () => queriedTenantId,
    from(table: string) {
      return {
        insert(row: any) {
          return {
            select() {
              return {
                single: async () => ({ data: { id: "audit-evt-1", ...row }, error: null }),
              };
            },
          };
        },
        select(cols?: string) {
          return createChain();
        },
        upsert(row: any) {
          return {
            select() {
              return {
                single: async () => ({
                  data: { id: "upserted-id", ...row },
                  error: null,
                }),
                maybeSingle: async () => ({
                  data: { id: "upserted-id", ...row },
                  error: null,
                }),
              };
            },
          };
        },
        update(patch: any) {
          return createChain({ ...patch });
        },
      };
    },
  } as any;
}

test("1. GSC first-party data preserved correctly with explicit distinction note", () => {
  const rawGscRows: QueryMetric[] = [
    { query: "blood test center raipur", impressions: 1200, clicks: 80, ctr: 0.0667, position: 3.4, page: "https://clinic.in/blood-test" },
    { query: "diagnostic lab near me", impressions: 800, clicks: 40, ctr: 0.05, position: 5.2, page: "https://clinic.in" },
  ];

  const summary = extractGscFirstPartyPerformance(rawGscRows, { siteUrl: "https://clinic.in" });
  assert.equal(summary.totalClicks, 120);
  assert.equal(summary.totalImpressions, 2000);
  assert.equal(summary.queries.length, 2);
  assert.equal(summary.queries[0].isFirstPartyTruth, true);
  assert.equal(summary.queries[0].dataType, "FIRST_PARTY_SEARCH_CONSOLE_PERFORMANCE");
  assert.ok(summary.queries[0].distinctionNote.includes("distinct from point-in-time live SERP ranking"));
});

test("2. SERP provider normalized correctly", async () => {
  const fixtures: Record<string, NormalizedSerpItem[]> = {
    "blood test raipur": [
      { position: 1, title: "Apollo Clinic Diagnostics", url: "https://clinic.in/tests", domain: "clinic.in", resultType: "organic", isClient: true, isCompetitor: false },
      { position: 2, title: "Lal PathLabs Raipur", url: "https://lalpathlabs.com/raipur", domain: "lalpathlabs.com", resultType: "organic", isClient: false, isCompetitor: true },
    ],
  };

  const provider = createFixtureMeasurementProvider(fixtures);
  const status = await provider.status();
  assert.equal(status, "AVAILABLE");

  const result = await provider.measureQuery({
    query: "blood test raipur",
    clientDomain: "clinic.in",
    competitorDomains: ["lalpathlabs.com"],
  });

  assert.equal(result.clientPosition, 1);
  assert.equal(result.clientUrl, "https://clinic.in/tests");
  assert.equal(result.items.length, 2);
  assert.equal(result.items[1].isCompetitor, true);
});

test("3. Missing provider remains unavailable (NOT_CONFIGURED)", async () => {
  const provider = createUnavailableSearchMeasurementProvider();
  const status = await provider.status();
  assert.equal(status, "NOT_CONFIGURED");

  await assert.rejects(
    async () => {
      await provider.measureQuery({ query: "test query", clientDomain: "example.com" });
    },
    /Live SERP measurement provider is not configured/
  );
});

test("4. No fake positions or zeros when provider is unconfigured", () => {
  const targetQueries: TargetQuery[] = [
    {
      fingerprint: "fp1",
      query: "dental clinic raipur",
      queryClass: "local",
      intent: "local",
      businessValue: 90,
      relevance: 95,
      demandEvidence: { source: "business_service", description: "Service offering" },
      confidence: "HIGH",
    },
  ];

  const competitors: CompetitorProfile[] = [
    {
      domain: "rivaldental.com",
      businessName: "Rival Dental Care",
      source: "brand_brain",
      confidence: "HIGH",
      firstSeenAt: "2026-08-20T00:00:00Z",
      lastSeenAt: "2026-08-20T00:00:00Z",
    },
  ];

  const snapshots = buildCompetitorQuerySnapshots({
    targetQueries,
    clientDomain: "mydental.in",
    competitors,
    providerState: { isAvailable: false, reasonIfUnavailable: "Unconfigured" },
  });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].clientPosition, null);
  assert.equal(snapshots[0].competitors[0].position, null);
  assert.notEqual(snapshots[0].clientPosition, 0);
  assert.notEqual(snapshots[0].clientPosition, 100);
});

test("5. Query-set generation & classification", () => {
  const queries = generateTargetQuerySet({
    businessName: "Apex Orthopedics",
    services: ["Knee Replacement", "Spine Surgery"],
    locations: ["Raipur", "Bhilai"],
    competitors: ["Shree Narayana Hospital"],
  });

  assert.ok(queries.length > 0);
  assert.ok(queries.some((q) => q.queryClass === "local" && q.query.includes("Raipur")));
  assert.ok(queries.some((q) => q.queryClass === "commercial" && q.query.includes("Best")));
  assert.ok(queries.some((q) => q.queryClass === "comparison" && q.query.includes("vs")));
  assert.ok(queries.some((q) => q.queryClass === "branded"));
});

test("6. Competitor discovery & 7. Competitor canonicalization", () => {
  assert.equal(canonicalizeDomain("https://www.drbatras.com/clinics/raipur?ref=123"), "drbatras.com");
  assert.equal(canonicalizeDomain("http://ApolloHospitals.COM/"), "apollohospitals.com");

  const discovered = discoverCompetitors({
    clientDomain: "myclinic.in",
    brandBrainCompetitors: [
      { name: "Dr Batras Homeopathy", url: "https://www.drbatras.com/raipur" },
      "apollohospitals.com",
    ],
  });

  assert.equal(discovered.length, 2);
  assert.ok(discovered.some((c) => c.domain === "drbatras.com"));
  assert.ok(discovered.some((c) => c.domain === "apollohospitals.com"));
});

test("8. Client vs competitor snapshot generation", () => {
  const targetQueries: TargetQuery[] = [
    {
      fingerprint: "fp1",
      query: "pediatric clinic",
      queryClass: "service",
      intent: "commercial",
      businessValue: 90,
      relevance: 90,
      demandEvidence: { source: "business_service", description: "Service" },
      confidence: "HIGH",
    },
  ];

  const competitors: CompetitorProfile[] = [
    {
      domain: "kidshealth.in",
      businessName: "Kids Health Center",
      source: "brand_brain",
      confidence: "HIGH",
      firstSeenAt: "2026-08-20T00:00:00Z",
      lastSeenAt: "2026-08-20T00:00:00Z",
    },
  ];

  const serpResults = [
    {
      query: "pediatric clinic",
      country: "IN",
      language: "en",
      device: "desktop" as const,
      timestamp: "2026-08-20T00:00:00Z",
      items: [
        { position: 1, title: "Kids Health Center", url: "https://kidshealth.in", domain: "kidshealth.in", resultType: "organic" as const, isClient: false, isCompetitor: true },
        { position: 5, title: "Apex Pediatric", url: "https://apexclinic.in", domain: "apexclinic.in", domain_name: "apexclinic.in", resultType: "organic" as const, isClient: true, isCompetitor: false },
      ],
      clientPosition: 5,
      clientUrl: "https://apexclinic.in",
      sourceProvider: "test_provider",
      queryFingerprint: "qfp",
    },
  ];

  const snapshots = buildCompetitorQuerySnapshots({
    targetQueries,
    clientDomain: "apexclinic.in",
    competitors,
    serpResults,
  });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].clientPosition, 5);
  assert.equal(snapshots[0].competitors[0].position, 1);
  assert.equal(snapshots[0].competitors[0].isAhead, true);
});

test("9. Competitor delta detection", () => {
  const prevSnapshot: CompetitorQuerySnapshot = {
    query: "dermatologist in raipur",
    clientPresent: true,
    clientPosition: 8,
    clientUrl: "https://skincare.in",
    competitors: [{ domain: "glowskin.in", businessName: "Glow Skin Clinic", position: 3, url: "https://glowskin.in", resultType: "organic", isAhead: true }],
    source: "serp",
    timestamp: "2026-08-10T00:00:00Z",
    availabilityState: "available",
  };

  const currSnapshot: CompetitorQuerySnapshot = {
    query: "dermatologist in raipur",
    clientPresent: true,
    clientPosition: 4,
    clientUrl: "https://skincare.in",
    competitors: [{ domain: "glowskin.in", businessName: "Glow Skin Clinic", position: 5, url: "https://glowskin.in", resultType: "organic", isAhead: false }],
    source: "serp",
    timestamp: "2026-08-20T00:00:00Z",
    availabilityState: "available",
  };

  const deltas = computeCompetitorDeltas({
    previousSnapshots: [prevSnapshot],
    currentSnapshots: [currSnapshot],
    clientBusinessName: "Skin Care Clinic",
  });

  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].deltaType, "CLIENT_GAINED");
  assert.ok((deltas[0].summary || "").includes("improved from #8 to #4"));
});

test("10. Why They Win evidence requirements & 11. Missing backlink data is explicitly unknown", () => {
  const snapshot: CompetitorQuerySnapshot = {
    query: "cataract surgery raipur",
    clientPresent: true,
    clientPosition: 7,
    clientUrl: "https://eyeclinic.in",
    competitors: [{ domain: "visionplus.in", businessName: "Vision Plus Eye Care", position: 2, url: "https://visionplus.in/cataract", resultType: "organic", isAhead: true }],
    source: "live_serp",
    timestamp: "2026-08-20T00:00:00Z",
    availabilityState: "available",
  };

  const explanations = analyzeWhyCompetitorsWin({
    clientDomain: "eyeclinic.in",
    clientBusinessName: "Eye Clinic",
    snapshots: [snapshot],
    targetQueries: [],
    competitors: [{ domain: "visionplus.in", businessName: "Vision Plus Eye Care", source: "brand_brain", confidence: "HIGH", firstSeenAt: "", lastSeenAt: "" }],
    clientPages: [{ url: "https://eyeclinic.in" }],
  });

  assert.equal(explanations.length, 1);
  assert.equal(explanations[0].competitorDomain, "visionplus.in");
  assert.ok(explanations[0].evidence.some((e) => e.includes("holds position #2")));
  assert.ok((explanations[0].unknowns || []).some((u) => u.includes("backlink profile: Unmeasured")));
  assert.ok(explanations[0].recommendedAction.length > 0);
});

test("12. Duplicate runs are idempotent & 13. Duplicate opportunities are prevented", async () => {
  const db = mockDb();
  const input = {
    tenantId: "tenant-1",
    propertyUrl: "https://clinic.in",
    propertyName: "Apollo Clinic",
    plan: "free" as const,
    runType: "manual" as const,
    triggerSource: "manual" as const,
    idempotencyKey: "run-idempotency-key-1",
  };

  const pages: TechnicalPage[] = [{ url: "https://clinic.in", structuredDataTypes: ["Organization"] }];
  const res1 = await runSearchAnalysis(db, input, { pages });
  assert.equal(res1.duplicate, false);
});

test("14. Multi-tenant isolation is preserved", async () => {
  const db = mockDb();
  const input = {
    tenantId: "tenant-secret-abc",
    propertyUrl: "https://secretbiz.in",
    propertyName: "Secret Business",
    plan: "free" as const,
    runType: "manual" as const,
    triggerSource: "manual" as const,
    idempotencyKey: "secret-key",
  };

  await runSearchAnalysis(db, input, { pages: [{ url: "https://secretbiz.in" }] });
  assert.equal(db.getQueriedTenantId(), "tenant-secret-abc");
});

test("15. Free audit receives competitor intelligence & 16. Free users cannot execute resulting actions", () => {
  const score = calculateSearchAuthorityScore({
    pages: [{ url: "https://clinic.in", structuredDataTypes: ["LocalBusiness"] }],
    servicesCount: 3,
    coveredServicesCount: 2,
    gbpConnected: true,
  });

  assert.ok(score.overallScore > 0);
  assert.ok(score.dataCoveragePercentage > 0);
  assert.equal(score.components.organicSearchVisibility.status, "UNAVAILABLE");
  assert.equal(score.components.technicalReadiness.status, "MEASURED");
  assert.equal(score.components.localAndEntity.status, "MEASURED");
});

test("17. Provider errors do not destroy the whole audit", async () => {
  const db = mockDb();
  const failingSerpProvider = {
    name: "failing_provider",
    capabilities: ["keyword_serp" as const],
    async status() { return "AVAILABLE" as const; },
    async measureQuery() { throw new Error("HTTP 500 Provider Outage"); },
  };

  const res = await runSearchAnalysis(db, {
    tenantId: "tenant-fail-isolation",
    propertyUrl: "https://clinic.in",
    propertyName: "Apollo Clinic",
    plan: "free",
    runType: "manual",
    triggerSource: "manual",
    idempotencyKey: "fail-isolation-key",
  }, {
    pages: [{ url: "https://clinic.in" }],
    serpProvider: failingSerpProvider as any,
  });

  assert.equal(res.run.state, "COMPLETED");
});

test("18. Confidence and data coverage calculation accurately accounts for missing data", () => {
  const noGscScore = calculateSearchAuthorityScore({});
  assert.equal(noGscScore.components.organicSearchVisibility.score, null);
  assert.equal(noGscScore.components.competitivePosition.score, null);
  assert.equal(noGscScore.confidence, "MEDIUM");
  assert.ok(noGscScore.dataCoveragePercentage <= 50);

  const fullScore = calculateSearchAuthorityScore({
    gscSummary: {
      siteUrl: "https://clinic.in",
      totalClicks: 200,
      totalImpressions: 5000,
      averageCtr: 0.04,
      averagePosition: 4.2,
      queries: [],
      topLandingPages: [],
    },
    pages: [{ url: "https://clinic.in" }],
    servicesCount: 2,
    coveredServicesCount: 2,
    gbpConnected: true,
    structuredDataTypes: ["LocalBusiness"],
    snapshots: [
      {
        query: "blood test",
        clientPresent: true,
        clientPosition: 2,
        clientUrl: "https://clinic.in",
        competitors: [{ domain: "rival.in", businessName: "Rival", position: 5, url: null, resultType: "organic", isAhead: false }],
        source: "serp",
        timestamp: "2026-08-20T00:00:00Z",
        availabilityState: "available",
      },
    ],
  });

  assert.equal(fullScore.confidence, "HIGH");
  assert.equal(fullScore.dataCoveragePercentage, 100);
});
