import assert from "node:assert/strict";
import { analyzeAiSearch, analyzeLocal, analyzeSocial, analyzeTechnicalSeo, buildBusinessOpportunities, classifySearchAction, createUnavailableAnalyticsProvider, createUnavailableSearchConsoleProvider, detectSearchConsoleOpportunities, inferIntent, mapAsset, outcomeInsight, ProviderUnavailableError, safeProviderState, scoreOpportunity, SEARCH_ENTITLEMENTS } from "../index.ts";

const issues = analyzeTechnicalSeo([
  { url: "https://example.in/", status: 200, indexable: true, canonical: "https://example.in/", title: "Home", metaDescription: "Same", h1Count: 1, imageCount: 2, imagesWithAlt: 1, internalLinks: [] },
  { url: "https://example.in/service", status: 404, indexable: false, robots: "noindex", title: "Home", metaDescription: "Same", h1Count: 0, imageCount: 0, imagesWithAlt: 0 },
], { https: true, robotsPresent: true, sitemapPresent: true });
for (const code of ["BROKEN_URL", "NOT_INDEXABLE", "CANONICAL_MISSING", "HEADING_STRUCTURE", "IMAGE_ALT_GAP", "STRUCTURED_DATA_ABSENT", "ORPHAN_PAGE", "TITLE_DUPLICATE", "META_DESCRIPTION_DUPLICATE"]) assert.ok(issues.some((i) => i.code === code), `${code} must be detected`);
assert.ok(issues.every((i) => i.evidence && i.affectedUrl && i.whyItMatters && i.recommendedAction));

// --- Update 20: the real, live false positive found on the real StratXcel
//     tenant -- ROBOTS_MISSING/SITEMAP_MISSING were reported even though
//     https://www.stratxcel.in/robots.txt and /sitemap.xml were both
//     genuinely live and correct (verified directly against production:
//     HTTP 200, real content). Root cause: runtime.ts defaulted
//     robotsPresent/sitemapPresent to `false` ("confirmed missing")
//     whenever the real crawl was skipped (ownership not yet verified --
//     a legitimate safety gate), instead of `null` ("not actually
//     checked"). This pins the fix at the analyzeTechnicalSeo layer: only
//     an explicit `false` (a real crawl ran and genuinely found nothing)
//     may report the finding; `null` (not checked) must report nothing.
{
  const realPage = [{ url: "https://www.stratxcel.in/", status: 200, indexable: true, canonical: "https://www.stratxcel.in/", title: "StratXcel", metaDescription: "Real description", h1Count: 1, imageCount: 0, imagesWithAlt: 0, internalLinks: [] }];

  const uncheckedIssues = analyzeTechnicalSeo(realPage, { https: true, robotsPresent: null, sitemapPresent: null });
  assert.equal(uncheckedIssues.some((i) => i.code === "ROBOTS_MISSING"), false, "robotsPresent: null (not checked, e.g. ownership unverified so the crawl was skipped) must never fabricate a confirmed ROBOTS_MISSING finding");
  assert.equal(uncheckedIssues.some((i) => i.code === "SITEMAP_MISSING"), false, "sitemapPresent: null (not checked) must never fabricate a confirmed SITEMAP_MISSING finding");

  const confirmedMissingIssues = analyzeTechnicalSeo(realPage, { https: true, robotsPresent: false, sitemapPresent: false });
  assert.ok(confirmedMissingIssues.some((i) => i.code === "ROBOTS_MISSING"), "an explicit false (a real crawl genuinely found no robots.txt) must still be reported -- this must stay a real, working check, not be silently disabled");
  assert.ok(confirmedMissingIssues.some((i) => i.code === "SITEMAP_MISSING"), "an explicit false (a real crawl genuinely found no sitemap.xml) must still be reported");

  const confirmedPresentIssues = analyzeTechnicalSeo(realPage, { https: true, robotsPresent: true, sitemapPresent: true });
  assert.equal(confirmedPresentIssues.some((i) => i.code === "ROBOTS_MISSING" || i.code === "SITEMAP_MISSING"), false, "an explicit true (genuinely found present) must never report either finding");
}

const metrics = [
  { query: "dentist near me", page: "/dentist", impressions: 1000, clicks: 10, ctr: .01, position: 8, previousImpressions: 500, previousClicks: 20, conversions: 3 },
  { query: "dentist near me", page: "/dental", impressions: 200, clicks: 4, ctr: .02, position: 12 },
];
const opportunities = detectSearchConsoleOpportunities(metrics);
for (const prefix of ["ctr:", "rank:", "loss:", "rise:", "cannibal:"]) assert.ok(opportunities.some((o) => o.id.startsWith(prefix)));
assert.equal(inferIntent("dentist near me"), "local");
assert.equal(mapAsset("local", false), "location_page");
assert.equal(mapAsset("transactional", true), "existing_service_page");
assert.ok(scoreOpportunity({ impressions: 1000, position: 8, ctrGap: .03, conversions: 2, relevance: 1, businessPriority: 1, competitionOpportunity: .8, assetQuality: .4, intent: "transactional" }) > 60);
const businessOpportunities = buildBusinessOpportunities({ services: ["Dental implants"], locations: ["Raipur"], goals: ["More appointments"], competitors: ["Example Dental"], existingPageTopics: [] });
assert.ok(businessOpportunities.some((o) => o.assetType === "new_service_page"));
assert.ok(businessOpportunities.some((o) => o.assetType === "location_page"));
assert.ok(businessOpportunities.some((o) => o.assetType === "comparison_page"));
assert.equal(businessOpportunities.some((o) => o.assetType === "article"), false, "opportunities must not default to blog articles");

assert.equal(safeProviderState().state, "not_connected");
assert.equal((await createUnavailableSearchConsoleProvider("permission_required").connection()).state, "permission_required");
await assert.rejects(() => createUnavailableSearchConsoleProvider().readSnapshot("tenant-a", "https://example.in"), ProviderUnavailableError);
await assert.rejects(() => createUnavailableAnalyticsProvider().readOutcomes("tenant-a", "https://example.in"), ProviderUnavailableError);
assert.equal(analyzeLocal({}, { provider: "google_business_profile", state: "permission_required", reason: "Scope missing" })[0].title, "Google Business Profile needs connection");
assert.ok(analyzeLocal({ businessName: "A", websiteBusinessName: "B", photos: 0 }, { provider: "google_business_profile", state: "connected", reason: "Authorized" }).length >= 3);
assert.ok(analyzeAiSearch({ url: "/", crawlable: false }).some((o) => o.title === "Crawlability opportunity"));
assert.equal(analyzeSocial({ platform: "facebook", state: "permission_required" })[0].evidence, "permission required");
assert.equal(analyzeSocial({ platform: "instagram", state: "connected", businessName: "A", bio: "Service", location: "Raipur", serviceTerms: ["automation"], recentContentTopics: ["growth"], mediaAltCoverage: 1 }).length, 0);

assert.equal(outcomeInsight({ ranking: 3, organicVisits: 100, conversions: 0 })?.startsWith("This page ranks well"), true);
assert.equal(outcomeInsight({ ranking: 10, organicVisits: 20, conversions: 2 })?.startsWith("This page generates leads"), true);
assert.equal(outcomeInsight({ ranking: 3 }), null, "unknown analytics must not produce fabricated insight");
assert.equal(classifySearchAction("draft_title"), "safe_preparatory");
assert.equal(classifySearchAction("publish_website_content"), "approval_required");
assert.equal(classifySearchAction("complete_oauth"), "manual_provider_required");
assert.equal(SEARCH_ENTITLEMENTS.free.previewOnly, true);
assert.equal(SEARCH_ENTITLEMENTS.growth.aiSearch, true);
assert.equal(SEARCH_ENTITLEMENTS.business.outcomeOptimization, true);
assert.equal(SEARCH_ENTITLEMENTS.scale.locations, 5);
for (const plan of Object.values(SEARCH_ENTITLEMENTS)) assert.equal("apiCalls" in plan || "tokens" in plan, false);
assert.equal("tenantId" in { id: "x" }, false, "records without tenant context must not satisfy the tenant record contract");
console.log("search-discovery.test.ts: ALL PASS (technical, GSC scoring, mapping, local, AI, social, outcomes, providers, approvals, entitlements, truthful unknowns)");
