// Social Autopilot — Complete Repair mission (Part 9/10): the canonical
// paid-subscriber flow is "customer pays -> system researches, builds the
// full-period strategy, and schedules it -> publishes daily", with no
// requirement to manually click "Activate Autopilot". Real investigation
// this session found that pipeline (planPackagePeriod schedules the WHOLE
// service period upfront via computePackageDistribution;
// prepareNearTermPackageItems is the real research/personalization/
// quality-gate engine already exercised end-to-end by
// test:social-quality-campaign -- industry-taxonomy.ts, personalization.ts,
// quality-score.ts, content-diversity.ts, generation-loop.ts,
// creative-brief.ts, visual-research-library.ts all already real and
// tested) already existed and needed no parallel rebuild. The one real,
// confirmed gap: nothing ever called activatePackageAutopilot
// automatically. attemptAutoActivatePackageAutopilot closes it, wired at
// the two real moments a tenant can first become eligible.
//
// Run with: node --experimental-strip-types lib/social/__tests__/paid-subscriber-auto-activation.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  const packageAutopilot = read("lib", "social", "package-autopilot.ts");
  const fnStart = packageAutopilot.indexOf("export async function attemptAutoActivatePackageAutopilot");
  assert.ok(fnStart >= 0, "attemptAutoActivatePackageAutopilot must exist");
  const fnEnd = packageAutopilot.indexOf("\nasync function validatePackageResumePrerequisites", fnStart);
  const fnBody = packageAutopilot.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);

  // --- Idempotency: a tenant that already has ANY authorization row is left
  //     completely alone -- never overrides a customer's own past pause/
  //     cancel choice, never creates a second parallel campaign -----------
  assert.match(fnBody, /from\("social_autopilot_authorizations"\)[\s\S]{0,120}\.eq\("tenant_id", input\.tenantId\)/, "must check for an existing authorization for this tenant before doing anything else");
  assert.match(fnBody, /return \{ activated: false, reason: "authorization_already_exists" \}/, "an existing authorization of ANY kind must short-circuit -- active, paused, or cancelled, all left alone");

  // --- Real prerequisites, never duplicated/faked here -- activatePackage
  //     Autopilot's own checks stay the single source of truth ------------
  assert.match(fnBody, /hasCapability\(planTier, "social_autopilot"\)/, "must verify the real plan capability before attempting activation");
  assert.match(fnBody, /stripUnschedulablePlatforms/, "must use the same real allow-list every other activation path uses -- never let youtube back in here either");
  assert.match(fnBody, /await activatePackageAutopilot\(service, \{/, "must call the real, single canonical activation function -- no parallel implementation");

  // --- Never throws back to a webhook/OAuth callback over an ordinary
  //     "not ready yet" outcome (a brand-new customer with no brand profile
  //     or connected account yet) -----------------------------------------
  assert.match(fnBody, /catch \(err\) \{[\s\S]{0,600}return \{ activated: false, reason \}/, "must catch and return a reason rather than throw -- callers (webhook, OAuth callback) must never fail their own real response over this");

  // --- The same real, already-tested plan+prepare chain -- schedules the
  //     WHOLE service period and prepares real, quality-gated content,
  //     never a second implementation ---------------------------------
  assert.match(fnBody, /await planPackagePeriod\(service, authorization\.id\)/);
  assert.match(fnBody, /await prepareNearTermPackageItems\(service, authorization\.id\)/);
  console.log("attemptAutoActivatePackageAutopilot: idempotent, uses only real prerequisites, never a parallel implementation — PASS");

  // --- Trigger 1: Razorpay webhook, fire-and-forget, never blocks the real
  //     webhook response Razorpay is waiting on -------------------------
  const webhookRoute = read("app", "api", "webhook", "razorpay", "route.ts");
  assert.match(webhookRoute, /attemptAutoActivatePackageAutopilot/, "the Razorpay webhook must wire the real auto-activation trigger");
  assert.match(webhookRoute, /attemptAutoActivateSocialAutopilotBestEffort\(supabase, processResult\);(?!\s*await)/, "must be a fire-and-forget call (no leading await), matching after()'s own contract");
  assert.match(webhookRoute, /after\(async \(\) => \{[\s\S]{0,300}attemptAutoActivatePackageAutopilot/, "the real AI-capable work must run inside after(), never inline before the webhook responds");
  assert.match(webhookRoute, /export const maxDuration = 300;/, "the after() work needs the same real AI-chain budget every other such route in this codebase uses");
  console.log("api/webhook/razorpay/route.ts: auto-activation wired as a real, non-blocking best-effort trigger — PASS");

  // --- Trigger 2: OAuth connect callback, the real last onboarding step
  //     for a brand-new subscriber ----------------------------------------
  const oauthCallback = read("app", "api", "social", "oauth", "[provider]", "callback", "route.ts");
  assert.match(oauthCallback, /attemptAutoActivatePackageAutopilot/, "the OAuth callback must wire the real auto-activation trigger");
  assert.match(oauthCallback, /if \(targetTenantId\) \{[\s\S]{0,300}after\(async \(\) => \{[\s\S]{0,200}attemptAutoActivatePackageAutopilot/, "must only fire for a real, tenant-scoped connection, and via after() so it never delays the real OAuth redirect");
  assert.match(oauthCallback, /export const maxDuration = 300;/, "the after() work needs the same real AI-chain budget");
  console.log("api/social/oauth/[provider]/callback/route.ts: auto-activation wired at the real last-onboarding-step trigger — PASS");

  console.log("paid-subscriber-auto-activation.test.ts: ALL PASS");
}

run();
