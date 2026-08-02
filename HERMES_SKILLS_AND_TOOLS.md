# Hermes Skills and Tools

## Runtime adapters (`packages/hermes`)

| Adapter | Mode | Behavior |
|---|---|---|
| `DisabledHermesAdapter` | `disabled` (default) | Every mission it "executes" moves to `BLOCKED` with a clear reason. Never hangs, never silently completes. |
| `MockHermesAdapter` | `mock` | Deterministic, no network: `COMPLETED` for a recognized service, `PARTIALLY_COMPLETED` otherwise, with a believable progress-event sequence. For automated preview demos and local dev only. |
| `HermesHttpAdapter` | `http` | Real signed HTTP client. Timeout via `AbortController`; `HermesTimeoutError`/`HermesUnavailableError` classify what mission-worker should retry vs. not. Inert — no Hermes instance is reachable from this session (Docker unavailable). |

`selectHermesAdapter()` reads `HERMES_MODE`, defaulting to `disabled` for anything unset or unrecognized — the same fail-safe pattern used for the WhatsApp/Razorpay integration-mode flags.

## Mission-scoped authorization

`issueMissionToken({ missionId, tenantId, allowedTools, ttlMs })` produces a compact, HMAC-signed, 15-minute-default token — this is what stands in for raw credentials in Hermes's hands. `apps/hermes-gateway` verifies it on every tool call and rejects anything not in the token's `allowedTools`.

## Profiles

The six profile names from the master brief (`stratxcel-orchestrator`, `stratxcel-research`, `stratxcel-content`, `stratxcel-developer`, `stratxcel-seo`, `stratxcel-admin-growth`) exist as string values the mission compiler assigns per service (`packages/missions/src/service-catalogue/catalogue.ts`'s `hermesProfile` field) and get stored on `missions.hermes_profile`. **No adapter currently branches on this value** — there is no real Hermes instance to interpret a profile differently, so today every profile gets identical treatment from `MockHermesAdapter`/`DisabledHermesAdapter`. This is a named gap, not a hidden one: profile-specific behavior is meaningful only once a real Hermes engine exists to receive and act on it.

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

## Local Hermes

`infrastructure/hermes/` (docker-compose, `.env.example`, README) and `scripts/hermes-{start,stop,health,smoke-test}` are written and statically reviewed — Docker was unavailable this session, so only `scripts/hermes-smoke-test` (which exercises `MockHermesAdapter` directly, no Docker needed) has actually run. See `MANUAL_SETUP_REQUIRED.md` M8.
