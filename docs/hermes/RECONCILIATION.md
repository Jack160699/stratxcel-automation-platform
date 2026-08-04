# Reconciliation: retiring the invented protocol

This branch (`feat/hermes-runtime-adapter`, based on `feat/hermes-integration-foundation`
@ `845b4fb`) is the follow-up work `docs/hermes/MANUAL_REQUIREMENTS.md` items 8–10 called for.
It classifies every existing Hermes-related file and states what changes.

The foundation branch's own `ARCHITECTURE.md` already documented the mismatch precisely: an
earlier session built `packages/hermes` and `apps/hermes-gateway` against an invented
`POST {baseUrl}/missions/execute` protocol with custom `X-Hermes-Signature` HMAC signing,
because it had no way to research the real Hermes Agent product. That research is now done
(`docs/hermes/*`) and — beyond the docs — this branch adds direct empirical verification from a
locally-installed, patched Hermes v0.20.0 instance (rootless Docker backend, bearer-authed Runs
API, one completed end-to-end mission). Several items the foundation docs flagged as
**unconfirmed** are resolved by that empirical evidence; see "Corrections to the foundation docs"
below and `docs/hermes/API_CONTRACT.md`/`EVENT_MODEL.md` as updated by this branch.

## Classification

| File | Classification | Why |
|---|---|---|
| `packages/hermes/src/adapter.ts` | **replace** (interface shape) | `execute()` is a single opaque async call. The real Runs API is submit-then-stream-then-poll with a separate stop/approval call; the interface must expose that shape (see Phase 3 below), not just proxy a fake all-in-one call. |
| `packages/hermes/src/http-adapter.ts` | **replace** | Calls the invented `/missions/execute` + `/missions/{id}/cancel` with HMAC signing. Real Hermes has no such routes; it uses `Authorization: Bearer <API_SERVER_KEY>` against `/v1/runs*`. |
| `packages/hermes/src/mock-adapter.ts` | **adapt** | Deterministic fake-execution concept is still exactly right for tests/dev; its method bodies move to the new interface shape. |
| `packages/hermes/src/disabled-adapter.ts` | **adapt** | Same — fail-safe default concept retained, method bodies updated. |
| `packages/hermes/src/select-adapter.ts` | **adapt** | `HERMES_MODE` (`disabled`/`mock`/`http`) fail-safe-default pattern retained (see "env var decision" below) — this is the established, tested convention in this codebase and is kept in preference to inventing a parallel `HERMES_RUNTIME_ENABLED` boolean. |
| `packages/hermes/src/signing.ts` | **retain** | Generic HMAC-SHA256 helper. Still used by `token.ts` for mission-scoped tool tokens (an inbound-direction concern, unrelated to the invented outbound protocol). Its use inside `http-adapter.ts` disappears when that file is replaced; the primitive itself is not the invented part. |
| `packages/hermes/src/token.ts` | **retain** | Short-lived, mission-scoped tokens for Hermes calling back into `apps/hermes-gateway`'s tool endpoints. This is the "Stratxcel MCP tool server" credential-boundary concept the foundation docs call for, already implemented and tested. Not part of the outbound submission protocol being replaced. |
| `packages/hermes/src/context.ts` | **retain** | `compileMissionContext` (Brand Brain snapshot, service definition, default tool allowlist) is protocol-agnostic mission-context compilation. Reused as-is by the new adapter/worker. |
| `packages/hermes/src/budget.ts` | **adapt** | `assertWithinBudget`'s per-tool-call ceiling check is sound and extended (not replaced) in Phase 9 with per-profile/tenant limits and usage-based tracking. |
| `packages/hermes/src/types.ts` | **partially replace** | `ToolName` (12-tool closed union) and `MissionScopedContext` are retained as-is. `HermesOutcome`/`HermesExecutionResult`/`HermesProgressEvent` are superseded by `@stratxcel/hermes-contract`'s `MissionOutcome`/`HermesExecutionEvent` (event-stream-shaped, not single-result-shaped) — kept only as deprecated aliases for one release to avoid a silent break of any other importer, removed once confirmed unused. |
| `packages/hermes/src/tools/contracts.ts` | **retain** | The 12-tool contract map (`ToolContractMap`, `ALL_TOOL_NAMES`, `STRATXCEL_CONTROLLED_TOOLS`) is real, tested business logic per `ARCHITECTURE.md`'s own assessment — no rework needed. |
| `apps/hermes-gateway/*` | **retain, migration tracked separately** | The 12-tool HTTP server's business logic doesn't change. It needs an MCP-compatible transport to be reachable by real Hermes as `mcp_stratxcel_*` tools (`MANUAL_REQUIREMENTS.md` item 9) — that transport work is **not done in this branch** (no running MCP server is stood up; see Phase 7's scope note) and is recorded here so it isn't lost. |
| `apps/mission-worker/src/worker.ts` | **adapt** | The poller, lease/heartbeat claim loop (via `@stratxcel/queue`), and audit-logging wrapper are sound and retained unchanged. Only `executeMission()`'s body changes, from one blocking `hermes.execute()` call to submit → consume SSE with immediate persistence → poll-on-disconnect → reconcile. |
| `infrastructure/hermes/docker-compose.yml`, `infrastructure/hermes/README.md` | **temporarily migrate** | Built around the invented `HERMES_IMAGE` assumption. Not deleted (out of caution — some operator may reference it), but its `README.md` now leads with a deprecation notice pointing at `infra/hermes/` (the foundation branch's correct scaffolding for the real `NousResearch/hermes-agent` deployment), and its `docker-compose.yml` is left as-is with a header comment marking it superseded. Full removal is a follow-up once nothing external references the old path. |
| `infra/hermes/*` | **retain, no change** | Already correct (real `API_SERVER_KEY` bearer auth, not HMAC) — this branch's `Phase 2` doc corrections apply to `docs/hermes/*`, not to `infra/hermes/*`, which needed no protocol fix. |
| `packages/missions/*` | **retain** | Mission state machine, repository, `MissionRow`/`MissionEventRow` shapes are protocol-agnostic and already carry `hermes_run_id`/`hermes_profile`/`idempotency_key`. Extended (not replaced) with a small number of run-tracking columns in Phase 5's migration. |
| `packages/approvals/*`, `packages/audit/*`, `packages/queue/*` | **retain** | Real, tested, protocol-agnostic. `packages/queue`'s `QueueJobRow` already has `lease_owner`/`lease_expires_at`/`heartbeat_at`/`attempt_count` — this *is* the lease/heartbeat/attempt infrastructure Phase 4/5 asked for; not duplicated on the missions table. |
| `packages/hermes-contract/*` | **retain, corrected** | Already the target-state protocol model. Phase 2 corrects the SSE-replay claims and the approval event name per empirical findings (below), adds the event types this branch's live testing actually observed, and leaves everything else as-is. |
| `lib/social/agent/*`, `lib/social/repositories/agent-runs.ts`, `app/admin/social/copilot/*` | **out of scope, untouched** | This is the live "Copilot" social-chat feature — a different product surface with its own model-calling code (`lib/social/agent/provider.ts`, direct Gemini/OpenAI calls), not a Hermes mission integration. Confirmed via investigation; not touched by this branch. |

## Corrections to the foundation docs (empirical, not speculative)

The foundation docs were built from Hermes' published documentation pages, correctly caveated as
unverified where the docs were silent. This branch's earlier work (separate from this repo)
patched, ran, and load-tested an actual local Hermes v0.20.0 instance against its own source, and
found:

1. **No 5-minute SSE buffer / resume window exists.** `docs/hermes/API_CONTRACT.md` and
   `FAILURE_RETRY_IDEMPOTENCY.md` state "unconsumed event buffers expire after five minutes" and
   that a reconnect within that window "resumes." Empirically false for v0.20.0: the server's
   `GET /v1/runs/{run_id}/events` handler pops and destroys the run's event queue in a `finally`
   block the instant *any* consumer disconnects, success or not. A second connection to an
   already-consumed run returns an immediate `404 run_not_found`, not a replay. Corrected in
   `EVENT_MODEL.md`/`API_CONTRACT.md`/`FAILURE_RETRY_IDEMPOTENCY.md` (Phase 2).
2. **The approval-pause event name is `approval.request`, not `run.paused_approval`.**
   `MANUAL_REQUIREMENTS.md` item 1 flagged this as unconfirmed; `packages/hermes-contract`'s
   `run.paused_approval` was a conservative placeholder. Confirmed from `api_server.py` source:
   the event is `approval.request`, run status becomes `waiting_for_approval`, and the paused
   tool's `command` field is redacted server-side before the event ever reaches the SSE stream.
3. **The Runs API's `usage` shape is confirmed**: `{ input_tokens, output_tokens, total_tokens }`
   on the terminal `GET /v1/runs/{run_id}` response — resolves `MANUAL_REQUIREMENTS.md` item 4.
4. **The real SSE event name is `message.delta`, not `assistant.delta`.** Source-confirmed.
5. **`run.completed`/`run.failed`/`run.cancelled` are three separate event types**, not one
   `run.completed` event carrying a `status` field. `packages/hermes-contract`'s
   `HermesExecutionEvent` discriminated union is corrected to match (Phase 2).
6. **A durable transcript-backfill path exists**: `GET /api/sessions/{run_id}/messages` (session
   id defaults to the run id when the caller doesn't set one) returns the full ordered
   conversation + tool-call transcript for a run, even for events an SSE client never received.
   Not documented anywhere in Hermes' published docs — discovered from source and confirmed live.
   Treated as an **optional, capability-gated** recovery aid per this task's explicit instruction,
   not a stable contract guarantee (see `HERMES_TRANSCRIPT_BACKFILL_ENABLED` in Phase 3).

Items 2/3 resolve `MANUAL_REQUIREMENTS.md` open items 1 and 4 outright. Item 1 corrects a docs
claim that would otherwise have led a real implementation to trust a resume window that doesn't
exist. `MANUAL_REQUIREMENTS.md` items 2 (outbound webhook signature headers), 3 (exact MCP
include/exclude YAML shape), 5 (`session_search` tenant scoping) remain genuinely open — nothing
in this branch's local testing exercised webhooks, MCP config, or `session_search`.

## Env var decision

Per this task's instruction to prefer this repo's existing naming where it differs from the
suggested names: `HERMES_MODE` (`disabled` | `mock` | `http`) is kept as the primary switch,
matching `packages/hermes/src/select-adapter.ts`'s established, tested pattern (same shape as
`@stratxcel/whatsapp` and `@stratxcel/payments-and-wallet`'s integration-mode flags). A separate
`HERMES_RUNTIME_ENABLED` boolean was not introduced — it would only ever equal
`HERMES_MODE !== "disabled"`, and having two switches that must be kept in sync is worse than
one. New vars (`HERMES_BASE_URL`, `HERMES_API_KEY`, `HERMES_REQUEST_TIMEOUT_MS`,
`HERMES_SSE_IDLE_TIMEOUT_MS`, `HERMES_TRANSCRIPT_BACKFILL_ENABLED`) follow the existing `HERMES_*`
prefix. `HERMES_GATEWAY_URL`/`HERMES_SHARED_SECRET` (the invented protocol's vars) are retired;
`HERMES_GATEWAY_SECRET` (used by `token.ts` for the *inbound* tool-callback direction) is
unrelated and unchanged.

## Required local Hermes patch

The Hermes instance this branch's empirical findings came from is **not stock v0.20.0** — it
carries one local security patch, required for any local/dev testing against the Docker terminal
backend with `terminal.docker_network: false`:

| | |
|---|---|
| Upstream base | `a991dfc25daf68994c21d6adcdfbafb1b3dc23cf` (`NousResearch/hermes-agent`, tag `v2026.8.3`) |
| Local patch branch | `fix/docker-probe-network-policy` |
| Local patch commit | `76503a2` |
| Defect fixed | `agent/prompt_builder.py::_probe_remote_backend()` (an internal, once-per-process backend-capability probe used to build the system prompt) independently rebuilt a `container_config` dict for the shared Docker-environment factory and omitted the `docker_network` key — every other call site in Hermes' own codebase includes it. The omission silently gave that one probe container network access regardless of the operator's `terminal.docker_network: false` setting. Fixed by adding the missing key; verified live (`NetworkMode: none`, a real `curl` from inside the probe container fails at the OS level) and with new regression tests. |
| Not upstreamed | The patch lives only in a local worktree (`/home/shriyansh/.hermes/hermes-agent-fix-docker-network` inside `Hermes-Ubuntu`), on top of the unmodified installed checkout. It has not been submitted to `NousResearch/hermes-agent`. |
| Version/update risk | **A future `hermes update` (or any redeployment from a fresh `NousResearch/hermes-agent` checkout) will silently lose this patch** and reintroduce the network-policy gap for that one probe path, unless the patch is either (a) upstreamed and merged before that update, or (b) reapplied manually after every update. This is a real, live operational risk for any production Hermes deployment Stratxcel stands up — track it as a deployment runbook step in [DEPLOYMENT.md](DEPLOYMENT.md), not just in this doc. |
| Practical impact if unpatched | Narrow: only this one internal prompt-building probe is affected, not the mission-executing terminal sandbox itself (verified separately as already correct). Still a real containment gap worth carrying the patch for. |

## What this branch does not resolve

Per `MANUAL_REQUIREMENTS.md`, still open and not decided here: private network mechanism between
Vercel and the Hermes host, Hermes hosting provider, model provider for a production Hermes
deployment, per-plan-tier timeout values, `apps/hermes-gateway`'s MCP transport, and whether
dispatch-time tool rejection or `ApprovalRequest` creation is the long-term pattern for
newly-sensitive tools. These require a human decision or infrastructure that doesn't exist yet
and are out of this branch's scope by the same reasoning the foundation branch used.
