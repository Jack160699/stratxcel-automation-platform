// Run with: node --experimental-strip-types lib/release/__tests__/v1-stable-beta-architecture.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_NAV_GROUPS_DATA } from "../../../components/shell/navigation/admin-nav-data.ts";
import { APP_NAV_GROUPS_DATA } from "../../../components/shell/navigation/app-nav-data.ts";
import { assertExplicitReleases, filterNavGroupsByRelease, stableNavGroups } from "../nav-filter.ts";
import { isReleaseVisible, normalizeProductRelease } from "../product-release.ts";
import { parseReleaseMode } from "../release-mode-pure.ts";
import { CANONICAL_ORIGIN, DISALLOWED_PATHS, PUBLIC_ROUTES } from "../../reporting/site.ts";
import { flattenNavGroups } from "../../../components/shell/navigation/active-route.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  // --- Release classification contract ------------------------------------
  assert.equal(normalizeProductRelease("v1"), "v1");
  assert.equal(normalizeProductRelease("v2"), "v2");
  assert.equal(normalizeProductRelease("beta"), null);
  assert.equal(normalizeProductRelease(undefined), null);
  assert.equal(isReleaseVisible("v1", { allowV2: false }), true);
  assert.equal(isReleaseVisible("v2", { allowV2: false }), false);
  assert.equal(isReleaseVisible("v2", { allowV2: true }), true);
  assert.equal(isReleaseVisible("unknown", { allowV2: true }), false, "unknown release must fail closed");
  assert.equal(isReleaseVisible(undefined, { allowV2: true }), false, "missing release must fail closed");

  assert.equal(parseReleaseMode(undefined), "stable");
  assert.equal(parseReleaseMode("beta"), "beta");
  assert.equal(parseReleaseMode("stable"), "stable");
  assert.equal(parseReleaseMode("hack"), "stable");

  // --- Explicit releases on every nav item --------------------------------
  assert.deepEqual(assertExplicitReleases(ADMIN_NAV_GROUPS_DATA), []);
  assert.deepEqual(assertExplicitReleases(APP_NAV_GROUPS_DATA), []);

  // --- Customer nav is V1 only --------------------------------------------
  for (const item of flattenNavGroups(APP_NAV_GROUPS_DATA)) {
    assert.equal(item.release, "v1", `customer nav item ${item.key} must be v1`);
  }

  // --- Stable admin never includes V2 -------------------------------------
  const stableAdmin = stableNavGroups(ADMIN_NAV_GROUPS_DATA);
  const stableHrefs = new Set(flattenNavGroups(stableAdmin).map((i) => i.href));
  assert.equal(stableHrefs.has("/admin/operating-brain"), false, "Stable admin must hide Operating Brain");
  assert.equal(stableHrefs.has("/admin/hermes"), false, "Stable admin must hide Hermes Mission Control");
  assert.ok(stableHrefs.has("/admin"), "Stable admin keeps Agency Overview");
  assert.ok(stableHrefs.has("/admin/social"), "Stable admin keeps Social Autopilot");
  assert.ok(stableHrefs.has("/admin/missions"), "Stable admin keeps All Missions");
  assert.equal(
    stableAdmin.some((g) => g.label === "Beta"),
    false,
    "Stable admin must not show an empty or Beta-only group header"
  );

  // --- Beta admin preserves all Stable items + reveals V2 -----------------
  const betaAdmin = filterNavGroupsByRelease(ADMIN_NAV_GROUPS_DATA, { allowV2: true });
  const betaHrefs = new Set(flattenNavGroups(betaAdmin).map((i) => i.href));
  for (const href of stableHrefs) {
    assert.ok(betaHrefs.has(href), `Beta admin must preserve Stable item ${href}`);
  }
  assert.ok(betaHrefs.has("/admin/operating-brain"));
  assert.ok(betaHrefs.has("/admin/hermes"));
  // Admin Sections 15-18 (Normal/Technical split): V2 items are now grouped
  // by real subject (Brain, Missions) rather than a single generic "Beta"
  // bucket -- the visual "Beta" badge itself comes from admin-navigation.tsx's
  // withIcons() (release === "v2" -> badge: "Beta"), applied per-item at
  // render time regardless of which group it's organized under. The
  // structural invariant that still matters here is that every V2 href
  // lives in a real, named group, never an empty or unlabeled one.
  for (const href of ["/admin/operating-brain", "/admin/hermes"]) {
    const group = betaAdmin.find((g) => g.items.some((i) => i.href === href));
    assert.ok(group?.label, `${href} must be organized under a real, named admin nav group`);
  }

  // --- Public sitemap is V1 only ------------------------------------------
  assert.equal(CANONICAL_ORIGIN, "https://www.stratxcel.in");
  const publicPaths = PUBLIC_ROUTES.map((r) => r.path);
  for (const forbidden of ["/agents", "/system", "/app", "/admin", "/audit", "/work"]) {
    assert.equal(publicPaths.includes(forbidden), false, `${forbidden} must not be in PUBLIC_ROUTES`);
  }
  for (const required of ["", "/products", "/solutions", "/social-autopilot", "/integrations", "/pricing", "/how-it-works", "/about", "/security", "/contact", "/terms", "/privacy", "/data-deletion"]) {
    assert.ok(publicPaths.includes(required), `sitemap must include ${required || "/"}`);
  }
  assert.ok(DISALLOWED_PATHS.includes("/agents"));
  assert.ok(DISALLOWED_PATHS.includes("/system"));

  // --- Public header/footer never link into /app --------------------------
  const header = read("app", "components", "PublicHeader.tsx");
  const footer = read("app", "components", "PublicFooter.tsx");
  assert.equal(/href=["']\/app(\/|["'])/.test(header), false, "PublicHeader must not link to /app routes");
  assert.equal(/href=["']\/app(\/|["'])/.test(footer), false, "PublicFooter must not link to /app routes");
  assert.equal(/\/admin\/operating-brain|Hermes Mission Control|My Operating Brain|Beta mode/.test(header + footer), false);

  // --- Customer shell has no beta control ---------------------------------
  const clientShell = read("app", "app", "ClientAppShell.tsx");
  assert.equal(/AdminBetaModeToggle|release-mode|sx_release_mode/.test(clientShell), false);

  // --- Server-owned beta cookie + owner gate ------------------------------
  const releaseModeApi = read("app", "api", "admin", "release-mode", "route.ts");
  assert.ok(/requireOwnerContext/.test(releaseModeApi));
  assert.ok(/setReleaseModeCookie/.test(releaseModeApi));
  assert.ok(/admin\.release_mode\.beta_enabled/.test(releaseModeApi));
  assert.ok(/admin\.release_mode\.stable_enabled/.test(releaseModeApi));

  const releaseModeLib = read("lib", "release", "release-mode.ts");
  assert.ok(/httpOnly:\s*true/.test(releaseModeLib));
  assert.ok(/sameSite:\s*["']lax["']/.test(releaseModeLib));
  assert.equal(/localStorage/.test(releaseModeLib), false);

  // --- Direct URL / API guards on V2 surfaces -----------------------------
  const operatingBrainPage = read("app", "admin", "(shell)", "operating-brain", "page.tsx");
  assert.ok(/requireReleaseAccess\(\s*["']v2["']\s*\)/.test(operatingBrainPage));

  const hermesPage = read("app", "admin", "(shell)", "hermes", "page.tsx");
  assert.ok(/requireReleaseAccess\(\s*["']v2["']\s*\)/.test(hermesPage));

  const hermesApi = read("app", "api", "platform", "admin", "hermes", "telemetry", "route.ts");
  assert.ok(/requireReleaseAccessApi\(\s*["']v2["']\s*\)/.test(hermesApi));

  const voiceUpload = read("app", "api", "admin", "operating-brain", "voice-notes", "upload", "route.ts");
  assert.ok(/requireOperatingBrainApiAccess/.test(voiceUpload));

  const agentsPage = read("app", "agents", "page.tsx");
  const systemPage = read("app", "system", "page.tsx");
  assert.ok(/gatePublicTechnicalPage/.test(agentsPage));
  assert.ok(/gatePublicTechnicalPage/.test(systemPage));
  assert.ok(/robots:\s*\{\s*index:\s*false/.test(agentsPage));
  assert.ok(/robots:\s*\{\s*index:\s*false/.test(systemPage));

  // --- Beta toggle lives only in admin shell ------------------------------
  const adminShell = read("app", "admin", "(shell)", "AppShell.tsx");
  assert.ok(/AdminBetaModeToggle/.test(adminShell));
  const toggle = read("components", "shell", "AdminBetaModeToggle.tsx");
  assert.ok(/role=["']switch["']/.test(toggle));
  assert.ok(/aria-checked/.test(toggle));
  assert.ok(/\/api\/admin\/release-mode/.test(toggle));

  console.log("v1-stable-beta-architecture.test.ts: ALL PASS");
}

run();
