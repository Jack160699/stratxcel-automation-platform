import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const state = read("app", "api", "platform", "search", "route.ts"); const run = read("app", "api", "platform", "search", "run", "route.ts"); const scheduler = read("app", "api", "internal", "search", "scheduler", "route.ts"); const ui = read("app", "app", "search", "page.tsx"); const repository = read("packages", "search-discovery", "src", "repository.ts");
for (const route of [state, run]) assert.match(route, /requireTenant(Read)?Context/, "customer routes must authenticate tenant membership");
assert.match(state, /ctx\.supabase/, "reads must use authenticated RLS client"); assert.match(run, /mission:create/); assert.match(run, /SEARCH_RATE_LIMITED/); assert.match(run, /stableFingerprint/); assert.match(run, /getTenantServiceContext/);
assert.match(scheduler, /schedulerCanRun\(\)/); assert.match(scheduler, /SEARCH_DISCOVERY_SCHEDULER_SECRET/); assert.match(scheduler, /Bearer/); assert.match(scheduler, /limit\(25\)/);
assert.match(ui, /\/api\/platform\/search/); assert.match(ui, /Run Search Analysis/); assert.match(ui, /Missing provider data stays visibly unavailable/); assert.equal(/SEO score|92\/100|fake analytics/i.test(ui), false);
assert.match(repository, /stableFingerprint/); assert.match(repository, /RESOLVED/); assert.match(repository, /recurrence_count/); assert.match(repository, /idempotency_key/); assert.match(repository, /ignoreDuplicates/); assert.match(repository, /SEARCH_RETENTION_POLICY/); assert.equal(/rawHtml/i.test(repository) && !/rawHtmlPersisted: false/.test(repository), false);
// Update 21 (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md): this used
// to assert runtime.ts's crawl gate checked project.ownership_verified --
// a field never set to true anywhere in this codebase, which had silently
// disabled the entire crawl-based analysis pipeline for every tenant,
// always. That assertion would still pass on this file's own explanatory
// comments alone (a stale-test-passing-on-prose trap, the same class this
// codebase has hit before) without verifying anything real. Replaced with
// what the fix actually requires: the crawl-triggering condition itself
// (comment-stripped, so only the real code counts) must not gate on
// ownership_verified -- public analysis relies on crawlWebsite()'s own
// real, independent SSRF protection instead (assertPublicHttpTarget,
// tested in crawler's own test suite).
{
  const runtimeSource = read("packages", "search-discovery", "src", "runtime.ts");
  const codeOnly = runtimeSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(codeOnly, /crawlEnabled\s*&&\s*project\.ownership_verified/, "public crawl must not require ownership_verified -- that field is never set true anywhere, and would silently disable analysis for every tenant");
  assert.match(codeOnly, /SEARCH_RUNTIME_FLAGS\.crawlEnabled/, "the real, deliberate crawl feature flag must still gate the crawl");

  // READ/WRITE separation, the other half of Update 21: removing
  // ownership_verified from the read (crawl/analysis) path must never
  // weaken write authorization -- confirm the real mutation gate
  // (execution/engine.ts: action.state === "APPROVED" or a pre-classified
  // "safe_preparatory" action class) and the Vercel connector (its own
  // real, independent token-based authorization) never referenced
  // ownership_verified at all, so nothing here needed to change and
  // nothing here got weaker.
  const executionEngine = read("packages", "search-discovery", "src", "execution", "engine.ts");
  const vercelConnector = read("packages", "search-discovery", "src", "vercel", "connector.ts");
  assert.doesNotMatch(executionEngine, /ownership_verified/, "real website mutation must never have depended on ownership_verified -- it has its own real approval/classification gate");
  assert.match(executionEngine, /action\.state === "APPROVED"/, "real website mutation must still require an explicitly approved action (or a pre-classified safe_preparatory class) -- write authorization stays real and untouched");
  assert.doesNotMatch(vercelConnector, /ownership_verified/, "the Vercel connector's own token-based authorization must never have depended on ownership_verified either");
}
console.log("api-security.test.ts: ALL PASS (auth, tenant context, rate limit, scheduler secret/flag, truthful UI, public analysis not blocked by ownership_verified, write authorization unweakened)");
