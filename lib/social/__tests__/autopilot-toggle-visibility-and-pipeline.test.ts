// Debug Missing UI Toggle and Empty Content Pipeline mission — investigation
// findings and fixes:
//
// (1) The "Social Autopilot toggle is completely missing" report was NOT a
//     wiring bug: AutopilotModeToggle was correctly imported and rendered
//     in both /app/settings and CustomerHeaderActions.tsx's "Account &
//     Profile" modal (confirmed by direct source read on the exact
//     deployed commit), and the API it calls (GET /api/platform/social/
//     autopilot) returned 200 with zero runtime errors (confirmed live via
//     Vercel runtime logs). The REAL gap: every not-yet-activated tenant,
//     Starter or Growth+, got the identical generic "Set up Autopilot"
//     prompt -- confirmed live against the real "Stratxcel" production
//     tenant, whose subscription plan_tier is "starter" (Social Autopilot
//     is a Growth+-only capability per hasCapability/activatePackage
//     Autopilot's own check) and who additionally has zero brand profiles
//     configured. A Starter tenant clicking "Set up Autopilot" could never
//     actually complete that setup -- misleading, not literally invisible,
//     but a real, fixable gap. Fixed by exposing eligibility.planEligible
//     from the GET route and branching the component into a distinct
//     "plan_ineligible" state (real, different copy + an /app/billing
//     upgrade link, never the same generic setup prompt).
//
// (2) The empty content pipeline was a SEPARATE, unrelated, and more
//     direct bug: /app/content/pipeline's four Kanban columns (Draft,
//     Awaiting approval, Scheduled, Published) were 100% hardcoded
//     "Nothing here." with ZERO data query of any kind -- it would read
//     empty even for a tenant with real published posts. Fixed by wiring
//     it to social_autopilot_queue_items (the same RLS-safe, client-scoped
//     source the Autopilot dashboard's own upcoming/history sections use).
//
// route.ts / AutopilotModeToggle.tsx / the pipeline page are all too
// deeply Supabase/Next-coupled to live-import in this test harness (see
// content-engine-hardening.test.ts's own header comment) -- verified as
// static source-inclusion checks, matching this codebase's established
// pattern.
// Run with: node --experimental-strip-types lib/social/__tests__/autopilot-toggle-visibility-and-pipeline.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  const route = read("app", "api", "platform", "social", "autopilot", "route.ts");
  const toggle = read("app", "app", "components", "AutopilotModeToggle.tsx");
  const headerActions = read("app", "app", "components", "CustomerHeaderActions.tsx");
  const pipeline = read("app", "app", "content", "pipeline", "page.tsx");

  // --- Confirms the toggle really was wired (the investigation's own
  //     finding, kept as a regression guard) -----------------------------
  assert.ok(headerActions.includes("<AutopilotModeToggle"), "AutopilotModeToggle must be rendered inside the Account & Profile modal -- confirmed correctly wired during investigation, kept as a regression guard");
  console.log("CustomerHeaderActions.tsx: AutopilotModeToggle confirmed wired in the profile modal (not the real bug) — PASS");

  // --- route.ts: planEligible is computed from the real hasCapability
  //     check and exposed to the client ------------------------------
  assert.ok(route.includes("hasCapability") && route.includes("isPlanTier"), "planEligible must be derived from the real plan-capability check, not guessed");
  assert.match(route, /planEligible\s*=\s*Boolean\(planTier\)\s*&&\s*hasCapability\(planTier!,\s*"social_autopilot"\)/, "planEligible must reflect the exact same social_autopilot capability check activatePackageAutopilot itself enforces");
  assert.match(route, /eligibility:\s*{\s*subscriptionActive,\s*planEligible,/, "planEligible must actually be included in the eligibility object returned to the client");
  console.log("api route: planEligible is derived from the real capability check and exposed in eligibility — PASS");

  // --- AutopilotModeToggle.tsx: a real, distinct plan_ineligible state --
  assert.match(toggle, /status:\s*"plan_ineligible"/, "a real, distinct state must exist for plan-ineligible tenants -- not lumped in with 'not yet set up'");
  assert.ok(toggle.includes("eligibility?.planEligible === false"), "the component must actually read planEligible from the response to decide which state to enter");
  assert.match(toggle, /Not included in your current plan/, "plan-ineligible tenants must see copy that explains WHY, not the generic setup prompt");
  assert.match(toggle, /\/app\/billing/, "plan-ineligible tenants must be routed to upgrade (billing), never to the setup checklist they can't complete");
  assert.ok(toggle.includes("Upgrade to unlock Autopilot") || toggle.includes('"Upgrade"'), "the CTA label itself must be distinct from the generic 'Set up Autopilot' for ineligible tenants");
  console.log("AutopilotModeToggle.tsx: real plan_ineligible state, distinct copy, routes to billing not the dead-end checklist — PASS");

  // --- Pipeline page: real data query replaces the hardcoded placeholder
  assert.ok(!/<p className="mt-3 text-xs text-sx-text-subtle">Nothing here\.<\/p>\s*\)\)}/.test(pipeline) || pipeline.includes("social_autopilot_queue_items"), "the pipeline page must query real data -- a bare unconditional 'Nothing here.' for every tenant regardless of real content was the actual reported bug");
  assert.ok(pipeline.includes('.from("social_autopilot_queue_items")'), "must query the real queue-items table, not a second/parallel data source");
  assert.match(pipeline, /\.eq\("tenant_id",\s*ctx\.workspaceTenant\.tenantId\)/, "the query must be tenant-scoped -- never leak one tenant's pipeline into another's view");
  assert.ok(pipeline.includes("STAGE_BY_STATUS"), "real queue statuses must map onto the 4 UI stages, not a fabricated status set");
  assert.match(pipeline, /PLANNED:\s*"Draft"/);
  assert.match(pipeline, /REVIEW_REQUIRED:\s*"Awaiting approval"/);
  assert.match(pipeline, /SCHEDULED:\s*"Scheduled"/);
  assert.match(pipeline, /PUBLISHED:\s*"Published"/);
  assert.ok(pipeline.includes("cards.length === 0"), "a genuinely empty column must still say so honestly -- 'Nothing here.' is correct when real, just no longer unconditional");
  assert.ok(pipeline.includes("hasAnyContent"), "a tenant with a genuinely empty pipeline must get an honest, actionable explanation (set up Autopilot / schedule manually), not silence");
  console.log("content/pipeline/page.tsx: real social_autopilot_queue_items data replaces the unconditional hardcoded placeholder — PASS");

  console.log("autopilot-toggle-visibility-and-pipeline.test.ts: ALL PASS");
}

run();
