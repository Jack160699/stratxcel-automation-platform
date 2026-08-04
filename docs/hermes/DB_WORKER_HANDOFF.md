# DB-Backed Hermes Worker Handoff

## Objective

Validate the database-backed mission-worker path against local-only
Supabase/Postgres, including migrations, RLS, two-tenant isolation,
queue/lease/heartbeat behaviour, deterministic mock-Hermes worker scenarios,
optional one-attempt local Hermes validation, quality gates and cleanup.

## Starting state

- Starting commit: `5ff4b4c5b142834c75b5bb67a4037cf16a127c84`
- Branch: `feat/hermes-runtime-adapter`
- Worktree path: `C:\Users\shriyansh chandrakar\Desktop\stratxcel-site\.claude\worktrees\hermes-runtime-adapter`
- Relevant repository instructions read: `CLAUDE.md`, `AGENTS.md`,
  `STRATEXCEL_AI_MASTER_BUILD_BRIEF.md`, `docs/hermes/RECONCILIATION.md`,
  `docs/hermes/*` (full set from the prior integration phase)
- Supabase CLI version: not checked this phase (unknown — not yet invoked)
- Docker version: not checked this phase (unknown — Docker CLI not found on
  the Windows-side PATH used by this worktree's shell; not verified inside
  WSL either)
- Local services present before this phase's work began: none confirmed
  running (see "Database state" below) — this phase had not started any
  lightweight-checkable work before this handoff was requested.

## Work completed

**Nothing in this DB-backed validation phase has been started.** This
handoff was created immediately upon receiving the emergency-stop
instruction, before any DB-backed work (migrations, Supabase startup,
worker/test execution) began. Do not credit any phase-specific item below
as done — this section is intentionally empty of DB-backed-phase work.

The only prior work is the already-committed, already-pushed runtime
integration at `5ff4b4c` (Phases 1–13 of the *previous* task, fully
documented in that task's own final report, not part of this DB-backed
validation phase's scope).

## Work currently in progress

Nothing was in progress. No command, test, migration, or process had been
started for this phase at the moment this handoff was created — the
emergency-stop instruction arrived at the very start of this phase, before
the first action.

- Current command/test: none
- Last successful checkpoint: `5ff4b4c` (previous phase's final commit,
  already on `origin/feat/hermes-runtime-adapter`)
- Last failure/blocker: none — no blocker was hit, work simply had not begun
- Temporary files/processes: none created this phase
- Database/container state: no local Supabase/Postgres instance was started
  this phase
- Cleanup required: none from this phase (see "Cleanup required" below for
  what a *previous* phase left, already cleaned up then)

## Files changed

No files were changed in this phase. `git status --short` and `git diff
--stat`/`--name-only` against `HEAD` are all empty — the working tree is
byte-identical to commit `5ff4b4c`.

## Database state

- Local Supabase: **not started** (confirmed via `docker ps` — no
  `supabase_*` containers found)
- Docker daemon: **not reachable** — `docker info` failed (exit 127: `docker`
  CLI not found on this shell's PATH); daemon state inside WSL not checked
  further (out of scope for a lightweight check)
- Local-only project/configuration used: none — no `supabase init`/`start`
  invoked
- Migrations applied: **none applied locally or anywhere this phase**. The
  migration from the previous phase,
  `supabase/migrations/20260804090000_hermes_run_tracking.sql`, exists in the
  repo (committed at `5ff4b4c`) but has never been applied to any database,
  local or production.
- Migration failures: n/a
- Synthetic tenants/users/missions created: none
- RLS tests completed: none
- Local ports in use: none opened by this phase. Port 18642 (local patched
  Hermes Runs API, used by the *previous* phase) was checked and is
  currently **down** (`curl` health check: connection refused / status
  `000`) — it was stopped as part of the previous phase's own cleanup, not
  by this handoff.
- Reset/teardown: nothing to tear down from this phase.

## Test matrix

| Item | Status |
|---|---|
| Empty database migration/reset | NOT STARTED |
| Schema/index verification | NOT STARTED |
| Tenant A isolation | NOT STARTED |
| Tenant B isolation | NOT STARTED |
| Unauthenticated isolation | NOT STARTED |
| Hermes event idempotency (DB-backed) | NOT STARTED |
| Queue atomic claim | NOT STARTED |
| Lease heartbeat | NOT STARTED |
| Expired lease reclaim | NOT STARTED |
| Duplicate delivery | NOT STARTED |
| Crash after Hermes submission | NOT STARTED |
| Successful mock run (DB-backed) | NOT STARTED |
| Failed mock run (DB-backed) | NOT STARTED |
| Cancelled run (DB-backed) | NOT STARTED |
| Waiting for approval (DB-backed) | NOT STARTED |
| SSE disconnect and polling recovery (DB-backed) | NOT STARTED |
| Transcript backfill (DB-backed) | NOT STARTED |
| Token preflight rejection (DB-backed) | NOT STARTED |
| Output budget stop (DB-backed) | NOT STARTED |
| Malformed event | NOT STARTED |
| Cross-tenant mismatch | NOT STARTED |
| Worker concurrency | NOT STARTED |
| Audit persistence | NOT STARTED |
| Usage persistence | NOT STARTED |
| Artifact persistence | NOT STARTED |
| Optional live Hermes run (this phase) | NOT STARTED |
| Lint (this phase's changes) | NOT STARTED — n/a, no changes yet |
| Typecheck (this phase's changes) | NOT STARTED — n/a, no changes yet |
| Tests (this phase's changes) | NOT STARTED — n/a, no changes yet |
| Build | NOT STARTED |

Note: the *previous* phase's own deterministic (non-DB) test suite,
lint, and typecheck all passed at `5ff4b4c` — see that phase's final
report. Those results are not re-stated as this phase's own results.

## Exact continuation point

1. `cd` into this worktree:
   `C:\Users\shriyansh chandrakar\Desktop\stratxcel-site\.claude\worktrees\hermes-runtime-adapter`
2. Confirm clean state: `git status --short` (expect empty) and
   `git rev-parse HEAD` (expect `5ff4b4c5b142834c75b5bb67a4037cf16a127c84`).
3. Check Supabase CLI availability/version: `npx supabase --version` (or
   locate the CLI if not on PATH).
4. Check Docker availability: confirm whether Docker Desktop /
   rootless Docker is expected to run on the Windows host or only inside
   WSL for this repo's local Supabase workflow, then verify it starts
   cleanly.
5. Start a **local-only** Supabase instance: `npx supabase start` (never
   `supabase link`, never point at the hosted `stratxcel` project).
6. Apply migrations to the local instance only:
   `npx supabase db reset` (or `db push` against the local instance),
   confirming `20260804090000_hermes_run_tracking.sql` applies cleanly on
   top of all prior migrations.
7. Verify schema: confirm `missions.last_hermes_status`,
   `missions.last_event_at`, `missions.input_tokens/output_tokens/total_tokens`,
   `missions.transcript_backfill_cursor`, `mission_events.run_id`,
   `mission_events.sequence`, and the partial unique index
   `mission_events_hermes_dedup_idx` all exist as expected.
8. Seed two synthetic tenants (Tenant A, Tenant B) plus one mission each,
   and write/run RLS isolation tests (A can't read B's missions/events,
   unauthenticated reads nothing) against the local instance only.
9. Write a DB-backed worker test harness (a real `ServiceClient` pointed at
   the local Supabase instance, not a hand-rolled mock) exercising
   `processOnce`/`executeMission` from `apps/mission-worker/src/worker.ts`
   against the **mock** Hermes adapter (`HERMES_MODE=mock`) for: successful
   run, failed run, cancelled run, waiting-for-approval, and a simulated
   SSE-disconnect-then-poll-recovery case.
10. Add queue-specific DB-backed tests: atomic claim under concurrent
    claimers, lease heartbeat extending `lease_expires_at`, expired-lease
    reclaim via `recoverExpiredLeases()`, and duplicate-delivery/idempotency
    on `mission_events` via the new unique index.
11. Add a crash-after-submission test: simulate a worker process dying
    right after `recordHermesRunSubmitted` but before `streamEvents`
    resolves, then confirm a second `executeMission` call (simulating
    worker restart) correctly skips re-submission and polls `getRun()`
    instead.
12. Only after all of the above pass: optionally start the local patched
    Hermes instance for **one** live run (no retries on 429/503), reusing
    the same pattern documented in `docs/hermes/RECONCILIATION.md`.
13. Run full quality gates (lint, typecheck, this phase's new tests, the
    existing `npm run test:foundation` suite, `next build`) before
    considering this phase's work committable.
14. Tear down: stop the local Supabase instance (`npx supabase stop`),
    confirm no lingering Docker containers, and stop the local Hermes
    gateway if it was started in step 12.
15. Commit and push only after all of the above are genuinely green — do
    not commit partial/broken DB-backed test scaffolding as if it were
    finished.

## Safety boundaries

- No production Supabase
- No `supabase link`
- No `supabase db push` against a remote/hosted project
- No production service-role key
- No production deployment
- No merge into `main`
- No modification of the `feat/stratxcel-core-product-experience` UI branch/worktree
- No production aliases
- No repeated Gemini/model-provider retries on 429/503
- Local infrastructure only

## Cleanup required

- Nothing from this phase — no process, container, or temp file was created.
- Carried over from the previous phase (already handled, noted for
  awareness only): the local patched Hermes gateway on port 18642 was
  started and then stopped again before that phase's final report; it is
  confirmed **not running** as of this handoff (`curl` health check:
  connection refused).

## Recommended final deliverable

Before the verdict can become **DB-BACKED HERMES WORKER VALIDATED**, the
following must all be true and evidenced (command output, not just a
claim):

1. A local-only Supabase/Postgres instance starts cleanly and all
   migrations (including `20260804090000_hermes_run_tracking.sql`) apply
   without error.
2. Two-tenant RLS isolation is proven with real queries (Tenant A, Tenant B,
   and unauthenticated), not just asserted.
3. The full DB-backed test matrix above shows PASSED for every queue/worker/
   idempotency/persistence row (mock-Hermes-backed; the live-Hermes row is
   optional and single-attempt only).
4. Lint, typecheck, the existing foundation suite, this phase's new tests,
   and `next build` all pass together, in the same worktree state.
5. Local Supabase (and Hermes, if started) are stopped and no local
   containers/processes are left running.
6. Everything is committed and pushed to `feat/hermes-runtime-adapter`
   only — `main` untouched, no production migration, no deploy.
