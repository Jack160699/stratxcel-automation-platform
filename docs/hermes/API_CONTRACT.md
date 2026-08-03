# API Contract

This documents the **actual Hermes Agent API surface** (as of commit `0845232`, tag
`v2026.8.3`, reviewed 2026-08-04) that `packages/hermes-contract` models, and how Stratxcel's
future integration layer is expected to use it. Hermes ships near-daily — re-verify field
names against `website/docs/user-guide/features/api-server.md` in the Hermes repo before wiring
this up for real.

## Chosen protocol: the Runs API

Hermes exposes three different surfaces (`/v1/chat/completions`, `/v1/responses`, and the Runs
API). Stratxcel uses the **Runs API** as the primary mission-execution protocol because it is
the only one of the three designed for long-running, tool-heavy, interruptible, approvable
work — exactly what a "mission" is:

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/runs` | POST | Submit a mission, get back a `run_id` immediately (async) |
| `/v1/runs/{run_id}` | GET | Poll current run state (fallback if SSE drops) |
| `/v1/runs/{run_id}/events` | GET (SSE) | Stream progress: `assistant.delta`, `tool.started`, `tool.completed`, `run.completed`, `subagent.start`, `subagent.complete` |
| `/v1/runs/{run_id}/stop` | POST | Interrupt a running turn (mission cancellation) |
| `/v1/runs/{run_id}/approval` | POST | Resolve a pending approval |
| `/v1/models` | GET | List available models |
| `/v1/capabilities` | GET | Machine-readable API surface description |
| `/health`, `/health/detailed` | GET | Health checks |
| `/api/jobs*` | GET/POST/PATCH/DELETE | Scheduled/recurring missions (cron) |

`/v1/chat/completions` and `/v1/responses` remain available for any future simple,
short-lived, non-mission LLM call Stratxcel might want to make through the same Hermes
deployment (e.g. a quick classification), but are **not** the mission-submission path.

## Authentication

Bearer token in the `Authorization` header on every request:

```
Authorization: Bearer <API_SERVER_KEY>
```

`API_SERVER_KEY` is required by Hermes for every deployment, including loopback-only binds —
there is no unauthenticated mode. Stratxcel additionally never calls this from a browser (see
[ARCHITECTURE.md](ARCHITECTURE.md)); the token lives only in Stratxcel's server-side
environment, never shipped to a client.

## Mission identity and idempotency

Hermes' native `/v1/runs` request does not itself define a caller-supplied idempotency key in
the documented surface. Stratxcel's contract (`SubmitMissionRequest`) adds one at the
application layer:

- `missionId` (Stratxcel-generated UUID) — one per submission attempt, unique per tenant.
- `idempotencyKey` — Stratxcel's integration layer must de-duplicate on this *before* calling
  Hermes (i.e., if a `SubmitMissionRequest` with a known `idempotencyKey` is retried, the
  integration layer returns the original `run_id` instead of calling `/v1/runs` again). This is
  a Stratxcel-side responsibility, not a Hermes-native guarantee — see
  [FAILURE_RETRY_IDEMPOTENCY.md](FAILURE_RETRY_IDEMPOTENCY.md).

## Session / memory scoping

Hermes supports `X-Hermes-Session-Key` (max 256 chars, echoed back on every response, used to
scope transcript/memory independent of session rotation) and named `conversation` chaining via
`previous_response_id` on `/v1/responses`. Stratxcel sets `X-Hermes-Session-Key` to
`{tenantId}:{profile}` (never raw tenant secrets) so memory scoping aligns with
[TENANT_ISOLATION.md](TENANT_ISOLATION.md) without leaking identifiers.

## Streaming

SSE (`text/event-stream`) on `/v1/runs/{run_id}/events`. Per the docs: "Unconsumed event
buffers expire after five minutes" — a client that disconnects and reconnects within 5 minutes
resumes; beyond that, fall back to `GET /v1/runs/{run_id}` for final state.
`HermesExecutionEvent` in the contract package models this stream — see
[EVENT_MODEL.md](EVENT_MODEL.md) for the full event taxonomy.

## Approvals mid-run

`POST /v1/runs/{run_id}/approval` resolves a pending approval on a paused run. The exact SSE
event name Hermes emits when a run pauses awaiting approval was **not confirmed** in the pages
reviewed — flagged in [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md) as "verify against
`gateway/` source or a live `/v1/capabilities` response before implementation." The contract
package's `ApprovalRequest`/`ApprovalDecision` types are shaped conservatively (superset of
likely fields) so they can be tightened once confirmed, without a breaking change.

## Tool calls surfaced to Stratxcel

`/v1/responses`-style output items (`function_call`, `function_call_output`) and Runs API
`tool.started` / `tool.completed` events both carry tool name + arguments + result. The
contract's `ToolRequest` / `ToolResult` types are intentionally provider-shape-compatible with
both, since Hermes' own docs show near-identical structures across the two surfaces.

## Cost / usage

Both `/v1/chat/completions` and `/v1/responses` return a `usage` object
(`prompt_tokens`/`completion_tokens`/`total_tokens` or `input_tokens`/`output_tokens`). The
Runs API's own usage-reporting shape was not directly confirmed from the pages fetched;
`UsageAndCost` in the contract normalizes both known shapes and is marked extensible.

## What this branch does NOT do

No code in `app/`, `lib/`, or anywhere outside `packages/hermes-contract` calls any of the
above. This document exists so the *next* branch (the real integration) has a verified, cited
contract to build against instead of guessing.
