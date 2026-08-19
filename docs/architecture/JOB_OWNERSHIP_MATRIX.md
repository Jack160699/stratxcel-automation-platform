# StratXcel Background Job Ownership Matrix

**Status:** Source of truth. **Date:** 2026-08-19. **Derived from:** full repository
inventory + live production evidence (project `uccqlgeghkwzujeeymua`), not
assumption — see "Evidence" under each job type.

This exists because `audit.generate_v1` was found to have two independent
consumers racing for the same job type with no ownership contract, one of
them silently 98 commits stale. That specific defect is fixed (see
`AUDIT_JOB_OWNER` below); this document is the explicit contract so it can't
happen again for any job type, and so nobody has to reverse-engineer the
architecture under production pressure a second time.

## The queue

All three background processes below (and the audit worker's Vercel cron)
share one Postgres-backed queue: `public.queue_jobs`, drained via
`@stratxcel/queue`'s `createPostgresQueueAdapter` (`claimNext({ leaseOwner,
jobTypes, leaseSeconds })`, atomic claim, no Redis/QStash/SQS anywhere in
this codebase — `packages/queue/src/adapter.ts` only *mentions* those as a
possible future swap). A claim is scoped to an explicit `jobTypes` array;
two processes only compete if they both include the same job type in that
array. **Every row in this table, ever, across all of production history,
has one of exactly three `job_type` values** (verified via
`select distinct job_type from queue_jobs`): `audit.generate_v1`,
`mission.execute`, `whatsapp.process_inbound`.

Other subsystems that look queue-like (`/api/social/worker`,
`/api/admin/operating-brain/worker`, `social_autopilot_queue_items`,
`social_publishing_jobs`) do **not** use this table — they're independent
mechanisms with their own tables, entirely out of scope for the race
condition this document exists to prevent, and not analyzed further here.

## The three long-running processes

| Process | `apps/` path | Claims from `queue_jobs`? | Job types claimed | Deployment |
|---|---|---|---|---|
| `mission-worker` | `apps/mission-worker` | Yes | `mission.execute` only (as of `eceb372`; previously also wrongly claimed `audit.generate_v1` — see below) | **Outside this repo's tracked pipeline.** No Dockerfile is referenced by any CI/CD config found; `infrastructure/workers/README.md` (written by a prior session) states no host was ever configured through any channel this repo controls. Confirmed live (`worker_heartbeats`): the running instance has been up since 2026-08-13, currently at commit `88649f4` — 98 behind `main` at the time of writing. |
| `whatsapp-worker` (processor sub-service) | `apps/whatsapp-worker` | Yes | `whatsapp.process_inbound` only | Same undeployed status as mission-worker per `infrastructure/workers/README.md`; separate process/port (8084) from the webhook-receiver sub-service (8081), same Docker image, different start command. |
| `hermes-gateway` | `apps/hermes-gateway` | **No** — confirmed by source inspection (`grep -n "claimNext\|queue_jobs" apps/hermes-gateway/src/*.ts` returns nothing). It is a passive inbound HTTP/MCP tool server that an *external* Hermes AI engine calls into (when `HERMES_MODE=http`) — it never polls or claims anything itself. | N/A | Same undeployed status. |

`app/api/platform/admin/workers/health/route.ts` is the canonical list of
these three (`WORKER_TYPES: WorkerType[] = ["mission-worker", "whatsapp-worker",
"hermes-gateway"]`) — treat that array, not this doc, as the enumeration to
update if a fourth process is ever added.

## Where Hermes actually fits

"Hermes" is **not** a job consumer. It is the (optional, currently
production-disabled) AI execution backend that `mission-worker` calls
*into* — in-process, via `packages/hermes`'s mode-gated adapter
(`hermes.execute()`), not an HTTP call to `hermes-gateway`. `hermes-gateway`
is the *reverse* direction: the tool surface an external Hermes engine would
call back into, gated behind mission-scoped tokens.

- `HERMES_MODE=disabled` (the default, and confirmed live in production
  right now via `/api/health` → `environment.hermesMode`): every mission
  either completes trivially (no billable-AI step required) or is denied
  with a clear reason (`tenant_required_for_billable_ai` observed live) —
  never a silent no-op, never routed anywhere else.
- `HERMES_MODE=mock`: deterministic fake execution, no external calls —
  for smoke-testing the mission pipeline.
- `HERMES_MODE=http`: would call a real Hermes engine — **not configured
  anywhere in this repo or in production today.**

**Conclusion: Hermes was never an eligible owner, primary or fallback, for
`audit.generate_v1`.** It is a different job type (`mission.execute`)
entirely, and even that path is currently non-executing by explicit
configuration, not by defect.

## Job type ownership

### `audit.generate_v1`

- **PRIMARY:** Vercel cron, `GET /api/platform/audit/worker` (`vercel.json`,
  `*/5 * * * *`), `CRON_SECRET`-authenticated, `maxDuration=60`. Git-deploy-
  synced with every push to `main` — this is the only consumer whose code
  freshness is guaranteed to match the repository.
- **FALLBACK:** none. (Not Hermes — see above. Not mission-worker — see
  below.)
- **MUST NOT CLAIM:** `mission-worker`. It included `AUDIT_GENERATION_JOB_TYPE`
  in its claimed job types historically — evidence points to this being
  accidental overlap from when `apps/mission-worker` was the *only* audit
  consumer, predating the dedicated Vercel cron built specifically to own
  this job type (see `docs/STRATXCEL_AUDIT_EXECUTION_ROOT_CAUSE.md`, Root
  Cause 3). Once the Vercel cron existed, mission-worker's continued
  eligibility was never revisited — and because it polls every ~5s against
  the cron's 5-minute schedule, it deterministically won every claim race,
  confirmed 3/3 live attempts on 2026-08-19 (`lease_owner =
  mission-worker-ip-172-31-32-254-18782`, running 98-commit-stale code).
  Fixed in `eceb372`: `AUDIT_GENERATION_JOB_TYPE` removed from
  mission-worker's claimed job types. The dormant handling code
  (`auditExecutor` construction, the dispatch branch, lease-heartbeat
  wrapper) is deliberately left in place, unreachable, so restoring it
  later (only once mission-worker is confirmed running current code) is a
  one-line revert.
- **FAILOVER CONDITION:** none defined. A future intentional fallback
  (e.g. mission-worker resuming eligibility once its deployment story is
  fixed) must use a real precedence rule — e.g. mission-worker only claims
  after confirming, via its own fresh `queue.recoverExpiredLeases()`-style
  check, that the Vercel cron hasn't touched the job in N minutes — not
  simply both processes polling and letting timing decide.
- **KNOWN UNRESOLVED BLOCKER:** the *already-running* mission-worker
  instance cannot be reached from a normal repo session to redeploy or
  restart — see `MISSION_WORKER_HOST` status below. `eceb372` only takes
  effect once that instance is redeployed or killed; until then it keeps
  running its 98-commit-stale copy of the old job-type list and keeps
  winning the race exactly as before.

### `mission.execute`

- **PRIMARY:** `mission-worker`, exclusively. Unaffected by the
  `audit.generate_v1` fix.
- **FALLBACK:** none — and none needed; only one process ever claims this
  type.
- **Downstream:** dispatches to `hermes.execute()` in-process
  (`HERMES_MODE`-gated as described above).

### `whatsapp.process_inbound`

- **PRIMARY:** `whatsapp-worker`'s processor sub-service, exclusively.
- **FALLBACK:** none.
- Entirely separate job type from both of the above — no code path in
  `mission-worker`, `hermes-gateway`, or the Vercel audit cron ever
  references `whatsapp.process_inbound` or claims from it. The
  `audit.generate_v1` fix touches zero WhatsApp code and zero WhatsApp job
  types; verified by the full existing WhatsApp test suites passing
  unchanged (`test:whatsapp-crm`, `test:whatsapp-shadow`) and by
  `apps/mission-worker/src/__tests__/worker-safety.test.ts`'s explicit
  assertion that `mission-worker`'s active `jobTypes` array contains
  neither `AUDIT_GENERATION_JOB_TYPE` nor any WhatsApp job type.

## Observability

- `worker_heartbeats` (one row per process, `worker_type` +
  `instance_id`): `version` (git SHA, when the host sets `GIT_COMMIT_SHA`),
  `started_at`, `last_heartbeat_at`, `status`, `queue_backlog_hint`,
  `last_error`. This is the authoritative way to check whether a given
  process is alive **and which commit it's actually running** — never
  assume a process auto-updates from a `git push`.
- `GET /health` on each of the three processes (ports 8082/8083/8084 per
  `infrastructure/workers/README.md`).
- `GET /api/platform/admin/workers/health?tenantId=<staff tenant>` —
  aggregate, platform-staff-only view of all three.
- `queue_jobs` itself: `status`, `lease_owner`, `lease_expires_at`,
  `heartbeat_at`, `attempt_count`, `last_error` — the ground truth for
  "who actually claimed this specific job."

## Verifying this contract holds

1. `select job_type, lease_owner from queue_jobs where job_type =
   'audit.generate_v1' order by created_at desc limit 5;` — every
   `lease_owner` must start with `cron-audit-worker-`, never
   `mission-worker-`.
2. `select worker_type, version, last_heartbeat_at from worker_heartbeats;`
   — confirm the `mission-worker` row's `version` before trusting anything
   it claims to have processed; a stale version silently invalidates any
   code-level guarantee made by the current `main` branch.
3. `apps/mission-worker/src/__tests__/worker-safety.test.ts` — regression
   test asserting `AUDIT_GENERATION_JOB_TYPE` never re-enters the active
   `jobTypes` claim array.
