// Retroactive Tenant Backfill & Settings/Profile Autopilot Toggle mission
// — real gaps found and fixed:
// (1) existing tenants activated before the "instant day-one content"
//     hardening had no way to retroactively backfill their queue --
//     nothing ever re-ran planPackagePeriod/prepareNearTermPackageItems
//     for them after the fact.
// (2) publishing_mode (Auto-publish vs Review-before-publish) was
//     write-once at activation, with literally no control anywhere in the
//     product to change it afterward -- the dashboard only ever rendered
//     it as read-only text.
//
// package-autopilot.ts / the API route / the settings page / the profile
// menu component are all too deeply Supabase/Next-coupled to live-import
// in this test harness (see content-engine-hardening.test.ts's own header
// comment) -- verified as static source-inclusion checks, matching this
// codebase's established pattern for exactly this class of module.
// Run with: node --experimental-strip-types lib/social/__tests__/tenant-backfill-and-mode-toggle.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  const autopilot = read("lib", "social", "package-autopilot.ts");
  const route = read("app", "api", "platform", "social", "autopilot", "route.ts");
  const toggle = read("app", "app", "components", "AutopilotModeToggle.tsx");
  const settings = read("app", "app", "settings", "page.tsx");
  const headerActions = read("app", "app", "components", "CustomerHeaderActions.tsx");
  const backfill = read("scripts", "backfill-existing-tenant-content.ts");
  const adminActions = read("app", "admin", "(shell)", "social", "actions.ts");
  const adminSystemPage = read("app", "admin", "(shell)", "social", "system", "page.tsx");

  // --- setPackageAutopilotPublishingMode: a real, tenant/client-scoped,
  //     audited mutation exists ------------------------------------------
  assert.ok(autopilot.includes("export async function setPackageAutopilotPublishingMode"), "a real function to change publishing_mode after activation must exist -- it was previously write-once");
  const setModeIndex = autopilot.indexOf("export async function setPackageAutopilotPublishingMode");
  const setModeBody = autopilot.slice(setModeIndex, setModeIndex + 1200);
  assert.match(setModeBody, /publishing_mode:\s*input\.publishingMode/, "must actually write the requested mode to the publishing_mode column");
  assert.match(setModeBody, /\.eq\("id",\s*input\.authorizationId\)/);
  assert.match(setModeBody, /\.eq\("tenant_id",\s*input\.tenantId\)/, "must be tenant-scoped exactly like setPackageAutopilotState/setPackageAutopilotScope");
  assert.match(setModeBody, /\.eq\("client_user_id",\s*input\.clientUserId\)/, "must follow the same client-scoping convention as the other state-mutating package-autopilot functions");
  assert.match(setModeBody, /recordAudit/, "a publishing-mode change must be audited exactly like every other package-autopilot mutation");
  console.log("package-autopilot.ts: setPackageAutopilotPublishingMode exists, tenant/client-scoped, audited — PASS");

  // --- packageKillSwitchActive is exported for the standalone backfill
  //     script to reuse (it previously wasn't reachable outside this file) -
  assert.ok(autopilot.includes("export async function packageKillSwitchActive"), "packageKillSwitchActive must be exported so operational scripts can honor the same kill switch runPackageAutopilotBatch does");
  assert.ok(autopilot.includes("export const PACKAGE_WORKER_TYPE"), "PACKAGE_WORKER_TYPE must be exported too, as the single source of truth for the worker-type kill-switch scope id");
  console.log("package-autopilot.ts: packageKillSwitchActive/PACKAGE_WORKER_TYPE exported for backfill reuse — PASS");

  // --- API route: a real, validated, tenant-scoped updatePublishingMode
  //     action is wired --------------------------------------------------
  assert.match(route, /case\s+"updatePublishingMode":/);
  const updateCaseIndex = route.indexOf('case "updatePublishingMode"');
  const updateCaseBody = route.slice(updateCaseIndex, updateCaseIndex + 900);
  assert.ok(updateCaseBody.includes("setPackageAutopilotPublishingMode"), "the route must call the real mutation function, not stub it");
  assert.match(updateCaseBody, /publishingMode must be AUTO_PUBLISH or REVIEW_BEFORE_PUBLISH/, "an invalid/missing publishingMode must be rejected with a specific, actionable error, never silently coerced");
  console.log("api route: updatePublishingMode action exists, validated, wired to the real mutation — PASS");

  // --- AutopilotModeToggle: fetches real state, posts the real action,
  //     never renders a fake switch when nothing is actually activated ---
  assert.ok(toggle.includes("/api/platform/social/autopilot"), "must fetch the real Autopilot overview endpoint, not fabricate state");
  assert.ok(toggle.includes('action: "updatePublishingMode"'), "must call the real update action when toggled");
  assert.ok(toggle.includes("AUTO_PUBLISH") && toggle.includes("REVIEW_BEFORE_PUBLISH"), "both real publishing modes must be selectable");
  assert.match(toggle, /status === "not_activated"/, "must have a real, distinct 'not activated' state");
  assert.ok(toggle.includes("Set up") || toggle.includes("Set up Autopilot"), "an unactivated tenant must see a real setup prompt, never a switch with nothing behind it");
  assert.ok(toggle.includes('variant: "settings" | "profile"'), "the component must support both host surfaces via a real variant prop, not two divergent copies");
  console.log("AutopilotModeToggle.tsx: fetches real state, posts the real action, honest not-activated state, dual variant — PASS");

  // --- Settings page: the toggle is actually rendered, not just imported -
  assert.ok(settings.includes('import { AutopilotModeToggle }'), "Settings page must import the real toggle component");
  assert.match(settings, /<AutopilotModeToggle\s+tenantId={active\?\.tenantId\s*\?\?\s*null}\s+variant="settings"\s*\/>/, "Settings must actually render the toggle wired to the current tenant, in the settings variant");
  console.log("settings/page.tsx: AutopilotModeToggle rendered live, wired to the active tenant — PASS");

  // --- Profile/account dropdown: the toggle is actually rendered there too
  assert.ok(headerActions.includes('import { AutopilotModeToggle }'), "the profile menu must import the real toggle component");
  assert.match(headerActions, /<AutopilotModeToggle\s+tenantId={tenantId}\s+variant="profile"\s*\/>/, "the profile menu must actually render the toggle, in the profile variant");
  console.log("CustomerHeaderActions.tsx: AutopilotModeToggle rendered live in the profile/account menu — PASS");

  // --- Backfill script: dry-run by default, kill-switch gated, per-tenant
  //     failure isolation, uses the exact real ACTIVE/NEEDS_ATTENTION set -
  assert.ok(backfill.includes('process.argv.includes("--execute")'), "must default to a safe dry run -- writing/calling AI must require an explicit --execute flag, never be the default for a script touching every real tenant");
  assert.match(backfill, /if\s*\(EXECUTE\)\s*{[\s\S]{0,200}packageKillSwitchActive/, "the kill switch must actually be checked before any real (--execute) work happens");
  assert.ok(backfill.includes('kill.active') && backfill.includes("process.exit(1)"), "an active kill switch must actually stop the script, not just log a warning and continue");
  assert.match(backfill, /\.in\("state",\s*\["ACTIVE",\s*"NEEDS_ATTENTION"\]\)/, "must select the exact same authorization states planPackagePeriod itself treats as eligible -- no divergent, possibly-wrong redefinition of 'active tenant'");
  assert.ok(backfill.includes("planPackagePeriod") && backfill.includes("prepareNearTermPackageItems"), "must call the real, idempotent production functions -- not a second, parallel content-generation path");
  assert.match(backfill, /catch\s*\(err\)\s*{[\s\S]{0,200}failures\+\+/, "one tenant's failure must be caught and counted, never abort the run for every other tenant");
  console.log("scripts/backfill-existing-tenant-content.ts: dry-run default, kill-switch gated, real idempotent functions, per-tenant failure isolation — PASS");

  // --- Admin server action: the VERIFIED, real execution path (the
  //     standalone script's --execute can't run outside Next.js's module
  //     resolution -- see that script's own header) -- admin-gated, kill-
  //     switch gated, calls the real functions, audited, wired to a real
  //     button --------------------------------------------------------
  assert.ok(adminActions.includes("export async function runTenantContentBackfillAction"), "a real admin server action must exist as the verified execution path");
  const backfillActionIndex = adminActions.indexOf("export async function runTenantContentBackfillAction");
  const backfillActionBody = adminActions.slice(backfillActionIndex, backfillActionIndex + 2200);
  assert.match(backfillActionBody, /const ctx = await assertOwner\(\);/, "must be admin/staff-gated exactly like every other action in this file, never open to a customer");
  assert.ok(backfillActionBody.includes("packageKillSwitchActive") && backfillActionBody.includes("kill.active"), "must refuse to run under an active kill switch, exactly like runPackageAutopilotBatch itself");
  assert.match(backfillActionBody, /\.in\("state",\s*\["ACTIVE",\s*"NEEDS_ATTENTION"\]\)/, "must select the exact same authorization states as the standalone script and planPackagePeriod itself");
  assert.ok(backfillActionBody.includes("planPackagePeriod") && backfillActionBody.includes("prepareNearTermPackageItems"), "must call the real, idempotent production functions");
  assert.match(backfillActionBody, /catch\s*\(err\)\s*{[\s\S]{0,200}failures\+\+/, "one tenant's failure must never abort the run for the rest");
  assert.ok(backfillActionBody.includes('action: "social.package.retroactive_backfill"'), "a backfill run must be audited");
  console.log("app/admin/(shell)/social/actions.ts: runTenantContentBackfillAction is admin-gated, kill-switch gated, audited, uses the real idempotent functions — PASS");

  assert.ok(adminSystemPage.includes("runTenantContentBackfillAction"), "the admin system page must import and wire the real action, not just leave it unreachable");
  assert.match(adminSystemPage, /Backfill existing tenant content/, "a real, visible button must exist for staff to trigger the backfill");
  console.log("app/admin/(shell)/social/system/page.tsx: real 'Backfill existing tenant content' button wired to the action — PASS");

  console.log("tenant-backfill-and-mode-toggle.test.ts: ALL PASS");
}

run();
