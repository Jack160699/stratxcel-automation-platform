import assert from "node:assert/strict";
import { canonicalizeResearchSources } from "../quality.ts";
import { mergeConnectorInsightSources, type AuditConnectorInsights, type ConnectorSection, type SocialAccountInsight } from "../connector-insights.ts";
import { mergeFirstPartyDiscoverySources } from "../first-party-evidence.ts";
import type { ResearchResult } from "@stratxcel/search-discovery";

console.log("Running StratXcel Research Source Canonicalization Test Suite...\n");

// Regression test for a real, live-confirmed production bug (audit run
// 69eb978d-f4f3-481a-8c2c-b30a92327c80): LiveAuditResearchProvider.research()
// used to canonicalize AI-research sources to "src_N_domain" ids *before*
// merging in the first-party website crawl and connector-derived sources
// (Facebook/Instagram/GA4/GSC/Google Business), so the *persisted*
// research_data.sources kept those extra sources' raw ids
// ("connector_facebook", "connector_instagram", "first_party_website").
// LiveAuditReportProvider.generate() independently re-canonicalizes the same
// merged research right before prompting the report-generation model, so the
// model legitimately cited "src_2_facebook.com"-style ids -- which did not
// exist in what was actually persisted, tripping the DB-side citation check
// (complete_automatic_audit_generation_v1) even though the citations were
// genuine and connector-derived. canonicalizeResearchSources must be applied
// once, after every source is merged in, so persisted ids and
// report-generation ids always agree.

function unavailable<T>(): ConnectorSection<T> {
  return { state: "not_connected", reason: "Not connected.", retrievedAt: null, timeWindow: null, data: null };
}

function baseResearch(): ResearchResult {
  return {
    status: "INSUFFICIENT_EVIDENCE",
    question: "Research Example Business",
    summary: "Grounded web evidence.",
    claims: [],
    sources: [],
    evidenceArtifactIds: [],
    summaryArtifactId: null,
    provider: "google",
    model: "fixture-model",
    searchedAt: "2026-08-19T00:00:00.000Z",
  };
}

(function persistedIdsMatchReportGenerationIds() {
  const insights: AuditConnectorInsights = {
    searchConsole: unavailable(),
    analytics: unavailable(),
    facebook: {
      state: "available",
      reason: null,
      retrievedAt: "2026-08-19T10:41:17.877Z",
      timeWindow: "last 90 days",
      data: { platform: "facebook", username: "Stratxcel Solutions", followerCount: 6, recentPostCount: 3, mostRecentPostAt: "2026-08-02T12:30:43.000Z", postWindowDays: 90 },
    } as ConnectorSection<SocialAccountInsight>,
    instagram: {
      state: "available",
      reason: null,
      retrievedAt: "2026-08-19T10:41:17.884Z",
      timeWindow: "last 90 days",
      data: { platform: "instagram", username: "stratxcel.in", followerCount: 41, recentPostCount: 2, mostRecentPostAt: "2026-08-02T11:04:04.000Z", postWindowDays: 90 },
    } as ConnectorSection<SocialAccountInsight>,
    googleBusiness: unavailable(),
  };

  // Reproduce the fixed pipeline order: merge first-party, then connectors,
  // then canonicalize exactly once -- this is the order live.ts now uses.
  const withFirstParty = mergeFirstPartyDiscoverySources(baseResearch(), {
    websiteUrl: "https://stratxcel.in",
    businessName: "Stratxcel",
    pages: [{ url: "https://stratxcel.in", title: "Stratxcel", status: 200 }],
  });
  const withConnectors = mergeConnectorInsightSources(withFirstParty, insights);
  const persisted = canonicalizeResearchSources(withConnectors);

  // Every persisted source id must be in the canonical "src_" scheme --
  // nothing is left over from the raw connector/first-party id scheme.
  for (const source of persisted.sources) {
    assert.ok(source.id.startsWith("src_"), `persisted source id "${source.id}" must be canonicalized`);
  }

  // Simulate LiveAuditReportProvider.generate()'s independent second call --
  // canonicalizeResearchSources must be idempotent, so the ids the report
  // model is prompted with are byte-identical to what was already persisted.
  const reGeneration = canonicalizeResearchSources(persisted);
  assert.deepEqual(
    reGeneration.sources.map((s) => s.id),
    persisted.sources.map((s) => s.id),
    "re-canonicalizing an already-canonical research result must be a no-op",
  );

  // A finding citing the Facebook/Instagram connector evidence, using the ids
  // the report model would actually be given, must resolve against the
  // persisted source set -- this is exactly what
  // complete_automatic_audit_generation_v1's citation check verifies in prod.
  const facebookSourceId = reGeneration.sources.find((s) => s.domain === "facebook.com")?.id;
  const instagramSourceId = reGeneration.sources.find((s) => s.domain === "instagram.com")?.id;
  assert.ok(facebookSourceId, "a facebook.com source must exist after merge+canonicalize");
  assert.ok(instagramSourceId, "an instagram.com source must exist after merge+canonicalize");
  const persistedIds = new Set(persisted.sources.map((s) => s.id));
  assert.ok(persistedIds.has(facebookSourceId!), "facebook finding's evidenceSourceId must resolve against persisted sources");
  assert.ok(persistedIds.has(instagramSourceId!), "instagram finding's evidenceSourceId must resolve against persisted sources");

  console.log("✓ persisted research_data.sources ids already use the canonical \"src_\" scheme");
  console.log("✓ canonicalizeResearchSources is idempotent, so report-generation ids match persisted ids");
  console.log("✓ connector-derived finding citations resolve against what is actually persisted");
})();

console.log("\n=========================================================================");
console.log("RESEARCH SOURCE CANONICALIZATION TEST PASSED SUCCESSFULLY!");
console.log("=========================================================================");
