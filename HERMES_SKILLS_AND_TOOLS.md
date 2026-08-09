# Hermes Skills and Tools

## The real upstream engine (identified and verified 2026-08-09)

**Upstream:** [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) — "the agent that grows with you," a self-hosted, single-installation autonomous agent with persistent cross-session memory, a persona file (`SOUL.md`), 60+ built-in tools, MCP/plugin extensibility, and an OpenAI-compatible API server. This is **not** a purpose-built multi-tenant mission-execution backend — it's a personal-agent product that happens to expose an HTTP API server StratExcel can drive. Previous versions of this repo's `packages/hermes/src/http-adapter.ts` were written against a `/missions/execute`-shaped contract invented for a Hermes engine that was never actually identified or checked against a real spec — that contract does not exist upstream. This section replaces that guess with the real, verified one.

**Verified against (2026-08-09):** the official docs site (`hermes-agent.nousresearch.com/docs`), cross-checked against the raw GitHub source markdown at `NousResearch/hermes-agent@main` so a doc-rendering artifact couldn't produce a false positive, plus the official Docker Hub image's linked setup docs.

**Update 2026-08-10 — deployed and verified against a live instance.** `stratxcel-hermes` (EC2 `i-044f62e461200dda9`, private IP `172.31.4.241:8642`) runs the real `nousresearch/hermes-agent:latest` image (v0.20.0). Everything marked BEST-EFFORT below on 2026-08-09 has since been checked directly against that instance's own behavior **and** its installed source (`gateway/platforms/api_server.py`, read via `docker exec` + `grep`/`sed` — not guessed). See `packages/hermes/src/hermes-agent-client.ts`'s module comment for the full verified request/response schema and status vocabulary.

**Verified API surface** (self-hosted via `nousresearch/hermes-agent gateway run`, bearer auth via `API_SERVER_KEY`):
- `POST /v1/runs` → `{ run_id, status: "started" }` (202). Body: `{ input, instructions?, model?, provider?, session_id?, conversation_history?, previous_response_id? }` — `model`/`provider` let a caller override Hermes's own default routing (see the provider section below for why this matters); a `metadata` field is accepted but silently ignored by the handler.
- `GET /v1/runs/{run_id}` → a `hermes.run` object: `{ object, run_id, status, created_at, updated_at, session_id, model, last_event, output? (completed only), usage? ({input_tokens, output_tokens, total_tokens}, completed only), error? (failed only) }`.
- **Exhaustive real status vocabulary:** `queued` → `running` → one of `completed` | `failed` | `cancelled` | `stopping` (transient) | `waiting_for_approval` (unreachable in this deployment — see toolset hardening below).
- `GET /v1/runs/{run_id}/events` → SSE lifecycle stream (not consumed by this adapter — polling is simpler to get right first)
- `POST /v1/runs/{run_id}/stop` → `{ run_id, status: "stopping" }` (200); 404 for an unknown run
- `POST /v1/runs/{run_id}/approval` → body `{ choice: "once"|"session"|"always"|"deny", all?/resolve_all? }` → `{ object, run_id, choice, resolved }`
- `POST /v1/chat/completions`, `POST /v1/responses` (OpenAI-compatible)
- `GET /v1/capabilities`, `GET /v1/toolsets`, `GET /health`, `GET /health/detailed` — all confirmed live

**Resolved integration question — Hermes's tool-extension points are per-installation, not per-request.** Confirmed both from `/v1/capabilities` (`runtime.tool_execution: "server"`, `split_runtime: false`) and from source: toolsets are resolved from `config.yaml`'s `platform_toolsets.api_server` key (undocumented in the shipped config's own comments — found by grepping the installed source, not by guessing), and there is no per-`POST /v1/runs` field that scopes tools to one mission. **Consequence:** StratExcel's mission-scoped `allowedTools` cannot be enforced through Hermes's native tool-calling at all — not "restricted to it," genuinely unenforceable via that path. **Mitigation applied:** `platform_toolsets.api_server` is hardened to `[]` on the live deployment — verified via `GET /v1/toolsets` that all 27 built-in toolsets (terminal, file, code_execution, browser, web, image_gen, ...) report `enabled: false`, survives `systemctl restart hermes-agent` and a full instance reboot. Before this fix, every one of those was `enabled: true` by default, including unsandboxed `terminal` (`config.yaml`'s `terminal.backend: "local"`) — the runtime's own startup log warns about exactly this ("Agent work dispatched through this endpoint runs as the host user with full terminal/file access"). This was a real, live security gap, not a hypothetical one, closed the same day it was found.

The practical effect: `http-adapter.ts`'s inlined-prompt tool bridge (mission token + tool list + `apps/hermes-gateway` URL in the run's `instructions`) has no way to actually execute today — the model has zero local tools, including none capable of making an authenticated HTTP call on StratExcel's behalf. Building real per-mission tool access requires a genuine MCP server StratExcel would host, that each mission's Hermes run connects to — unbuilt, and not safely buildable by re-enabling the built-in toolset (that reopens the exact gap just closed). This is the honest state of Phase 4 of the integration: engine connection and run lifecycle are real and verified; the tool bridge is not yet functional.

## Runtime adapters (`packages/hermes`)

| Adapter | Mode | Behavior |
|---|---|---|
| `DisabledHermesAdapter` | `disabled` (default) | Every mission it "executes" moves to `BLOCKED` with a clear reason. Never hangs, never silently completes. |
| `MockHermesAdapter` | `mock` | Deterministic, no network: `COMPLETED` for a recognized service, `PARTIALLY_COMPLETED` otherwise, with a believable progress-event sequence. For automated preview demos and local dev only. |
| `HermesHttpAdapter` | `http` | Real bearer-authenticated HTTP client against the verified `/v1/runs` contract above (`hermes-agent-client.ts`). Polls to a terminal status, bounded by `HERMES_RUN_MAX_MS` (default 10 minutes); `HermesTimeoutError`/`HermesUnavailableError` classify what mission-worker should retry vs. not. Validated both by `__tests__/http-adapter.test.ts` (fixtures built from the verified live schema) and by a real `POST /v1/runs` → poll → `completed` round trip against `stratxcel-hermes` on 2026-08-10 (see the E2E test evidence in the verification report). Still not wired into the production mission-worker service — `HERMES_MODE` stays `disabled` there. |

`selectHermesAdapter()` reads `HERMES_MODE`, defaulting to `disabled` for anything unset or unrecognized — the same fail-safe pattern used for the WhatsApp/Razorpay integration-mode flags.

### Config for `HERMES_MODE=http`

- `HERMES_GATEWAY_URL` — the running Hermes Agent instance's base URL (e.g. `http://<host>:8642`). Confusingly named after Hermes's *own* API server, not StratExcel's `apps/hermes-gateway` — kept for continuity with the existing env var rather than churning it, but worth remembering they are two different things.
- `HERMES_API_KEY` — Hermes Agent's own `API_SERVER_KEY` bearer token. **Renamed from `HERMES_SHARED_SECRET`** (see `MANUAL_SETUP_REQUIRED.md` M9) because that name described an HMAC-signing secret for a contract that turned out not to exist; the real server only checks a static bearer token, so the old name would have been actively misleading.
- `STRATXCEL_TOOL_GATEWAY_URL` — `apps/hermes-gateway`'s own address, threaded into the run's prompt so the tool-bridge instructions (above) have somewhere real to point at. New; nothing previously wired this end to end.
- `HERMES_RUN_MAX_MS` — optional, default 10 minutes; how long `execute()` polls before giving up and calling `stop`.
- `HERMES_DEFAULT_MODEL` / `HERMES_DEFAULT_PROVIDER` — optional. Hermes's own default model routing (observed live: `anthropic/claude-opus-4.6` via `provider: "auto"`) can require more OpenRouter credit than a given account has funded — a real `HTTP 402` on 2026-08-10, not a hypothetical. Setting these two forces every run onto a specific, known-affordable model instead.

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

**Recommended: OpenRouter — now live.** An OpenRouter key is configured in `/etc/hermes-agent/hermes-agent.env` on `stratxcel-hermes` (2026-08-10). Confirmed working end to end: `POST /v1/chat/completions` and `POST /v1/runs`, both explicitly routed to the free `nvidia/nemotron-3-super-120b-a12b:free` model, returned real model output (exact-match test string) with real token usage. **Known account limitation:** Hermes's own default model/provider selection (no override) requires more credit than is currently funded on this OpenRouter account (a real `HTTP 402`, not simulated) — every mission needs `HERMES_DEFAULT_MODEL`/`HERMES_DEFAULT_PROVIDER` set (or more credit added) before `HERMES_MODE=http` goes live in production. **Alternative:** Google Gemini direct (`GOOGLE_API_KEY`) or Anthropic direct, unchanged from the original recommendation.

## Local Hermes / production Hermes host

`infrastructure/hermes/docker-compose.yml` targets the real `nousresearch/hermes-agent` image's `gateway run` mode and is now proven correct — `stratxcel-hermes` (EC2 `i-044f62e461200dda9`, ap-south-1, dedicated host, private IP only) runs this exact configuration via a `hermes-agent.service` systemd unit wrapping `docker compose`, verified to survive both a service restart and a full instance reboot (persistent data, hardened `config.yaml`, and toolset lockdown all intact afterward). Reachable only from the primary worker's security group (`sg-0ed6dd4d7d392b8d2`) on TCP 8642 — never a public CIDR. `scripts/hermes-{start,stop,health,smoke-test}` remain the local-dev path for `HERMES_MODE=mock`, unaffected by any of this.
