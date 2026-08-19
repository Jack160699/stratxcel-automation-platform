import assert from "node:assert/strict";
import {
  gatherGoogleConnectorInsights,
  mergeConnectorInsightSources,
  type AuditConnectorInsights,
  type ConnectorSection,
  type GoogleAnalyticsInsight,
  type GoogleBusinessInsight,
  type GoogleSearchConsoleInsight,
  type SocialAccountInsight,
} from "../connector-insights.ts";
import type { ResearchResult } from "@stratxcel/search-discovery";

console.log("Running StratXcel Audit Connector Insights Test Suite...\n");

function baseResearch(overrides: Partial<ResearchResult> = {}): ResearchResult {
  return {
    status: "PASS",
    question: "Research Example Business",
    summary: "Grounded web evidence.",
    claims: [
      { id: "claim_web_1", text: "Web-only claim.", sourceIds: ["src_web_1"], confidence: null, sourceSupportStatus: "supported", statementKind: "sourced_fact" },
    ],
    sources: [
      { id: "src_web_1", url: "https://example.com", canonicalUrl: "https://example.com", title: "Example Business", domain: "example.com", provider: "google", retrievedAt: "2026-08-01T00:00:00.000Z", searchQueries: ["Example Business"], sourceType: "PRIMARY", verification: "verified" },
    ],
    evidenceArtifactIds: ["src_web_1"],
    summaryArtifactId: "summary_research",
    provider: "google",
    model: "fixture-model",
    searchedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function unavailable<T>(state: ConnectorSection<T>["state"] = "not_connected", reason = "Not connected."): ConnectorSection<T> {
  return { state, reason, retrievedAt: null, timeWindow: null, data: null };
}

function allUnavailableInsights(): AuditConnectorInsights {
  return {
    searchConsole: unavailable<GoogleSearchConsoleInsight>(),
    analytics: unavailable<GoogleAnalyticsInsight>(),
    facebook: unavailable<SocialAccountInsight>(),
    instagram: unavailable<SocialAccountInsight>(),
    googleBusiness: unavailable<GoogleBusinessInsight>(),
  };
}

// Test 1: no connector data available -> research is untouched except for the
// truthful availability ledger; no fabricated sources/claims appear.
(function noConnectorDataLeavesResearchIntact() {
  const research = baseResearch();
  const merged = mergeConnectorInsightSources(research, allUnavailableInsights());
  assert.equal(merged.sources.length, 1, "no connector source should be added");
  assert.equal(merged.claims.length, 1, "no connector claim should be added");
  assert.ok(merged.connectorAvailability, "connectorAvailability must always be recorded");
  assert.equal(merged.connectorAvailability!.length, 5, "all five connector sections must be recorded");
  assert.ok(
    merged.connectorAvailability!.every((r) => r.state === "not_connected"),
    "every unattempted section must report not_connected, never invented as bad data",
  );
  console.log("✓ Test 1: unavailable connectors leave research untouched, states recorded honestly");
})();

// Test 2: an "available" section with real data becomes exactly one cite-able
// source plus deterministic, code-computed claims — additive to existing evidence.
(function availableConnectorBecomesCiteableEvidence() {
  const research = baseResearch();
  const insights: AuditConnectorInsights = {
    ...allUnavailableInsights(),
    searchConsole: {
      state: "available",
      reason: null,
      retrievedAt: "2026-08-15T00:00:00.000Z",
      timeWindow: "2026-07-18 to 2026-08-14",
      data: {
        siteUrl: "https://example.com/",
        totalClicks: 38,
        totalImpressions: 1240,
        averageCtr: 0.0306,
        averagePosition: 14.2,
        topQueries: [{ query: "example widget repair", clicks: 12, impressions: 400, ctr: 0.03, position: 9.1 }],
        topPages: [{ page: "https://example.com/repair", clicks: 20, impressions: 700 }],
      },
    },
  };
  const merged = mergeConnectorInsightSources(research, insights);
  assert.equal(merged.sources.length, 2, "exactly one new source for the available section");
  const gscSource = merged.sources.find((s) => s.id === "connector_search_console");
  assert.ok(gscSource, "search console source must exist with a stable, predictable id");
  assert.equal(gscSource!.provider, "search_console");
  assert.equal(gscSource!.verification, "verified");

  const gscClaims = merged.claims.filter((c) => c.sourceIds.includes("connector_search_console"));
  assert.ok(gscClaims.length >= 1, "at least one claim must cite the new source");
  for (const claim of gscClaims) {
    assert.equal(claim.statementKind, "sourced_fact", "connector claims are stated facts, never AI inference");
    assert.equal(claim.sourceSupportStatus, "supported");
  }
  assert.ok(
    gscClaims.some((c) => c.text.includes("38") && c.text.includes("1240")),
    "claim text must state the real measured numbers, not a vague description",
  );

  const availability = merged.connectorAvailability!.find((r) => r.provider === "search_console");
  assert.equal(availability!.state, "available");
  assert.equal(availability!.timeWindow, "2026-07-18 to 2026-08-14");
  console.log("✓ Test 2: available connector data becomes a cite-able source with deterministic, evidence-backed claims");
})();

// Test 3: existing research evidence (web search + first-party crawl) is never
// dropped or overwritten by merging connector data — strictly additive.
(function mergeIsAdditiveNeverDestructive() {
  const research = baseResearch();
  const insights: AuditConnectorInsights = {
    ...allUnavailableInsights(),
    facebook: {
      state: "available",
      reason: null,
      retrievedAt: "2026-08-15T00:00:00.000Z",
      timeWindow: "last 90 days",
      data: { platform: "facebook", username: "examplebiz", followerCount: 512, recentPostCount: 3, mostRecentPostAt: "2026-08-01T00:00:00.000Z", postWindowDays: 90 },
    },
  };
  const merged = mergeConnectorInsightSources(research, insights);
  assert.ok(merged.sources.some((s) => s.id === "src_web_1"), "original web source must survive the merge");
  assert.ok(merged.claims.some((c) => c.id === "claim_web_1"), "original web claim must survive the merge");
  assert.equal(merged.evidenceArtifactIds.includes("src_web_1"), true);
  assert.equal(merged.evidenceArtifactIds.includes("connector_facebook"), true);
  console.log("✓ Test 3: connector merge is strictly additive to existing evidence");
})();

// Test 4: no_data is recorded distinctly from bad performance — mergeConnectorInsightSources
// must never turn "provider connected but returned zero rows" into a fabricated source.
(function noDataIsDistinctFromBadData() {
  const research = baseResearch();
  const insights: AuditConnectorInsights = {
    ...allUnavailableInsights(),
    analytics: { state: "no_data", reason: "GA4 returned zero organic-search landing pages for the last 28 days.", retrievedAt: "2026-08-15T00:00:00.000Z", timeWindow: "2026-07-18 to 2026-08-14", data: null },
  };
  const merged = mergeConnectorInsightSources(research, insights);
  assert.equal(merged.sources.length, 1, "a no_data section must not produce a source");
  const availability = merged.connectorAvailability!.find((r) => r.provider === "google_analytics");
  assert.equal(availability!.state, "no_data");
  assert.notEqual(availability!.state, "provider_error", "no_data must not be conflated with a fetch failure");
  console.log("✓ Test 4: no_data connector state is recorded distinctly, never fabricated into evidence");
})();

// Test 5: tenant isolation for the self-contained Google (GA4/GSC) gatherer —
// a fake SearchDb proves the tenant_id filter is always applied and two
// tenants never see each other's connection row.
(async function googleGatherIsTenantScoped() {
  // Deliberately kept "connected but not yet configured" (no site_url/property_id) so
  // resolution never crosses into the real network/vault-backed token path — this test
  // proves tenant-scoped row resolution, not the live HTTP fetch (covered separately).
  const connectionsByTenant: Record<string, any> = {
    "tenant-a": {
      tenant_id: "tenant-a",
      status: "connected",
      search_console_site_url: null,
      ga4_property_id: null,
      last_error: null,
    },
    "tenant-b": {
      tenant_id: "tenant-b",
      status: "disconnected",
      search_console_site_url: null,
      ga4_property_id: null,
      last_error: null,
    },
  };
  let observedTenantIds: string[] = [];

  function makeFakeClient() {
    return {
      from(table: string) {
        assert.equal(table, "search_google_connections");
        return {
          select() {
            return this;
          },
          eq(col: string, val: string) {
            if (col === "tenant_id") observedTenantIds.push(val);
            (this as any)._tenantId = val;
            return this;
          },
          async maybeSingle() {
            const tenantId = (this as any)._tenantId;
            return { data: connectionsByTenant[tenantId] ?? null, error: null };
          },
        };
      },
    } as any;
  }

  const resultA = await gatherGoogleConnectorInsights(makeFakeClient(), "tenant-a");
  assert.ok(observedTenantIds.every((id) => id === "tenant-a"), "only tenant-a must ever be queried for tenant-a's gather");
  assert.ok(observedTenantIds.length > 0, "the tenant filter must actually be applied");
  assert.equal(resultA.searchConsole.state, "unavailable", "connected-but-unconfigured must be 'unavailable', not silently 'available' or 'not_connected'");
  assert.equal(resultA.analytics.state, "unavailable");

  observedTenantIds = [];
  const resultB = await gatherGoogleConnectorInsights(makeFakeClient(), "tenant-b");
  assert.ok(observedTenantIds.every((id) => id === "tenant-b"), "only tenant-b must ever be queried for tenant-b's gather");
  assert.equal(resultB.searchConsole.state, "not_connected", "tenant-b's disconnected status must resolve to not_connected");
  assert.equal(resultB.analytics.state, "not_connected");

  console.log("✓ Test 5: Google connector gathering is strictly tenant-scoped, never cross-tenant");
})().then(() => {
  console.log("\n=================================================================");
  console.log("ALL AUDIT CONNECTOR INSIGHTS TESTS PASSED SUCCESSFULLY!");
  console.log("=================================================================");
}).catch((err) => {
  console.error("Audit connector insights test failed:", err);
  process.exit(1);
});
