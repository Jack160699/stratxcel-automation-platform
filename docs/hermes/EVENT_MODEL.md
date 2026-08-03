# Event Model

Two independent channels carry events out of Hermes. They are complementary, not
alternatives — see "Why two channels" below.

## Channel 1: Runs API SSE (primary)

`GET /v1/runs/{run_id}/events`. Confirmed event types (from
`user-guide/features/api-server.md`, reviewed 2026-08-04):

| Event | Meaning | Maps to |
|---|---|---|
| `assistant.delta` | Incremental assistant text | `HermesExecutionEvent` (`type: "assistant.delta"`) |
| `tool.started` | A tool call began | `HermesExecutionEvent` + embeds `ToolRequest` |
| `tool.completed` | A tool call finished | `HermesExecutionEvent` + embeds `ToolResult` |
| `subagent.start` | Delegated subagent work began | `HermesExecutionEvent` (`type: "subagent.start"`) |
| `subagent.complete` | Delegated subagent work finished | `HermesExecutionEvent` (`type: "subagent.complete"`) |
| `run.completed` | Terminal event for the run | `HermesExecutionEvent` (`type: "run.completed"`) |

Buffer lifetime: 5 minutes unconsumed. Stratxcel's integration layer must persist every event
it receives to Stratxcel's own audit log immediately (see [OBSERVABILITY.md](OBSERVABILITY.md))
— the SSE stream itself is not a durable record.

**Not confirmed from the pages reviewed**: the exact event name for "run paused, awaiting
approval." Treated as an open item — see [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md).
Until confirmed, Stratxcel's integration layer should treat *any* unrecognized event type on
this stream as informational-only and never assume a run is safely resumable without an
explicit `run.completed` or a confirmed approval-pause event.

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
loses the connection for more than 5 minutes, in-flight events are gone. Outbound webhooks are
Hermes's own best-effort push, decoupled from any open connection, so they serve as a
**dead-letter-adjacent backstop** for `run.completed` / final states — not for high-frequency
`assistant.delta` noise. Recommended v1 policy: subscribe SSE for live progress UI, subscribe
outbound webhook only to terminal/coarse events, and always reconcile via `GET
/v1/runs/{run_id}` on service restart for any run Stratxcel's DB still marks as non-terminal.

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
