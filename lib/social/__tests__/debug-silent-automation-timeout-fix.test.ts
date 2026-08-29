// Debug Silent Automation Failure and Fix Background Workers mission —
// real root cause found via Vercel runtime logs (not guessed):
//
// (1) /api/social/package-producer hit a REAL, confirmed "Vercel Runtime
//     Timeout Error: Task timed out after 120 seconds" (production log,
//     2026-08-28T16:01:13Z) -- after ~24 genuinely successful real Gemini
//     calls (ai_execution_success events, real cost/tokens logged). Not a
//     crash or config error: the route's own maxDuration=120 was simply
//     too small for a real near-term-preparation batch (up to 20 due
//     items, 1-2 real AI calls each plus quality-gate retries). Widened
//     to 300, matching the same budget this codebase already uses for
//     every other AI-heavy route.
//
// (2) The "Backfill existing tenant content" / "Run worker now" admin
//     buttons appeared to silently do nothing -- confirmed via Vercel
//     runtime logs: an "Error: The destination stream closed early." on
//     /admin/social/system at almost the exact moment a click would
//     happen. Root cause, confirmed against Next.js's own docs
//     (node_modules/next/dist/docs/.../maxDuration.md: "If using Server
//     Actions, set maxDuration at the PAGE level"): the admin system page
//     had NO maxDuration at all, so runTenantContentBackfillAction's real
//     AI work was killed by Vercel's short platform default long before
//     it could finish or even write anything -- with zero visible error
//     surfaced to the user, exactly matching "clicked the button, nothing
//     happened." Fixed by setting maxDuration=300 at the page level.
//
// (3) vercel.json's cron schedule itself was never broken -- the
//     automation infrastructure was always correctly configured; it just
//     kept getting silently killed by the timeout above. Verified
//     unchanged here as a regression guard, not re-fixed.
//
// Run with: node --experimental-strip-types lib/social/__tests__/debug-silent-automation-timeout-fix.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function run() {
  // --- The cron route's real, confirmed-too-small budget is widened -----
  const producerRoute = read("app", "api", "social", "package-producer", "route.ts");
  assert.match(producerRoute, /export const maxDuration = 300;/, "package-producer's maxDuration must be widened to 300 -- 120 was confirmed live to be too small for a real near-term-preparation batch (Vercel Runtime Timeout Error, 2026-08-28T16:01:13Z)");
  assert.ok(!producerRoute.includes("maxDuration = 120"), "the old, confirmed-insufficient 120s budget must actually be gone, not left alongside a new one");
  console.log("api/social/package-producer/route.ts: maxDuration widened from the confirmed-insufficient 120s to 300s — PASS");

  // --- The admin page gets a real maxDuration for its Server Actions ----
  const adminSystemPage = read("app", "admin", "(shell)", "social", "system", "page.tsx");
  assert.match(adminSystemPage, /export const maxDuration = 300;/, "the admin system page must set maxDuration -- per Next.js's own docs, this is the ONLY place that changes the timeout for Server Actions used on the page");
  assert.ok(adminSystemPage.includes("runTenantContentBackfillAction") && adminSystemPage.includes("runWorkerNowAction"), "both real admin actions must still be wired to this same page (the fix must not have accidentally detached them)");
  console.log("admin/social/system/page.tsx: real maxDuration set at the page level, fixing the Server Actions' silent timeout — PASS");

  // --- Automation infrastructure (vercel.json cron) exists and is once-daily
  //     (Mission D+ superseded the original "must stay hourly/15min" guard:
  //     the Vercel project is on the Hobby plan, which rejects ANY
  //     deployment containing a sub-daily cron -- confirmed live via a real
  //     deploy attempt returning cron_jobs_limits_reached, silently blocking
  //     every deployment since whenever the account moved onto/started
  //     enforcing that plan tier. Both crons were deliberately widened to
  //     once/day, explicitly authorized by the user as a temporary,
  //     reversible tradeoff to unblock deployment -- this guard now checks
  //     that both real paths still exist with a real once-daily schedule,
  //     not that they were never touched) --------------------------------
  const vercelConfig = read("vercel.json");
  assert.match(vercelConfig, /"path":\s*"\/api\/social\/package-producer"[\s\S]{0,60}"schedule":\s*"0 2 \* \* \*"/, "package-producer must still exist with a real, valid once-daily schedule -- Hobby-plan cron limits reject anything more frequent");
  assert.match(vercelConfig, /"path":\s*"\/api\/social\/worker"[\s\S]{0,60}"schedule":\s*"0 6 \* \* \*"/, "the publish worker must still exist with a real, valid once-daily schedule, scheduled after package-producer so same-day-prepared content can still be picked up same day");
  console.log("vercel.json: both real cron schedules confirmed present, once-daily (Hobby-plan compatible) — PASS");

  console.log("debug-silent-automation-timeout-fix.test.ts: ALL PASS");
}

run();
