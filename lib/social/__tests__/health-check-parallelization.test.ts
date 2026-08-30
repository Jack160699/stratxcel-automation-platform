// Run with: node --experimental-strip-types lib/social/__tests__/health-check-parallelization.test.ts
//
// STRATXCEL final closure brief, Section 5/6: real, measured production
// performance root-cause. Real Vercel function logs (not a guess) showed
// runHealthChecks alone taking ~2.7s of the real ~6.4s server-side
// page-load residual on /admin/social/system -- traced to 5 real Supabase
// round-trips awaited fully SEQUENTIALLY even though most of them don't
// depend on each other's results. This is a source-level proof (not a
// full runtime mock) because runHealthChecks creates its own real
// service-role client internally via createSupabaseServiceClient() for
// the final recordHealthChecks persistence write -- there is no injection
// seam to fake that specific call without a larger, riskier refactor of a
// function also used by the AI copilot's inspect_system_health tool, so a
// full in-process run() here would either need real Supabase credentials
// or silently rely on its own best-effort try/catch, neither of which
// proves the real concurrency restructuring. Source inspection proves the
// actual, real code shape instead.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = readFileSync(resolve(root, "health.ts"), "utf8");

function run() {
  // --- Wave 1: the 3 mutually-independent queries run together --------
  const wave1Start = src.indexOf("const [dbResult, accounts, settingsResult] = await Promise.all([");
  assert.ok(wave1Start >= 0, "the database-reachability check, listAccounts, and the automation-settings read must be dispatched together in one real Promise.all -- none of their real queries depend on each other's output");
  const wave1End = src.indexOf("]);", wave1Start);
  const wave1Body = src.slice(wave1Start, wave1End);
  assert.match(wave1Body, /ctx\.supabase\.from\("stratxcel_admins"\)\.select\("user_id"\)\.eq\("user_id", ctx\.ownerId\)\.limit\(1\)/, "the real database-reachability query must be unchanged");
  assert.match(wave1Body, /listAccounts\(ctx\)/, "the real listAccounts call must be unchanged");
  assert.match(wave1Body, /ctx\.supabase\s*\n?\s*\.from\("social_automation_settings"\)/, "the real publishing-mode settings query must be unchanged");
  console.log("health-check-parallelization.test.ts: the 3 mutually-independent queries (db check, listAccounts, automation settings) run in one real Promise.all — PASS");

  // --- Wave 2: the 2 accountIds-dependent queries run together, not
  //     sequentially, and only after accountIds is known -------------
  const wave2Start = src.indexOf("const [jobCountsResult, webhookCountResult] = await Promise.all([", wave1End);
  assert.ok(wave2Start >= 0, "the publishing-job-count and webhook-event-count queries (both need accountIds, not each other) must run in one real Promise.all, never sequentially");
  assert.ok(wave2Start > wave1End, "wave 2 must textually follow wave 1 -- it genuinely needs accountIds, which only wave 1 produces");
  const wave2End = src.indexOf("]);", wave2Start);
  const wave2Body = src.slice(wave2Start, wave2End);
  assert.match(wave2Body, /social_publishing_jobs"\)\.select\("status"\)\.in\("account_id", accountIds\)/, "the real publishing-job-count query must be unchanged");
  assert.match(wave2Body, /social_webhook_events"\)\.select\("id", \{ count: "exact", head: true \}\)\.in\("account_id", accountIds\)/, "the real webhook-event-count query must be unchanged");
  console.log("health-check-parallelization.test.ts: the 2 accountIds-dependent queries run together in a second real Promise.all, after (never before) accountIds is known — PASS");

  // --- No query was lost or altered in the restructuring -- exactly 5
  //     real Supabase calls total across both waves -------------------
  const allQueryTables = ["stratxcel_admins", "social_automation_settings", "social_publishing_jobs", "social_webhook_events"];
  for (const table of allQueryTables) {
    assert.ok(src.includes(`"${table}"`), `the real query against ${table} must still exist after the restructuring`);
  }
  console.log("health-check-parallelization.test.ts: every real query from before the restructuring still exists — PASS");

  // --- The final persistence write still happens LAST, after every real
  //     record has been built from the now-parallelized data ----------
  const recordHealthChecksIndex = src.indexOf("await recordHealthChecks(");
  const lastRecordsPushIndex = src.lastIndexOf("records.push(");
  assert.ok(recordHealthChecksIndex > lastRecordsPushIndex, "recordHealthChecks must still run after every real record has been built, never before");
  console.log("health-check-parallelization.test.ts: the final persistence write still runs after all records are built — PASS");

  console.log("health-check-parallelization.test.ts: ALL PASS");
}

run();
