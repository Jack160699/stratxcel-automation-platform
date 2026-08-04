# Event Model

Two independent channels carry events out of Hermes. They are complementary, not
alternatives — see "Why two channels" below.

**This document was corrected on `feat/hermes-runtime-adapter` against a live,
source-verified Hermes v0.20.0 instance — see
[RECONCILIATION.md](RECONCILIATION.md#corrections-to-the-foundation-docs) for what changed
and why. The corrected sections below are live-verified, not docs-page-sourced.**

## Channel 1: Runs API SSE (primary) — live-verified

`GET /v1/runs/{run_id}/events`. Confirmed event types (source: `gateway/platforms/api_server.py`,
cross-checked against a real completed mission's event log):

| Event | Meaning | Maps to |
|---|---|---|
| `message.delta` | Incremental assistant text | `HermesExecutionEvent` (`type: "message.delta"`) |
| `reasoning.available` | Model reasoning/thinking content became available | `HermesExecutionEvent` (`type: "reasoning.available"`) |
| `tool.started` | A tool call began | `HermesExecutionEvent` + embeds `ToolRequest` |
| `tool.completed` | A tool call finished | `HermesExecutionEvent` + embeds `ToolResult` |
| `approval.request` | Run paused, awaiting a human decision; status becomes `waiting_for_approval` | `HermesExecutionEvent` (`type: "approval.request"`) |
| `approval.responded` | An approval decision was applied; run resumes to `running` | `HermesExecutionEvent` (`type: "approval.responded"`) |
| `subagent.start` | Delegated subagent work began (documented, not independently re-verified) | `HermesExecutionEvent` (`type: "subagent.start"`) |
| `subagent.complete` | Delegated subagent work finished (documented, not independently re-verified) | `HermesExecutionEvent` (`type: "subagent.complete"`) |
| `run.completed` | Terminal: run finished successfully | `HermesExecutionEvent` (`type: "run.completed"`) |
| `run.failed` | Terminal: run errored (e.g. provider error) | `HermesExecutionEvent` (`type: "run.failed"`) |
| `run.cancelled` | Terminal: run was stopped | `HermesExecutionEvent` (`type: "run.cancelled"`) |

**No buffer, no replay, no resume window.** The previously-documented "5-minute unconsumed
buffer" was sourced from Hermes' published docs and was never live-verified; it is **false** for
v0.20.0. The server's event-stream handler pops and destroys the run's in-memory event queue in a
`finally` block the instant *any* consumer disconnects — success, failure, or a network blip, it
does not matter. A second connection to the same `run_id` after any disconnect returns an
immediate `404 {"code": "run_not_found"}`, never a replay of missed events. Worse: if the run is
still executing when a client disconnects, **future events for that run are silently dropped**
(the event-push callback no-ops once the queue is gone) — the run itself keeps executing
server-side, it just stops being observable via that stream.

Stratxcel's integration layer must persist every event it receives **immediately**, before
processing the next one (see [OBSERVABILITY.md](OBSERVABILITY.md)) — not because the SSE stream
might replay on reconnect (it won't), but because there is no other way to reconstruct
intermediate events once missed. See "Recovery strategy" below for what to do instead of relying
on replay.

## Recovery strategy (no SSE replay exists)

1. **`GET /v1/runs/{run_id}` is the terminal-state source of truth**, independent of any SSE
   connection's lifecycle. Live-verified: it returns the correct terminal state, `output`, and
   `usage` (`{ input_tokens, output_tokens, total_tokens }`) even long after the SSE stream that
   would have carried the same information was dropped.
2. **`GET /api/sessions/{run_id}/messages` can backfill the full ordered tool-call transcript**
   for events that were never received live — not documented in Hermes' published API docs,
   discovered from source and confirmed live. Treated as optional/capability-gated (see
   `HERMES_TRANSCRIPT_BACKFILL_ENABLED`), not a guaranteed contract, because it isn't part of the
   documented API surface and could change without notice.
3. **Never assume a disconnect means the run stopped.** Reconcile via (1), and only use (2) as a
   best-effort backfill for UI/audit completeness, never as the basis for a state-machine
   transition on its own.

## Channel 2: outbound webhooks (durability backstop)

Hermes independently supports outbound webhooks configured in `config.yaml`: a list of HTTP
endpoints + lifecycle events they subscribe to, delivered as a signed JSON POST. Per the docs
(`user-guide/messaging/webhooks.md`, reviewed 2026-08-04):

- Delivery is **best-effort**: connection errors and 5xx are retried once with backoff; 4xx is
  not retried; failures are logged and dropped.
- The response body is ignored — outbound webhooks "observe, never steer." They cannot be used
  to inject an approval decision back into a paused run; that must go through
  `POST /v1/runs/{run_id}/approval`.
- Payloads are signed (same HMAC family as inbound webhooks — `X-Webhook-Signature-V2` +
  `X-Webhook-Timestamp`, HMAC-SHA256 of `<timestamp>.<body>`, ±300s replay window is the
  documented generic scheme; verify the exact outbound header names against source before
  implementation).

### Why two channels

SSE is push-based and immediate but is a live connection: if Stratxcel's process restarts or
loses the connection **at all** (there is no grace window — see "No buffer, no replay" above),
in-flight events are gone for good. Outbound webhooks are Hermes's own best-effort push, decoupled
from any open connection, so they serve as an **at-least-once durability backstop** for
`run.completed`/`run.failed`/`run.cancelled` — not for high-frequency `message.delta` noise, and
not an ordering guarantee (webhook delivery and SSE delivery are independent, unordered relative
to each other). Recommended v1 policy: subscribe SSE for live progress UI, subscribe outbound
webhook only to terminal/coarse events, treat webhook payloads as idempotent (dedupe on
`runId` + event type), and always reconcile via `GET /v1/runs/{run_id}` on service restart for any
run Stratxcel's DB still marks as non-terminal.

## Event envelope (Stratxcel-side)

Every event — from either channel — is normalized into `HermesExecutionEvent` (see
`packages/hermes-contract`) before it touches Stratxcel's audit log, carrying:

- `missionId`, `tenantId`, `runId` (Hermes' `run_id`)
- `sequence` (monotonic per run, assigned by Stratxcel on ingest — Hermes does not guarantee
  ordering across the two channels)
- `receivedVia: "sse" | "webhook"`
- the raw Hermes event type + payload, unmodified, for audit fidelity

## Inbound webhooks (not used in v1)

Hermes also supports *inbound* webhooks (`/webhooks/<route>`, port 8644, HMAC-signed) that can
trigger a mission from an external event (e.g., a GitHub PR). Not used in this integration's v1
— Stratxcel always initiates missions via `POST /v1/runs`, so there is a single, auditable
mission-creation path. Documented here so it isn't rediscovered/re-decided later; revisit if a
future use case needs Hermes to react to an external event Stratxcel doesn't already see.
