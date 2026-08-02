# Runbook

## Everyday commands (repo root)

```bash
npm install                 # sets up npm workspaces (packages/*, apps/*)
npx tsc --noEmit             # typecheck the whole monorepo
npx eslint packages apps app/api app/admin/platform   # lint this session's new code
npm run test:foundation      # 21 pure-logic tests across all new packages
npm run test:security        # queue privilege hardening + RLS coverage (static)
npm run test:social          # pre-existing Social Autopilot suite (needs SOCIAL_TOKEN_ENCRYPTION_KEY locally)
npm run build                 # production Next.js build
npm run dev                   # local dev server for the dashboard app
```

## Bootstrapping a tenant (once a Supabase project is reachable — see MANUAL_SETUP_REQUIRED.md M10)

1. Log into the dashboard app as any authenticated Supabase Auth user.
2. Visit `/admin/platform/tenants`, fill in name + slug, submit.
3. You're now that tenant's `owner`. Copy the tenant ID shown (or select "Use this tenant") — every other `/admin/platform/*` page needs it.

## Running the standalone apps locally

Each needs `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same project as the dashboard) plus its own additional vars:

```bash
# WhatsApp webhook receiver (fast path — verify, normalize, enqueue)
cd apps/whatsapp-worker
WHATSAPP_APP_SECRET=... WHATSAPP_VERIFY_TOKEN=... npm start

# WhatsApp async conversation processor (separate process)
cd apps/whatsapp-worker
npm run start:processor

# Mission executor (claims 'mission.execute' jobs, runs Hermes adapter)
cd apps/mission-worker
HERMES_MODE=mock npm start   # or HERMES_MODE=http with HERMES_GATEWAY_URL/HERMES_SHARED_SECRET set

# Hermes tool gateway (what a real Hermes instance calls back into)
cd apps/hermes-gateway
HERMES_GATEWAY_SECRET=... npm start
```

None of these are deployed anywhere (see `MANUAL_SETUP_REQUIRED.md` M11) — this is how to run them locally for development/testing.

## Queue operations

- **Stuck/dead jobs:** visit `/admin/platform/queue?tenantId=...` — dead-letter jobs show their last error. There is no admin "retry" button yet; retrying a dead-lettered job requires a direct `queue_internal`-privileged call (service-role only) or a future admin action.
- **Abandoned leases (worker crashed mid-job):** both `apps/mission-worker` and `apps/whatsapp-worker`'s processor call `queue.recoverExpiredLeases()` on every poll tick automatically — no manual action needed under normal operation.
- **Backoff timing:** 30s base, doubling per attempt, capped at 1 hour (`packages/queue/src/backoff.ts`, mirrored exactly in SQL).

## Rollback

This entire session's work lives on `worktree-stratxcel-ai-build`, never merged to `main` and never deployed to production. "Rollback" is simply: don't merge this branch, or `git revert` specific commits if only part of it needs undoing — nothing external (DNS, webhooks, production database) was ever changed, so there is nothing to roll back outside this repository.

If migrations are applied (M10) and need reverting: they're all additive (new tables/columns/functions, no `DROP`/destructive `ALTER`) — reverting means dropping the specific new objects, not restoring from a backup. Write the exact `DROP` statements at the time you decide to revert, scoped to what was actually applied.

## Health checks

- Dashboard app: standard Vercel deployment health (already working).
- `apps/whatsapp-worker`: no dedicated `/health` route yet — `GET /webhook` with correct verify-token params returns 200.
- `apps/mission-worker`: no HTTP surface — check process liveness and `[mission-worker] polling every...` log line.
- `apps/hermes-gateway`: `GET /health` returns `{"healthy": true}`.
- Local Hermes: `scripts/hermes-health`.
