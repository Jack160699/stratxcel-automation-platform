# Local Hermes Agent development environment

Free, local-only setup for the real upstream engine — no paid hosting. This
directory targets [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent),
the self-hosted "grows with you" agent, run in its documented API-server
mode (`gateway run` / `API_SERVER_ENABLED=true`). Verified against its
published docs on 2026-08-09 (see `HERMES_SKILLS_AND_TOOLS.md` for exact
citations) — not verified by an actual `docker compose up` in this session
(Docker unavailable here), so this is statically written against the
documented `docker run` example rather than proven by a real round trip.

This corrects an earlier version of this file, written before the upstream
engine had been identified, which described a generic `${HERMES_IMAGE}`
placeholder and an HMAC-signature auth scheme StratExcel invented for a
`/missions/execute`-shaped contract that turned out not to exist upstream.
The real engine is `nousresearch/hermes-agent`; the real auth is a static
bearer token (`API_SERVER_KEY`).

## Prerequisites

- Docker + Docker Compose.
- An account/API key with a supported inference provider (see
  `HERMES_SKILLS_AND_TOOLS.md`'s provider section) — Hermes Agent needs a
  model to call; it does not ship one. Recommended default: OpenRouter.

## Setup

1. Generate a bearer key for the API server: `openssl rand -hex 32` (or
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   on Windows without OpenSSL).
2. Export it as `HERMES_API_KEY` in your shell (this is `docker-compose.yml`'s
   `API_SERVER_KEY`) and export your chosen provider's key
   (`OPENROUTER_API_KEY`, or whichever provider you picked — see
   `docker-compose.yml`'s `environment:` block for the OpenRouter example).
3. Set the *same* `HERMES_API_KEY` value in the environment `apps/mission-worker`
   runs with, plus:
   - `HERMES_MODE=http` (defaults to `disabled` otherwise)
   - `HERMES_GATEWAY_URL=http://localhost:8642` (pointing at the container
     from `docker-compose.yml`)
   - `STRATXCEL_TOOL_GATEWAY_URL=http://localhost:8082` (apps/hermes-gateway's
     own address — where the run's prompt tells Hermes to call back for
     StratExcel tools; see http-adapter.ts's tool-bridge note for why this
     is currently prompt-based rather than a native tool/MCP registration)
4. `docker compose -f infrastructure/hermes/docker-compose.yml up -d`
5. `curl http://localhost:8642/health` to confirm it's answering (no auth
   needed for this endpoint per Hermes Agent's docs).
6. `scripts/hermes-smoke-test` still runs against `MockHermesAdapter`, not
   this container — see "If Docker isn't available" below.

## Open question this environment could not resolve

Whether Hermes Agent's MCP-server or plugin extensibility points can be
scoped to a single API request (one StratExcel mission's tool allowlist)
rather than being installation-wide is not documented anywhere this session
could reach. Until that's confirmed against a real running instance,
`http-adapter.ts` inlines the mission token, tool list, and this callback
URL into the run's prompt and relies on Hermes having some general-purpose
HTTP tool available to it — itself unconfirmed. Confirming or replacing this
with real MCP wiring is the first thing to do once Docker and a provider key
are both available. See `MANUAL_SETUP_REQUIRED.md` M9.

## If Docker isn't available

`MockHermesAdapter` (`packages/hermes/src/mock-adapter.ts`) requires no
network call and no container — set `HERMES_MODE=mock` for mission-worker
and the whole create-mission -> queue -> execute -> complete pipeline works
end to end against simulated Hermes output. This is what
`scripts/hermes-smoke-test` actually exercises, since Docker is not
available in this session's environment either.

Data persists in the `hermes_data` named Docker volume, mounted at
`/opt/data` per Hermes Agent's documented layout (config, keys, sessions,
memory) — nothing is written outside the container's own storage.

Nothing here is exposed publicly. `docker-compose.yml` binds the port to
`127.0.0.1` explicitly; do not remove that binding or tunnel it out without
understanding the security implications first. On the production host
recommendation (a separate machine from the shared t3.small — see
`MANUAL_SETUP_REQUIRED.md` M11), bind to that host's private/VPC interface
instead, never a publicly routable one.
