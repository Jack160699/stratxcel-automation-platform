// Regression for the real, live defect found and fixed
// (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 17): a tenant
// who already connected Google Search Console (a real, verified website
// source) but had never run a Search Growth analysis yet was always shown
// an empty "Connect your website to start" field -- even though the
// platform genuinely already knew their website. Confirmed live against
// the real StratXcel tenant: search_projects had zero rows, but
// search_google_connections.search_console_site_url was already
// "https://www.stratxcel.in/".
//
// Run with: node --experimental-strip-types packages/search-discovery/src/dashboard/__tests__/detected-website.test.ts
import assert from "node:assert/strict";
import { getSearchGrowthDashboardData } from "../aggregator.ts";
import type { SearchDb } from "../../repository.ts";

/** Minimal chainable fake matching how the aggregator queries each table --
 * every builder method returns the same thenable object, which resolves to
 * { data, error: null } for the table it was built from. Covers both
 * .maybeSingle()-terminated chains and the plain .limit(10) actions chain. */
function fakeDb(rows: Partial<Record<string, unknown>>): SearchDb {
  return {
    from(table: string) {
      const data = table in rows ? rows[table] : null;
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => chain,
        then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data, error: null }),
      };
      return chain;
    },
  };
}

async function testDetectedWhenNoProjectButSearchConsoleConnected() {
  const db = fakeDb({
    search_projects: null, // the real StratXcel tenant's exact live state before this fix
    search_google_connections: { search_console_site_url: "https://www.stratxcel.in/" },
  });
  const result = await getSearchGrowthDashboardData(db, "tenant-1");
  assert.equal(result.hasProject, false, "no search_projects row -> hasProject must stay false, exactly as before");
  assert.equal(result.detectedWebsiteUrl, "https://www.stratxcel.in", "must detect and normalize the already-connected Search Console property");
  console.log("detected-website.test.ts: no project + connected Search Console -> detectedWebsiteUrl populated, normalized — PASS");
}

async function testNullWhenNoConnectionExists() {
  const db = fakeDb({ search_projects: null, search_google_connections: null });
  const result = await getSearchGrowthDashboardData(db, "tenant-1");
  assert.equal(result.hasProject, false);
  assert.equal(result.detectedWebsiteUrl, null, "genuinely no known website -> must stay null, never fabricated");
  console.log("detected-website.test.ts: no project + no connection -> detectedWebsiteUrl null, not fabricated — PASS");
}

async function testNullOnceRealProjectExists() {
  const db = fakeDb({
    search_projects: { name: "StratXcel", property_url: "https://www.stratxcel.in" },
    search_google_connections: { search_console_site_url: "https://a-different-site.example/" },
  });
  const result = await getSearchGrowthDashboardData(db, "tenant-1");
  assert.equal(result.hasProject, true);
  assert.equal(result.propertyUrl, "https://www.stratxcel.in", "the real search_projects row remains the authoritative source");
  assert.equal(result.detectedWebsiteUrl, null, "once a real project exists, detectedWebsiteUrl must not surface/override it with a different connected property");
  console.log("detected-website.test.ts: real project already exists -> detectedWebsiteUrl null, real propertyUrl untouched — PASS");
}

async function testInvalidConnectedUrlDoesNotCrashOrFabricate() {
  const db = fakeDb({ search_projects: null, search_google_connections: { search_console_site_url: "not a real url" } });
  const result = await getSearchGrowthDashboardData(db, "tenant-1");
  assert.equal(result.detectedWebsiteUrl, null, "an unparseable stored value must fail closed to null, never crash or pass through garbage");
  console.log("detected-website.test.ts: unparseable stored Search Console URL -> fails closed to null — PASS");
}

async function run() {
  await testDetectedWhenNoProjectButSearchConsoleConnected();
  await testNullWhenNoConnectionExists();
  await testNullOnceRealProjectExists();
  await testInvalidConnectedUrlDoesNotCrashOrFabricate();
  console.log("detected-website.test.ts: ALL PASS");
}

run();
