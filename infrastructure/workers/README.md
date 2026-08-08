# Production worker deployment

Three long-running Node processes (`apps/hermes-gateway`, `apps/mission-worker`,
`apps/whatsapp-worker`) plus the WhatsApp processor sub-process. **Vercel is not
a fit for these** — they're persistent poll loops / HTTP servers, not
request/response serverless functions. This directory has everything needed
to deploy them except the actual host, which is a cost decision requiring
owner approval (see `M11` in the repo root's `MANUAL_SETUP_REQUIRED.md`).

Dockerfiles here are statically written and reviewed, not verified by an
actual `docker build` in this session — Docker is not installed in this
environment (same limitation `infrastructure/hermes/README.md` documents).
Verify with a real `docker build`/`docker run` before first production use.

## Services to deploy

| Service | Dockerfile | Start command | Port | Notes |
|---|---|---|---|---|
| Hermes gateway | `Dockerfile.hermes-gateway` | `npm start` | 8082 | Never expose publicly without `HERMES_GATEWAY_SECRET` set |
| Mission worker | `Dockerfile.mission-worker` | `npm start` | 8083 | Poll loop + `/health` |
| WhatsApp webhook receiver | `Dockerfile.whatsapp-worker` | `npm start` | 8081 | Must be reachable by Meta; needs `WHATSAPP_VERIFY_TOKEN` |
| WhatsApp processor | `Dockerfile.whatsapp-worker` (same image) | `npm run start:processor` | 8084 | Separate service, same image, different command |

## Recommended host

A small always-on container platform: **Fly.io**, **Railway**, or **Render**
all work — none is already configured in this repo. Whichever is chosen,
each service above maps to one deployment there, using its matching
Dockerfile (`-f infrastructure/workers/Dockerfile.<name>`, build context =
repo root).

**Owner action needed:** pick one of the three and approve the (small,
usually free-tier-eligible for this traffic level) recurring cost — this
repository will not create a paid account/service on your behalf. Once
chosen, deployment from these Dockerfiles is mechanical.

## Env contract

Every service needs, at minimum:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — same production
  Supabase project as the main app (`uccqlgeghkwzujeeymua`). Never the
  anon/publishable key.
- `GIT_COMMIT_SHA` — set this to the deployed commit (most platforms expose
  this automatically, e.g. `RAILWAY_GIT_COMMIT_SHA`/`RENDER_GIT_COMMIT`; map
  it to `GIT_COMMIT_SHA` if the platform uses a different name) — shown in
  `/health` and worker heartbeat rows so a bad deploy is identifiable.

Hermes gateway additionally needs:

- `HERMES_GATEWAY_SECRET` — signs/verifies mission tokens. Must match what
  the mission worker uses to *issue* tokens (same env var name, same value).

Mission worker additionally needs:

- `HERMES_GATEWAY_SECRET` (see above)
- `HERMES_MODE` — `disabled` (default; every mission BLOCKs with a clear
  reason), `mock` (deterministic fake execution, see
  `packages/hermes/src/mock-adapter.ts` — safe for smoke-testing the pipeline
  with no external calls), or `http` (calls a real Hermes engine — not
  configured anywhere in this repo; see `infrastructure/hermes/README.md`).
- `HERMES_SHARED_SECRET`, `HERMES_GATEWAY_URL` — only if `HERMES_MODE=http`.

WhatsApp worker (both services) additionally needs:

- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET` and whatever
  `@stratxcel/whatsapp` already requires for outbound sends — see that
  package's own env checks; not duplicated here. **No new Meta permission or
  App Review change is needed or was made by this task.**

None of these are ever logged, returned in an API response, or given to
Hermes (Hermes only ever receives a short-lived mission-scoped token, never
the service-role key or any provider secret).

## Health

Every service exposes `GET /health`, returning `200` with
`{"status":"healthy"|"degraded", ...}` or `503` with
`{"status":"unavailable" | "degraded", ...}`. `healthy` requires: the
process is answering AND its own worker-heartbeat row (in `worker_heartbeats`,
written on every poll cycle) is fresh — a process that's alive but can't
reach the database reports `unavailable`, never `healthy`.

Aggregate, cross-service view for staff:
`GET /api/platform/admin/workers/health?tenantId=<any-tenant-you-belong-to>`
(platform-staff only).

## Kill switches

`POST /api/platform/admin/kill-switches` (platform-staff only) —
`{ "tenantId": "<staff's own tenant>", "scope": "global_hermes"|"worker_type"|"tenant"|"mission", "scopeId"?: "...", "enabled": true, "reason": "..." }`.

- `global_hermes` — stops all three services from claiming new work.
- `worker_type` — stops one service (`scopeId`: `mission-worker` |
  `whatsapp-worker` | `hermes-gateway`).
- `tenant` / `mission` — stops just that tenant's or mission's work.

An active kill switch **never deletes or cancels queued jobs** — it only
prevents new claims/dispatches. Jobs already claimed at the moment a
tenant/mission switch flips are put back to `RETRY_SCHEDULED` (not
`DEAD_LETTER`), so they resume automatically once the switch is turned off.

## Dead-letter recovery

`GET /api/platform/admin/queue/dead-letter?tenantId=<tenant>` lists a
tenant's permanently failed jobs (with `last_error`). `POST` the same path
with `{ tenantId, jobId }` to requeue — idempotent (requeuing a job that
isn't dead-lettered is a safe no-op) and tenant-scoped (cannot recover a
different tenant's job even if the ID is guessed).

## Verifying a deployment

1. `GET /health` on each service → `200`/`healthy`.
2. Confirm a `worker_heartbeats` row exists per service in Supabase and
   `last_heartbeat_at` is advancing.
3. Set `HERMES_MODE=mock` on the mission worker and create one mission
   through the normal product flow — it should reach `COMPLETED` end to end
   with real persisted events, using zero real external calls.
4. Flip a `worker_type` kill switch on, confirm the service stops claiming
   (queue backlog holds steady), flip it off, confirm it resumes.
5. Manually fail a test job past `max_attempts` (or wait for a real one),
   confirm it lands in `DEAD_LETTER`, then requeue it via the admin route and
   confirm it processes exactly once.

Do not use a real customer-facing action (a real WhatsApp send, a real
mission with `HERMES_MODE=http` against a real provider) as this smoke test.
