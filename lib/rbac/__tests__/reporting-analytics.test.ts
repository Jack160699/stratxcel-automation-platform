// Run with: node --experimental-strip-types lib/rbac/__tests__/reporting-analytics.test.ts
//
// Phase A Task 2 — reporting & analytics connections.
//
// The point of this suite is the honesty rule: a provider may only be reported
// as connected when a real grant backs it, and a missing scope must be named
// rather than smoothed over. Most assertions therefore drive the pure
// derivation functions with real-shaped social_accounts rows (the fixtures
// below are the actual scope sets returned by the live Stratxcel grants), not
// the source text.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveGoogleAnalyticsStatus,
  deriveSearchConsoleStatus,
  deriveSocialProviderStatus,
  getReportingConnectionsStatus,
  selectLiveAccount,
  type SocialAccountRow,
} from "../../reporting/status.ts";
import { CANONICAL_ORIGIN, DISALLOWED_PATHS, PUBLIC_ROUTES } from "../../reporting/site.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));
/** Source with comments removed, so prose about a rule never satisfies it. */
const readCode = (...parts: string[]) =>
  read(...parts).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function account(over: Partial<SocialAccountRow> & { platform: string }): SocialAccountRow {
  return {
    status: "CONNECTED",
    token_health: "HEALTHY",
    permissions: [],
    last_sync_at: "2026-08-02T10:47:18.890Z",
    updated_at: "2026-08-02T10:47:18.890Z",
    ...over,
  };
}

async function run() {
  // --- 1. Canonical site surface --------------------------------------------
  assert.equal(CANONICAL_ORIGIN, "https://www.stratxcel.in", "www is canonical (apex 307s to it)");
  assert.ok(exists("app", "sitemap.ts"), "app/sitemap.ts must exist");
  assert.ok(exists("app", "robots.ts"), "app/robots.ts must exist");

  const paths = PUBLIC_ROUTES.map((r) => r.path);
  assert.ok(paths.includes(""), "sitemap must include the home route");

  // /products and /solutions 307 to /modules and /use-cases. A sitemap must
  // list the destination, never the redirect, or Search Console excludes them.
  for (const redirectRoute of ["/products", "/solutions"]) {
    assert.equal(paths.includes(redirectRoute), false, `${redirectRoute} redirects — list its target instead`);
  }
  assert.ok(paths.includes("/modules"), "/modules is the real destination of /products");
  assert.ok(paths.includes("/use-cases"), "/use-cases is the real destination of /solutions");

  // /audit redirects to /login?next=/app/audit — advertising it would publish
  // an authenticated destination.
  for (const privateRoute of ["/audit", "/login", "/signup", "/app", "/admin", "/agents", "/system"]) {
    assert.equal(paths.includes(privateRoute), false, `${privateRoute} must never appear in the public sitemap`);
  }

  assert.equal(new Set(paths).size, paths.length, "sitemap must not contain duplicate routes");
  for (const route of PUBLIC_ROUTES) {
    assert.ok(route.path === "" || route.path.startsWith("/"), `route "${route.path}" must be origin-relative`);
    assert.ok(route.priority > 0 && route.priority <= 1, `route "${route.path}" needs a valid priority`);
  }

  for (const guarded of ["/admin/", "/app/", "/api/", "/auth/"]) {
    assert.ok(DISALLOWED_PATHS.includes(guarded), `robots.txt must disallow ${guarded}`);
  }
  // robots.txt is literal prefix matching. A section root written without its
  // trailing slash silently swallows siblings — "/app" also matches the
  // "/apple-icon.png" favicon — so every rule is checked against the real
  // strings a crawler would compare.
  const CRAWLABLE_ASSETS = ["/apple-icon.png", "/icon.png", "/favicon.ico", "/favicon-32.png", "/logo-v2.png", "/sitemap.xml", "/robots.txt"];
  for (const rule of DISALLOWED_PATHS) {
    for (const p of [...paths, ...CRAWLABLE_ASSETS]) {
      assert.equal(p.startsWith(rule), false, `robots rule "${rule}" would block "${p}"`);
    }
  }
  // Single pages must be blocked at their exact URL, not only below it.
  for (const page of ["/audit", "/login", "/signup"]) {
    assert.ok(DISALLOWED_PATHS.some((rule) => page.startsWith(rule)), `robots.txt must actually match ${page} (a trailing slash here would miss it)`);
  }

  const robotsSource = read("app", "robots.ts");
  assert.ok(/sitemap:/.test(robotsSource), "robots must advertise the sitemap");

  // --- 2. GA4 component -----------------------------------------------------
  const gaSource = readCode("app", "components", "GoogleAnalytics.tsx");
  assert.ok(/NEXT_PUBLIC_GA_MEASUREMENT_ID/.test(gaSource), "GA component must read the public measurement ID");
  assert.ok(/return null/.test(gaSource), "GA component must no-op when unconfigured");
  // A route-change listener on top of gtag('config') is the classic source of
  // duplicated page_view hits — GA4 enhanced measurement already covers
  // History API navigation.
  assert.equal(/usePathname|useSearchParams|routeChangeComplete/.test(gaSource), false, "GA component must not add a second page_view source");
  assert.equal((gaSource.match(/gtag\('config','/g) ?? []).length, 1, "exactly one gtag config call");
  assert.equal(/userId|user_id|email|tenantId/.test(gaSource), false, "GA component must never forward PII");

  const layoutSource = read("app", "layout.tsx");
  assert.equal((layoutSource.match(/<GoogleAnalytics\s*\/>/g) ?? []).length, 1, "GA must be mounted exactly once");
  assert.equal((layoutSource.match(/<Analytics\s*\/>/g) ?? []).length, 1, "Vercel Analytics must remain mounted exactly once");

  // Measurement-ID validation: a malformed value must not reach the page.
  assert.equal(deriveGoogleAnalyticsStatus(undefined).status, "not_configured");
  assert.equal(deriveGoogleAnalyticsStatus("   ").status, "not_configured");
  assert.equal(deriveGoogleAnalyticsStatus("UA-12345-1").status, "error", "a UA property ID is not a GA4 measurement ID");
  assert.equal(deriveGoogleAnalyticsStatus("G-ABC123XYZ9").status, "connected");
  assert.equal(deriveGoogleAnalyticsStatus("G-ABC123XYZ9").connected, true);

  // --- 3. Search Console must not self-certify ------------------------------
  assert.equal(deriveSearchConsoleStatus(undefined).status, "not_configured", "no token means unverified, never 'active'");
  assert.equal(deriveSearchConsoleStatus(undefined).connected, false);
  assert.equal(deriveSearchConsoleStatus("abc123").status, "connected");

  // --- 4. Social reporting reflects the real grant --------------------------
  // Live YouTube grant carries youtube.readonly → reporting is authorised.
  const youtube = deriveSocialProviderStatus(
    "youtube",
    account({
      platform: "youtube",
      permissions: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
    })
  );
  assert.equal(youtube.status, "connected");
  assert.deepEqual(youtube.missingScopes, []);

  // Upload-only grant can publish but cannot read — that is not "connected".
  const youtubeUploadOnly = deriveSocialProviderStatus(
    "youtube",
    account({ platform: "youtube", permissions: ["https://www.googleapis.com/auth/youtube.upload"] })
  );
  assert.equal(youtubeUploadOnly.status, "permission_required");
  assert.ok(
    youtubeUploadOnly.missingScopes.includes("https://www.googleapis.com/auth/youtube.readonly"),
    "the exact missing scope must be named"
  );

  // Threads: publish-only grant lacks threads_manage_insights.
  const threads = deriveSocialProviderStatus(
    "threads",
    account({ platform: "threads", permissions: ["threads_basic", "threads_content_publish"] })
  );
  assert.equal(threads.status, "permission_required");
  assert.deepEqual(threads.missingScopes, ["threads_manage_insights"]);

  const threadsWithInsights = deriveSocialProviderStatus(
    "threads",
    account({ platform: "threads", permissions: ["threads_basic", "threads_manage_insights"] })
  );
  assert.equal(threadsWithInsights.status, "connected");

  // Instagram: the live grant holds instagram_business_manage_insights.
  assert.equal(
    deriveSocialProviderStatus(
      "instagram",
      account({
        platform: "instagram",
        permissions: ["instagram_business_basic", "instagram_business_manage_insights"],
      })
    ).status,
    "connected"
  );

  // Facebook accepts either read_insights or pages_read_engagement.
  assert.equal(
    deriveSocialProviderStatus("facebook", account({ platform: "facebook", permissions: ["pages_read_engagement"] })).status,
    "connected"
  );
  assert.equal(
    deriveSocialProviderStatus("facebook", account({ platform: "facebook", permissions: ["pages_manage_posts"] })).status,
    "permission_required"
  );

  // No account at all, and a disconnected account, are distinct from a
  // permission problem.
  assert.equal(deriveSocialProviderStatus("linkedin", null).status, "not_connected");
  assert.equal(deriveSocialProviderStatus("linkedin", null).reason, "no_account_connected");
  assert.equal(
    deriveSocialProviderStatus("youtube", account({ platform: "youtube", status: "DISCONNECTED" })).status,
    "not_connected"
  );

  // An unusable credential must surface as an error, not as connected —
  // even when every scope is present.
  const revoked = deriveSocialProviderStatus(
    "instagram",
    account({
      platform: "instagram",
      token_health: "INVALID",
      permissions: ["instagram_business_manage_insights"],
    })
  );
  assert.equal(revoked.status, "error");
  assert.equal(revoked.reason, "token_invalid");

  // --- 5. Live-row selection ------------------------------------------------
  // Re-consent leaves historical rows behind; the newest CONNECTED grant is
  // the one whose scopes actually apply.
  const rows: SocialAccountRow[] = [
    account({ platform: "threads", permissions: ["threads_basic", "threads_manage_insights"], updated_at: "2026-08-02T04:50:32.000Z" }),
    account({ platform: "threads", permissions: ["threads_basic", "threads_content_publish"], updated_at: "2026-08-02T11:18:19.000Z" }),
    account({ platform: "youtube", status: "DISCONNECTED", updated_at: "2026-08-02T04:44:13.000Z" }),
  ];
  const liveThreads = selectLiveAccount(rows, "threads");
  assert.equal(liveThreads?.updated_at, "2026-08-02T11:18:19.000Z", "newest CONNECTED grant wins");
  assert.equal(
    deriveSocialProviderStatus("threads", liveThreads).status,
    "permission_required",
    "scopes must come from the current grant, not a stale one"
  );
  assert.equal(selectLiveAccount(rows, "facebook"), null, "absent platform yields no account");

  // --- 6. Aggregate shape and secret containment ----------------------------
  const statuses = await getReportingConnectionsStatus(null);
  assert.deepEqual(
    statuses.map((s) => s.provider),
    ["vercel_analytics", "google_analytics", "search_console", "youtube", "facebook", "instagram", "threads", "linkedin"]
  );

  const VALID = ["connected", "no_data", "not_connected", "permission_required", "error", "not_configured"];
  const ALLOWED_KEYS = ["provider", "displayName", "connected", "status", "lastSyncAt", "reason", "missingScopes"];
  for (const s of statuses) {
    // Whitelist the shape rather than blacklisting names: a field that could
    // carry a credential can only reach the client if it is added here.
    assert.deepEqual(Object.keys(s).sort(), [...ALLOWED_KEYS].sort(), `${s.provider} exposes unexpected fields`);
    assert.ok(s.displayName, `${s.provider} needs a display name`);
    assert.equal(typeof s.connected, "boolean");
    assert.ok(VALID.includes(s.status), `${s.provider} has invalid status ${s.status}`);
    assert.ok(s.lastSyncAt === null || !Number.isNaN(Date.parse(s.lastSyncAt)), "lastSyncAt must be null or a real timestamp");
    assert.equal(s.status === "connected" ? s.reason : "sentinel", s.status === "connected" ? null : "sentinel", "connected providers carry no failure reason");
    assert.ok(Array.isArray(s.missingScopes));
  }
  // Nothing in the payload may look like a live credential. Scope names and
  // reason codes are short identifiers; a token would not be.
  for (const value of JSON.parse(JSON.stringify(statuses)).flatMap((s: Record<string, unknown>) => Object.values(s))) {
    assert.equal(typeof value === "string" && value.length > 120, false, "no field may carry a credential-length string");
  }

  // A read failure must degrade to an error, never to a false "connected".
  const failing = await getReportingConnectionsStatus({
    from: () => ({ select: async () => ({ data: null, error: { message: "column does not exist" } }) }),
  });
  for (const s of failing.filter((p) => ["youtube", "facebook", "instagram", "threads", "linkedin"].includes(p.provider))) {
    assert.equal(s.status, "error", `${s.provider} must not claim connection when the read failed`);
    assert.equal(s.reason, "provider_read_failed");
    assert.equal(s.connected, false);
  }

  // The read must use the column that actually exists on social_accounts.
  const statusSource = read("lib", "reporting", "status.ts");
  assert.ok(/"platform, status, token_health, permissions, last_sync_at, updated_at"/.test(statusSource), "must select the real social_accounts columns");

  // --- 7. API route: owner-gated, no service role ---------------------------
  const routePath = ["app", "api", "platform", "reporting", "status", "route.ts"];
  assert.ok(exists(...routePath), "reporting status route must exist");
  const routeSource = read(...routePath);
  assert.ok(/requireOwnerContext\(\)/.test(routeSource), "route must be owner-gated — connection health is not public");
  assert.ok(/if \(!ctx\.ok\) return/.test(routeSource), "route must return early when the caller is unauthorised");
  // Missing Supabase env (the case on Preview) makes createSupabaseServerClient
  // throw. That must surface as a named 503, not an unhandled 500.
  assert.ok(/status: 503/.test(readCode(...routePath)), "route must answer 503 when the auth backend is unconfigured");
  assert.ok(/catch/.test(readCode(...routePath)), "route must not let client construction crash the request");
  assert.equal(
    /createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(routeSource),
    false,
    "reporting status API must have zero service-role dependency"
  );

  console.log(
    "reporting-analytics.test.ts: ALL PASS (canonical sitemap excludes redirects + auth routes, robots/sitemap consistency, single GA4 page_view source, scope-derived provider truth, owner-gated API, zero secret exposure)"
  );
}

run();
