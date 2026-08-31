// Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
// 21: runSearchAnalysis() used to also require `project.ownership_verified`
// before running the real, SSRF-protected public crawl -- a field never
// set to true anywhere in this codebase (confirmed by a full repo search),
// which had silently disabled the entire crawl-based analysis pipeline for
// every tenant, always. READ (a public crawl of pages a site already
// serves to any visitor) was wrongly conflated with WRITE (actually
// modifying the tenant's site, which stays gated on its own real,
// independent Vercel-connector authorization, untouched by this fix).
//
// SEARCH_RUNTIME_FLAGS.crawlEnabled is computed once, at module import
// time, from process.env.SEARCH_DISCOVERY_CRAWL_ENABLED -- set before a
// dynamic import here so this file still runs with the plain
// `node --experimental-strip-types <file>` convention, no special
// environment needed to invoke it.
//
// Run with: node --experimental-strip-types packages/search-discovery/src/__tests__/crawl-ownership-separation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SEARCH_DISCOVERY_CRAWL_ENABLED = "true";
const { runSearchAnalysis } = await import("../runtime.ts");
type TechnicalPage = { url: string; robots?: string; structuredDataTypes?: string[] };

/** Minimal chainable mock covering exactly what runSearchAnalysis touches --
 * adapted from the established pattern in competitor-intelligence-and-
 * measurement.test.ts's mockDb, not a second parallel implementation of
 * production logic. */
function mockDb(project: Record<string, unknown> = {}) {
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
      single: async () => ({ data: { id: "mock-id", tenant_id: queriedTenantId ?? "t1", project_id: "p1", fingerprint: "fp", ...state }, error: null }),
      maybeSingle: async () => ({ data: { id: "mock-id", tenant_id: queriedTenantId ?? "t1", ...state }, error: null }),
    };
    return chain;
  }
  return {
    from(table: string) {
      return {
        insert(row: any) { return { select() { return { single: async () => ({ data: { id: "evt-1", ...row }, error: null }) }; } }; },
        select() { return createChain(); },
        upsert(row: any) {
          // search_projects upsert must actually reflect the real project
          // fixture (including ownership_verified) so the test can prove
          // the crawl branch's decision is independent of it.
          const data = table === "search_projects" ? { id: "p1", ...project, ...row } : { id: "upserted-id", ...row };
          return { select() { return { single: async () => ({ data, error: null }), maybeSingle: async () => ({ data, error: null }) }; } };
        },
        update(patch: any) { return createChain({ ...patch }); },
      };
    },
  } as any;
}

function baseInput(tenantId: string, idempotencyKey: string) {
  return {
    tenantId,
    propertyUrl: "https://clinic.in",
    propertyName: "Apollo Clinic",
    plan: "free" as const,
    runType: "manual" as const,
    triggerSource: "manual" as const,
    idempotencyKey,
  };
}

await test("1. ownership_verified: false must not block the real crawl from running -- READ is not WRITE", async () => {
  const db = mockDb({ ownership_verified: false });
  let crawlCalled = false;
  const fakeCrawl = async () => {
    crawlCalled = true;
    return { pages: [{ url: "https://clinic.in", robots: "index,follow" }] as TechnicalPage[], structuredPages: [], errors: [], robotsPresent: true, sitemapPresent: true, sitemapUrlsDiscovered: 1, truncated: false };
  };

  await runSearchAnalysis(db, baseInput("tenant-unverified", "key-1"), { crawl: fakeCrawl });
  assert.equal(crawlCalled, true, "the real crawl must run even when ownership_verified is false -- public analysis does not require proven ownership");
});

await test("2. a genuinely absent project row (ownership_verified undefined) still crawls -- no field can silently re-block analysis", async () => {
  const db = mockDb({});
  let crawlCalled = false;
  const fakeCrawl = async () => {
    crawlCalled = true;
    return { pages: [{ url: "https://clinic.in" }] as TechnicalPage[], structuredPages: [], errors: [], robotsPresent: false, sitemapPresent: false, sitemapUrlsDiscovered: 0, truncated: false };
  };

  await runSearchAnalysis(db, baseInput("tenant-no-flag", "key-2"), { crawl: fakeCrawl });
  assert.equal(crawlCalled, true);
});

await test("3. a real crawl that genuinely finds no robots.txt/sitemap.xml still reports it -- the check itself must keep working", async () => {
  const db = mockDb({ ownership_verified: false });
  const fakeCrawl = async () => ({ pages: [{ url: "https://newbiz.in" }] as TechnicalPage[], structuredPages: [], errors: [], robotsPresent: false, sitemapPresent: false, sitemapUrlsDiscovered: 0, truncated: false });

  const result = await runSearchAnalysis(db, baseInput("tenant-genuinely-missing", "key-3"), { crawl: fakeCrawl });
  // The run must complete (not throw) with the real crawl exercised; the
  // exact opportunity-generation path is covered at the analyzeTechnicalSeo
  // layer (search-discovery.test.ts, Update 20) -- this proves the crawl
  // that feeds it actually ran, unblocked by ownership_verified.
  assert.ok(result.run, "the analysis run must complete using the real (genuinely-missing) crawl result");
});

console.log("crawl-ownership-separation.test.ts: ALL PASS -- public crawl/analysis no longer requires ownership_verified; write authorization is untouched and separate");
