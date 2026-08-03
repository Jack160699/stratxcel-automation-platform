# Observability

## Audit log: the non-negotiable

Every `HermesExecutionEvent` (from either SSE or webhook channel — see
[EVENT_MODEL.md](EVENT_MODEL.md)), every `ApprovalRequest`/`ApprovalDecision`, and every
`ArtifactManifest` is written to Stratxcel's own append-only audit table, keyed by
`tenantId`/`missionId`/`runId`, **before** being surfaced anywhere else. This is the
authoritative "what happened" record — the Hermes-side SSE buffer (5-minute unconsumed
lifetime, per the docs) and Hermes' own `state.db` are not treated as durable audit sources of
record.

## What gets logged, minimum fields

- `missionId`, `tenantId`, `profile`, `runId`
- Every tool call: name, arguments (redacted per [SECRETS_AND_SECURITY.md](SECRETS_AND_SECURITY.md)
  — no credential values ever land in a log line even though none should be present in
  arguments at all), result summary, timestamp, latency
- Every approval request/decision with decider identity
- Mission terminal state (`completed`/`failed`/`cancelled`/`needs_clarification`) and reason
- `UsageAndCost` per mission (tokens in/out, and cost once a provider's pricing is wired up —
  see [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md) for provider selection)

## Hermes-side logs (secondary, operational)

Hermes writes its own logs to `~/.hermes/<profile>/logs/` per the documented layout. These are
useful for debugging the Hermes deployment itself (crashes, tool registration errors, MCP
connection issues) but are **not** a substitute for Stratxcel's tenant-facing audit log — they
are host-local, not tenant-partitioned, and not exposed to any client.

## Health monitoring

`GET /health` / `GET /health/detailed` (documented endpoints) polled by
`infra/hermes/healthcheck.sh` — see [DEPLOYMENT.md](DEPLOYMENT.md) and
[FAILURE_RETRY_IDEMPOTENCY.md](FAILURE_RETRY_IDEMPOTENCY.md) for how a failed health check
feeds into retry/dead-letter behavior.

## Alerting (design, not implemented here)

Candidate triggers for a future alert integration: `run.completed` with a failure status,
`ApprovalRequest` older than N minutes unresolved, health check failure, and any
`session_stall_timeout` event (Hermes' own configurable stall notification, default 300s
inactivity) firing on a mission Stratxcel still considers active. No alerting channel
(Slack/email/PagerDuty) is wired up in this branch.

## What this branch does NOT build

No dashboard, no log shipping pipeline, no metrics exporter. This document specifies what must
be true of the audit trail once the integration layer exists; it does not implement it.
