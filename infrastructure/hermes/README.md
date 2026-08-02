# Local Hermes development environment

Free, local-only Hermes setup for development — no paid hosting. This
directory was authored in an environment without Docker installed (`docker
--version` returned "command not found"), so `docker-compose.yml` is
statically written against Hermes's expected HTTP contract
(`packages/hermes/src/http-adapter.ts`) rather than verified by an actual run
tonight. See `MANUAL_SETUP_REQUIRED.md` at the repo root for the exact steps
to complete this locally once Docker is available.

## Prerequisites

- Docker + Docker Compose
- A local Hermes runtime image (this repo does not contain or build the
  Hermes engine itself — it's a separate project). Set `HERMES_IMAGE` in
  `.env` to point at whatever image you build/pull for it.

## Setup

1. `cp infrastructure/hermes/.env.example infrastructure/hermes/.env`
2. Fill in `HERMES_SHARED_SECRET` (generate one, see `.env.example`) and
   `HERMES_IMAGE`.
3. Set the *same* `HERMES_SHARED_SECRET` in the environment `apps/mission-worker`
   and `apps/hermes-gateway` run with, plus:
   - `HERMES_MODE=http` (mission-worker; defaults to `disabled` otherwise)
   - `HERMES_GATEWAY_URL=http://localhost:4100` (mission-worker, pointing at
     the container from `docker-compose.yml`)
   - `HERMES_GATEWAY_SECRET` (hermes-gateway; a *separate* secret from
     `HERMES_SHARED_SECRET`, used only for `packages/hermes`'s mission
     tokens — see `packages/hermes/src/token.ts`)
4. `scripts/hermes-start` to bring the container up.
5. `scripts/hermes-health` to confirm it's answering `/health`.
6. `scripts/hermes-smoke-test` to run one mock mission through the full
   local pipeline (this uses `MockHermesAdapter`, not the real container,
   so it works even without Docker — see below).

## If Docker isn't available

`MockHermesAdapter` (`packages/hermes/src/mock-adapter.ts`) requires no
network call and no container — set `HERMES_MODE=mock` for mission-worker
and the whole create-mission -> queue -> execute -> complete pipeline works
end to end against simulated Hermes output. This is what
`scripts/hermes-smoke-test` actually exercises tonight, since Docker is not
available in this session's environment.

Data persists in the `hermes_data` named Docker volume — nothing is written
outside the container's own storage.

Nothing here is exposed publicly. `docker-compose.yml` binds the port to
`127.0.0.1` explicitly; do not remove that binding or tunnel it out without
understanding the security implications first.
