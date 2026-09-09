-- Registers the fix for the production-blocking "Free Audit stuck" defect
-- (live-caught on a real MedRoute Consultancy audit, order
-- 2209206c-f0c4-450f-b8c2-da05bac15087, run ea0cb54d-6e13-42fc-b7f3-c2f68f6b63f5
-- frozen in RUNNING/ANALYSIS for 9+ minutes with zero further heartbeat
-- writes). Applied live via Supabase MCP; this file makes it reproducible
-- from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:audit_instant_kickoff_never_orphaned',
  'The "instant" free-audit kickoff can no longer orphan a real, in-flight audit execution mid-run',
  'Root cause (confirmed live via direct DB queries, not inferred): all 3 places that give a
freshly-created audit an "instant" head start (app/api/platform/audit/onboarding/route.ts
x2, app/api/platform/onboarding/route.ts x1) raced the real executor against a short
timeout using a bare Promise.race([executionPromise, timeoutPromise]). Promise.race never
cancels or keeps alive the losing promise -- once the timeout won (the common case: a real
premium-audit AI report + website analysis routinely takes longer than 15-18s), the calling
route returned its HTTP response immediately afterward with nothing else keeping the
runtime alive, so the platform could freeze/tear down the function mid-execution. The real,
in-flight runAutomaticAuditGeneration call was orphaned: no further heartbeat, no terminal
stage, no failure ever recorded. The queue-based fallback (app/api/platform/audit/worker/route.ts,
a cron route) could only ever recover an orphaned run once cron actually claimed its still-
PENDING queue_jobs row -- confirmed live that row was never claimed at all (lease_owner/
lease_expires_at both null), because this project''s real Vercel cron for that route only
fires once a day (vercel.json: every entry is a once-daily schedule -- a genuine Hobby-plan
constraint, not a misconfiguration to "fix" by editing the schedule). A customer''s "instant"
free audit could silently sit stuck for up to 24 hours. Fix (generic, all 3 call sites, no
MedRoute-specific condition anywhere): new lib/audit/inline-audit-execution.ts wraps every
call site in runAuditGenerationWithInlineSlice(), which uses next/server''s after() to keep
the SAME already-in-flight execution promise alive past the response, up to the route''s own
maxDuration -- it never re-runs the executor a second time, it only prevents the runtime
from abandoning the one real call before it reaches a genuine terminal state. Both onboarding
routes also gained export const maxDuration = 270 (previously relying on the platform''s
short default, which would otherwise kill the function before after()''s continuation got any
real time) -- 270s matches the audit worker cron route''s own already-proven-sufficient budget
for the identical executor call. The audit engine''s own state machine
(packages/audit-engine/src/pipeline.ts) was read in full and confirmed correct on re-entry
(resets to RESEARCH, reuses persisted research_data on a real PASS, proceeds through
ANALYSIS/QUALITY_GATE/DELIVERY/COMPLETE) -- it was never the bug and was not modified.
Recovery of the specific stuck MedRoute run: re-invoked the existing, legitimate
start_automatic_audit_generation_v1 RPC via the finalize action (already-authenticated
session, no direct SQL stage edit, no fabricated output) -- confirmed idempotent by design
per brand-brain version. Because the tenant''s Brand Brain had advanced to version 2 since
the original stuck attempt (version 1), the RPC started a fresh run rather than resuming the
literal stale row; that new run (a66c21b1-7e2c-46c0-bd0f-d378e83b1eb9) ran the real pipeline
end to end and reached COMPLETE in ~31 seconds, and audit_orders.status for that order is now
"completed" with a real, evidence-backed report live on the audit page (Overall Score 45,
per-category breakdown, N/A shown honestly for unconnected data sources -- not fabricated).
The original orphaned run row (ea0cb54d-...) remains frozen in the database as an inert
historical artifact superseded by the completed run; it is not customer-facing and was
deliberately left untouched rather than manually edited.',
  'audit',
  'Engineering',
  'N/A (customer-facing audit pipeline reliability fix, not a Hermes/agent tool)',
  'read_write',
  'tenant',
  'free',
  'external_mutation',
  'tsc --noEmit clean (after fixing 2 real type errors introduced by the fix itself), lint
clean, real NODE_ENV=production build exits 0. New
lib/audit/__tests__/inline-audit-execution.test.ts (source-level assertions, since next/server''s
after() cannot be imported by plain node) confirms: after(() => guarded) present; the inline
race uses the same guarded promise, never a second independent call; all 3 known call sites
import and call the fixed helper; the old unguarded Promise.race pattern is gone from all of
them; both onboarding routes declare a real maxDuration = 270. Existing
lib/audit/__tests__/audit-v1-experience.test.ts re-run unmodified, still passes. Live
verification (not just a 200 response): queried audit_generation_runs and audit_orders
directly via Supabase before and after triggering recovery, confirmed a real run
(a66c21b1-...) progressed RESEARCH -> ANALYSIS -> QUALITY_GATE -> DELIVERY -> COMPLETE and
audit_orders.status flipped to "completed"; then loaded the live MedRoute audit page in an
authenticated browser session and confirmed a real completed report renders (Overall Score
45/100, per-category breakdown, free-creatives CTA, connector panel) -- no stuck spinner.',
  'REAL_EXPOSED',
  'The pre-existing orphaned run row for the MedRoute order (ea0cb54d-...) was intentionally
left as-is rather than manually flipped to a terminal status -- it is superseded by the
completed run and not read by any customer-facing surface, but a future data-hygiene pass
could add a real reconciliation job (e.g. a cron sweep that marks a run STOPPED once a newer
run for the same order has reached a terminal state) rather than leaving superseded rows
inert indefinitely.',
  now(),
  'claude-sonnet-5-production-audit'
);
