# Workforce Capability Wiring V1

**Branch:** `feat/v1-workforce-capability-wiring`  
**Status:** Wiring existing real implementations into Workforce capability contracts — no fake success.

## Parallel workstreams

| Workstream | Relationship |
|------------|--------------|
| **PR #45 / `feat/v1-ai-provider-router`** | Separate unmerged dependency for production LLM / AI runtime. Content shortform marked `PENDING_AI_RUNTIME_PR_45`. |
| **`feat/v1-transactional-email-system`** | Parallel independent workstream — do not modify email subsystem here. |

## Contract

Entrypoint: `requestCapability` (`packages/workforce-core/src/capabilities/execution.ts`).

Adapters implement `CapabilityProvider`, registered in `providers/bootstrap.ts`.

App host binding (Social schedule/publish, analytics read, CRM/WhatsApp service client):

```ts
import { ensureWorkforceCapabilityHostsBound } from "@/lib/workforce/bind-capability-hosts";
ensureWorkforceCapabilityHostsBound();
```

Do not re-export Social `capability-host` from the Social workforce barrel — that pulls Supabase into pure Node ESM tests.

## Adapter registry

| Capability | Provider | Backend |
|------------|----------|---------|
| website.audit | website-audit-internal | search-web + URL safety |
| seo.audit | seo-audit-search-discovery | search-web/seo-audit |
| website.generate | website-generate-domains | generate5PageSite (draft only) |
| crm.read / crm.write | crm-supabase | @stratxcel/leads-and-crm |
| whatsapp.send | whatsapp-meta | sendOutboundWhatsAppMessage |
| social.schedule | social-schedule-queue | host → scheduleJob |
| social.publish | social-publish-meta | host → publish/worker |
| analytics.read | analytics-read-reporting | host → reporting status |
| content.shortform | placeholder | PENDING_AI_RUNTIME_PR_45 |

## Status semantics

`AVAILABLE` | `NOT_CONFIGURED` | `PLANNED` | `UNAVAILABLE` — static catalogue. Runtime still gates on tenant, entitlement, integration, approval, Shadow, kill switch, provider probe.

## Tenant / entitlement / approval / Shadow

Trusted tenant only from `authorizationContext.trustedTenantId`. Entitlements fail closed. External mutations need approval or capability-scoped standing auth. Shadow blocks external mutation (`SHADOW_COMPLETED`). Never claim PUBLISHED/SENT/DEPLOYED/LIVE without real external receipt.

## Receipts & idempotency

`buildCapabilityExecutionReceipt` — no tokens/secrets. Mutation adapters require stable idempotency keys (Social job key, CRM metadata key, WhatsApp outbound key).

## Matrix (static vs runtime)

Use `countCapabilitiesByStatus()` for static catalogue counts.
Use `countCapabilityOperationalMatrix({ tenantId })` for **providerOperational** (IMPLEMENTED provider probe ready — not full tenant runtime).

Use `buildTenantCapabilityRuntimeMatrix({ tenantId })` for:
STATIC_AVAILABLE / PROVIDER_READY / TENANT_TECHNICALLY_READY / EXECUTION_REQUIRES_APPROVAL / RUNTIME_EXECUTABLE_NOW.

After this PR (analytics.read truthfully downgraded):

- static AVAILABLE ≈ 8
- NOT_CONFIGURED includes analytics.read + content.shortform (+ media/seo.publish/content.publish)
- Runtime operational ≤ static AVAILABLE and depends on host binding + integrations.

## Canonical server executor

`lib/workforce/execute-capability.ts` → `executeWorkforceCapabilityServer(...)`

Auto-binds hosts, loads mission tenant, entitlements, integrations, artifacts, shadow/kill, then `requestCapability`.

Callers must not manufacture security snapshots.

## Hermes call graph (truthful)

Native Hermes toolsets remain **disabled**.

Actual path for CRM lead creation (after this PR):

`Hermes tool create_crm_lead` → `apps/hermes-gateway` handler → `executeWorkforceCapabilityServer` → host bind → entitlement/integration/artifact snapshots → `requestCapability` → CRM adapter → receipt.

Still **not** routed through Workforce (by design / not yet):

- `query_publication_status` — Social status lookup only
- `create_draft_artifact` — direct `mission_artifacts` insert
- Controlled tools `submit_publish_request` / `create_website_change_request` — **not registered**, throw `ToolNotAvailableError`

Docs must not claim a universal Hermes → capability path for every tool.

## Migrations

None.
