import "server-only";
import { after } from "next/server";
import type { AuditWorkerOutcome } from "@stratxcel/audit-engine";

/**
 * CRITICAL PRODUCTION BUG (Free Audit stuck in production, live-caught on
 * a real MedRoute Consultancy audit): every one of the 3 places that give
 * a freshly-created audit an "instant" head start
 * (app/api/platform/audit/onboarding/route.ts x2,
 * app/api/platform/onboarding/route.ts x1) raced the real executor
 * against a short timeout using a bare `Promise.race([executionPromise,
 * timeoutPromise])`. `Promise.race` never cancels or keeps alive the
 * losing promise -- once the timeout won (the common case: a real
 * "premium audit" AI report + website analysis routinely takes longer
 * than 15-18s), the calling route returned its HTTP response immediately
 * afterward with nothing else keeping the runtime alive, so Vercel could
 * freeze/tear down the function mid-execution. The real, in-flight
 * `runAutomaticAuditGeneration` call was orphaned: no further heartbeat,
 * no terminal stage, no failure ever recorded --
 * `audit_generation_runs` stuck at RUNNING/whatever stage it happened to
 * reach, indefinitely (confirmed live: `heartbeat_at` frozen at the exact
 * moment `stage` last changed to ANALYSIS, ~9+ minutes with zero further
 * writes).
 *
 * The queue-based fallback (the audit worker cron,
 * app/api/platform/audit/worker/route.ts) could only ever recover a run
 * like this once cron actually claimed its still-`PENDING`
 * `queue_jobs` row -- confirmed live: that row's `lease_owner`/
 * `lease_expires_at` were both still null (never claimed at all), because
 * this project's real Vercel cron for that route only fires once a day
 * (vercel.json: "0 8 star star star", i.e. daily at 08:00 UTC), not on
 * the every-5-minutes cadence that route's own code comments assume. A
 * customer's "instant" free audit could silently sit stuck for up to
 * 24 hours.
 *
 * Fix: `after()` keeps the SAME already-in-flight execution promise alive
 * past the response, up to the calling route's own `maxDuration` -- it
 * never re-runs the executor a second time, it only prevents the runtime
 * from abandoning the one real call before it reaches a genuine terminal
 * state (QUALITY_GATE/DELIVERY/COMPLETE, or a real failure/retry outcome
 * the existing state machine in packages/audit-engine/src/pipeline.ts
 * already handles correctly on its own -- that state machine itself was
 * never the bug). Every caller must also declare a real `maxDuration`
 * (270s, matching the worker route's own already-proven-sufficient
 * budget for this exact call) -- without it, the platform's short
 * default would kill the function before `after()`'s own continuation
 * gets any real time to run.
 */
export function runAuditGenerationWithInlineSlice(
  executionPromise: Promise<AuditWorkerOutcome>,
  inlineSliceMs = 15_000,
): Promise<AuditWorkerOutcome | { kind: "TIMEOUT_SLICE" } | { kind: "ERROR" }> {
  const guarded = executionPromise.catch((err) => {
    console.error("[audit] background auto-execution failed", err instanceof Error ? err.message : String(err));
    return { kind: "ERROR" as const };
  });
  // Never orphan the real execution -- this is the actual fix.
  after(() => guarded);

  const timeoutPromise = new Promise<{ kind: "TIMEOUT_SLICE" }>((resolve) => {
    setTimeout(() => resolve({ kind: "TIMEOUT_SLICE" }), inlineSliceMs);
  });
  return Promise.race([guarded, timeoutPromise]);
}
