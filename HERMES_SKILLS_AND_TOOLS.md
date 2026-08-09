# Hermes Skills and Tools

## The real upstream engine (identified and verified 2026-08-09)

**Upstream:** [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) — "the agent that grows with you," a self-hosted, single-installation autonomous agent with persistent cross-session memory, a persona file (`SOUL.md`), 60+ built-in tools, MCP/plugin extensibility, and an OpenAI-compatible API server. This is **not** a purpose-built multi-tenant mission-execution backend — it's a personal-agent product that happens to expose an HTTP API server StratExcel can drive. Previous versions of this repo's `packages/hermes/src/http-adapter.ts` were written against a `/missions/execute`-shaped contract invented for a Hermes engine that was never actually identified or checked against a real spec — that contract does not exist upstream. This section replaces that guess with the real, verified one.

**Verified against (2026-08-09):** the official docs site (`hermes-agent.nousresearch.com/docs`), cross-checked against the raw GitHub source markdown at `NousResearch/hermes-agent@main` so a doc-rendering artifact couldn't produce a false positive, plus the official Docker Hub image's linked setup docs.

**Verified API surface** (self-hosted via `nousresearch/hermes-agent gateway run`, bearer auth via `API_SERVER_KEY`, default bind `127.0.0.1:8642`):
- `POST /v1/runs` → `{ run_id }`
- `GET /v1/runs/{run_id}` → a `hermes.run` object with a `status` field
- `GET /v1/runs/{run_id}/events` → SSE lifecycle stream (not consumed by this adapter yet — polling is simpler to get right first)
- `POST /v1/runs/{run_id}/stop`, `POST /v1/runs/{run_id}/approval`
- `POST /v1/chat/completions`, `POST /v1/responses` (OpenAI-compatible)
- `GET /v1/capabilities`, `GET /health`, `GET /health/detailed`

**BEST-EFFORT / unconfirmed** (not published anywhere this session could reach — needs confirming against a real running instance, see `MANUAL_SETUP_REQUIRED.md` M9): the exact `POST /v1/runs` request body schema, and `GET /v1/runs/{id}`'s `status` value vocabulary. `hermes-agent-client.ts` and `http-adapter.ts` both mark every guessed field explicitly and degrade safely (unrecognized status → keep polling, never a false `COMPLETED`).

**Genuinely open integration question:** Hermes Agent's real tool-extension points (MCP servers, plugins) are documented as configured per-installation, not scoped per-API-request — this session could not confirm whether a single shared Hermes deployment can restrict tool access to one mission's `allowedTools` at the wire level. Until confirmed, `http-adapter.ts` inlines the mission token, tool list, and `apps/hermes-gateway`'s URL directly into the run's prompt and relies on Hermes having some general-purpose HTTP-capable tool — itself unconfirmed for this exact use. This is a named gap, not a silent one.

## Runtime adapters (`packages/hermes`)

| Adapter | Mode | Behavior |
|---|---|---|
| `DisabledHermesAdapter` | `disabled` (default) | Every mission it "executes" moves to `BLOCKED` with a clear reason. Never hangs, never silently completes. |
| `MockHermesAdapter` | `mock` | Deterministic, no network: `COMPLETED` for a recognized service, `PARTIALLY_COMPLETED` otherwise, with a believable progress-event sequence. For automated preview demos and local dev only. |
| `HermesHttpAdapter` | `http` | Real bearer-authenticated HTTP client against the verified `/v1/runs` contract above (`hermes-agent-client.ts`). Polls to a terminal status, bounded by `HERMES_RUN_MAX_MS` (default 10 minutes); `HermesTimeoutError`/`HermesUnavailableError` classify what mission-worker should retry vs. not. Inert — no Hermes instance is reachable from this session (Docker unavailable), so this is validated by `__tests__/http-adapter.test.ts` (a fake `fetch`) and by the runtime tests actually run this session, not by a real round trip. |

`selectHermesAdapter()` reads `HERMES_MODE`, defaulting to `disabled` for anything unset or unrecognized — the same fail-safe pattern used for the WhatsApp/Razorpay integration-mode flags.

### Config for `HERMES_MODE=http`

- `HERMES_GATEWAY_URL` — the running Hermes Agent instance's base URL (e.g. `http://<host>:8642`). Confusingly named after Hermes's *own* API server, not StratExcel's `apps/hermes-gateway` — kept for continuity with the existing env var rather than churning it, but worth remembering they are two different things.
- `HERMES_API_KEY` — Hermes Agent's own `API_SERVER_KEY` bearer token. **Renamed from `HERMES_SHARED_SECRET`** (see `MANUAL_SETUP_REQUIRED.md` M9) because that name described an HMAC-signing secret for a contract that turned out not to exist; the real server only checks a static bearer token, so the old name would have been actively misleading.
- `STRATXCEL_TOOL_GATEWAY_URL` — `apps/hermes-gateway`'s own address, threaded into the run's prompt so the tool-bridge instructions (above) have somewhere real to point at. New; nothing previously wired this end to end.
- `HERMES_RUN_MAX_MS` — optional, default 10 minutes; how long `execute()` polls before giving up and calling `stop`.

### Profiles

`resolveProfileInstructions()` (`packages/hermes/src/profiles.ts`) maps each of the six `hermes_profile` values to a StratExcel-authored persona/instruction preamble sent as part of the run's `instructions`. Hermes Agent has no native per-request profile switch (its own "profiles" concept is machine-level — separate config/state/credential directories for running several installations side by side, not a field on one API call), so this keeps StratExcel as the authorization/behavior authority exactly as the master brief requires, rather than delegating that decision into Hermes.

## Mission-scoped authorization

`issueMissionToken({ missionId, tenantId, allowedTools, ttlMs })` produces a compact, HMAC-signed, 15-minute-default token — this is what stands in for raw credentials in Hermes's hands. `apps/hermes-gateway` verifies it on every tool call and rejects anything not in the token's `allowedTools`. `HermesHttpAdapter` now inlines this token into the run's prompt for the same purpose (see the tool-bridge note above) — `MockHermesAdapter`/`DisabledHermesAdapter` still ignore it, since neither makes a real call anywhere.

## The 12 restricted tools

Defined as type contracts in `packages/hermes/src/tools/contracts.ts`, implemented as handlers in `apps/hermes-gateway/src/tool-handlers.ts`:

| Tool | Implemented? | Backed by |
|---|---|---|
| `get_brand_context` | Yes | `@stratxcel/brand-brain` |
| `get_service_definition` | Yes | `@stratxcel/missions`' service catalogue |
| `create_draft_artifact` | Yes | `mission_artifacts` table via `@stratxcel/missions` |
| `update_mission_progress` | Yes | `appendMissionEvent` |
| `request_approval` | Yes | `@stratxcel/approvals` |
| `get_approval_status` | Yes | `@stratxcel/approvals` |
| `create_human_handoff` | Yes | `@stratxcel/human-handoff` |
| `query_publication_status` | Stubbed | Always returns `"unknown"` — no publishing pipeline is wired to Hermes yet |
| `create_crm_lead` | Yes | `@stratxcel/leads-and-crm` |
| `attach_research_evidence` | Yes | `appendMissionEvent` (as a `research_evidence` event) |
| `submit_publish_request` | **Not callable** | In `STRATXCEL_CONTROLLED_TOOLS` — rejected at dispatch regardless of token contents |
| `create_website_change_request` | **Not callable** | Same — publishing/deployment stay StratExcel-controlled per the master brief |

Every successful tool call is recorded via `recordAuditEvent` (`action: hermes.tool_call.<name>`).

## Budget

`packages/hermes/src/budget.ts`'s `assertWithinBudget` checks a running spend total against the mission's `estimated_cost_cents` ceiling (already reserved from the wallet at mission-creation time). **Real per-tool-call cost metering does not exist** — no per-tool pricing model has been defined — so this validates against the ceiling only; it's a named extension point, not a stub pretending to meter something it doesn't.

## Inference provider

Hermes Agent needs a model to call and ships with none — this is entirely internal to the Hermes Agent process and, by construction, invisible to StratExcel: `http-adapter.ts` only ever talks to Hermes's own bearer-authenticated API server, never to a model provider directly, so switching Hermes's underlying model later requires zero StratExcel code changes.

Verified supported providers (2026-08-09) include Nous Portal, OpenRouter, Anthropic, OpenAI, Google Gemini/Vertex, AWS Bedrock, Azure AI Foundry, GitHub Copilot, xAI, and 15+ other first-class API-key providers, plus any OpenAI-compatible custom endpoint and self-hosted options (Ollama, vLLM, etc.).

**Recommended: OpenRouter.** Pay-per-token (no subscription commitment), one API key covers a large model catalogue, confirmed tool-calling support, and the underlying model can be changed entirely inside Hermes's own config without touching this repo. **Alternative: Google Gemini direct** (`GOOGLE_API_KEY`) if per-token cost needs to go lower than OpenRouter's markup, or **Anthropic direct** if tool-calling reliability is prioritized over cost. No account has been created and no key has been requested — see `MANUAL_SETUP_REQUIRED.md` M9.

## Local Hermes

`infrastructure/hermes/` (docker-compose, README) targets the real `nousresearch/hermes-agent` image's documented `gateway run` API-server mode; `scripts/hermes-{start,stop,health,smoke-test}` are written and statically reviewed — Docker was unavailable this session, so only `scripts/hermes-smoke-test` (which exercises `MockHermesAdapter` directly, no Docker needed) has actually run. See `MANUAL_SETUP_REQUIRED.md` M8.
