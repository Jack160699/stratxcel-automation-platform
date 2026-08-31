// Run with: node --experimental-strip-types app/api/platform/search/__tests__/api-security.test.ts
//
// Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
// dashboard/route.ts called getTenantServiceContext() (a raw,
// RLS-bypassing service-role client) directly against an unauthenticated
// tenantId query parameter -- no session check, no membership check, a
// real cross-tenant read. Every sibling route in this directory
// authenticates first; this one didn't. Fixed, and locked in here with the
// same static-source-assertion pattern already established in
// app/api/platform/search/google/__tests__/api-security.test.ts, so a
// future route added to this directory that skips the auth check is
// caught by inspection, not just by someone remembering the convention.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
/** Source with comments stripped, so prose *describing* a rule (e.g. this file's own doc comment mentioning both function names) never itself satisfies or defeats a check for the literal call. */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const dashboardRaw = read("app", "api", "platform", "search", "dashboard", "route.ts");
const dashboard = stripComments(dashboardRaw);
const listState = read("app", "api", "platform", "search", "route.ts");
const run = read("app", "api", "platform", "search", "run", "route.ts");
const executeAction = read("app", "api", "platform", "search", "actions", "execute", "route.ts");
const vercelConnect = read("app", "api", "platform", "search", "vercel", "connect", "route.ts");
const vercelDisconnect = read("app", "api", "platform", "search", "vercel", "disconnect", "route.ts");
const vercelDiscover = read("app", "api", "platform", "search", "vercel", "discover", "route.ts");

// --- every tenant-scoped search route authenticates the caller before touching tenant data ---
for (const [name, source] of [
  ["dashboard", dashboard],
  ["route (list state)", listState],
  ["run", run],
  ["actions/execute", executeAction],
  ["vercel/connect", vercelConnect],
  ["vercel/disconnect", vercelDisconnect],
  ["vercel/discover", vercelDiscover],
] as const) {
  assert.match(
    source,
    /requireTenantContext|requireTenantReadContext/,
    `${name} route must authenticate tenant membership before reading/writing tenant data`,
  );
}

// --- every Vercel connector route also gates on integration:configure -- it can create/remove a real credential grant, same bar as the Google connector routes ---
for (const [name, source] of [
  ["vercel/connect", vercelConnect],
  ["vercel/disconnect", vercelDisconnect],
  ["vercel/discover", vercelDiscover],
] as const) {
  assert.match(source, /requirePermission\(ctx\.role, "integration:configure"\)/, `${name} route must gate on integration:configure`);
}

// --- the Vercel connect route must never echo the raw token variable back in a response body (a user-facing message that merely mentions the word "token" is fine -- this checks for the actual value being placed in a response) ---
assert.equal(/Response\.json\([^;]*\bbody\.token\b/s.test(stripComments(vercelConnect).replace(/message:\s*"[^"]*"/g, "")), false, "vercel/connect must never place body.token (the raw secret) inside a Response.json call");


// --- the specific regression: dashboard must gate BEFORE reaching for the service-role client, not after ---
{
  const authIdx = dashboard.search(/requireTenantReadContext\(/);
  const serviceIdx = dashboard.search(/getTenantServiceContext\(/);
  assert.ok(authIdx !== -1, "dashboard route must call requireTenantReadContext");
  assert.ok(serviceIdx !== -1, "dashboard route must call getTenantServiceContext");
  assert.ok(authIdx < serviceIdx, "dashboard route must authenticate BEFORE reaching for the RLS-bypassing service client — this is exactly the order the original bug got backwards (service client with no prior check at all)");
}

// --- dashboard route must actually reject when auth fails, not just call the check and ignore the result ---
assert.match(dashboard, /if \(!ctx\.ok\)/, "dashboard route must branch on ctx.ok and refuse the request when it's false");

console.log("api-security.test.ts (search): every tenant-scoped search route authenticates before touching tenant data; dashboard specifically gates before its service client — PASS");
