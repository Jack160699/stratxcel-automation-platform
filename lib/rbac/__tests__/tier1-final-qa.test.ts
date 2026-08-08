import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(process.cwd(), ...parts));
const legalRoutes = ["terms", "privacy", "refund-cancellation", "data-deletion", "acceptable-use", "domain-website-terms", "third-party-providers", "data-processing-terms"];
for (const route of legalRoutes) assert.ok(exists("app", "(marketing)", route, "page.tsx"), `/${route} must exist`);
assert.ok(exists("app", "support", "page.tsx"));
const publicHeader = read("app", "components", "PublicHeader.tsx");
assert.equal(/md:flex|md:hidden/.test(publicHeader), false, "public desktop navigation must not activate at the overflowing tablet breakpoint");
assert.match(publicHeader, /lg:flex/); assert.match(publicHeader, /lg:hidden/);

const robots = read("app", "robots.ts");
assert.match(robots, /sitemap\.xml/); assert.match(robots, /"\/app\/"/); assert.match(robots, /"\/admin\/"/); assert.match(robots, /"\/api\/"/);
const sitemap = read("app", "sitemap.ts");
for (const route of ["/pricing", "/support", ...legalRoutes.map((r) => `/${r}`)]) assert.ok(sitemap.includes(`"${route}"`), `${route} must be in sitemap`);

const plans = read("packages", "payments-and-wallet", "src", "plans.ts");
for (const value of ["₹0", "₹4,999", "₹9,999", "₹19,999", "₹34,999+"]) assert.ok(plans.includes(value));
assert.match(read("app", "pricing", "page.tsx"), /AUDIT_PRODUCT/);
assert.equal(/₹9,499|₹18,999|₹23,999|\bSignal\b|\bMesh\b|\bFleet\b/.test(read("app", "pricing", "page.tsx")), false);

const paymentFlags = read("packages", "payments-and-wallet", "src", "flags.ts");
assert.match(paymentFlags, /process\.env\[flag\] === "true"/);
const searchRuntime = read("packages", "search-discovery", "src", "runtime.ts");
assert.match(searchRuntime, /SEARCH_DISCOVERY_SCHEDULER_ENABLED === "true"/); assert.match(searchRuntime, /SEARCH_DISCOVERY_CRAWL_ENABLED === "true"/);
assert.equal(/\?\?\s*true/.test(paymentFlags + searchRuntime), false);

const subscriptionRoute = read("app", "api", "platform", "subscriptions", "route.ts");
assert.ok(subscriptionRoute.indexOf("PAYMENTS_SUBSCRIPTIONS_ENABLED") < subscriptionRoute.indexOf("request.json"));
const domainPurchase = read("app", "api", "platform", "domains", "purchase", "route.ts");
assert.ok(domainPurchase.indexOf("PAYMENTS_DOMAINS_ENABLED") < domainPurchase.indexOf("request.json"));

const searchState = read("app", "api", "platform", "search", "route.ts");
const searchRun = read("app", "api", "platform", "search", "run", "route.ts");
assert.match(searchState, /requireTenantContext/); assert.match(searchState, /ctx\.supabase/); assert.match(searchRun, /requireTenantContext/); assert.match(searchRun, /SEARCH_RATE_LIMITED/);
assert.match(read("app", "api", "internal", "search", "scheduler", "route.ts"), /SEARCH_DISCOVERY_SCHEDULER_SECRET/);

const trackedEnvFiles = execFileSync("git", ["ls-files", ".env", ".env.*"], { encoding: "utf8" }).split(/\r?\n/).filter((name) => name && !name.endsWith("example"));
assert.deepEqual(trackedEnvFiles, [], "No real .env files should be tracked");
console.log("tier1-final-qa.test.ts: ALL PASS (legal/support routes, robots/sitemap, canonical pricing, dormant gates, Search API auth, no root env files)");
