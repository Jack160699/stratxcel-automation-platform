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

Adapters implement `CapabilityProvider`, registered in `providers/bootstrap.ts`. Host bindings via `bindCapabilityHost` for Social + analytics paths that live under `lib/`.

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

## Matrix (static)

Use `countCapabilitiesByStatus()` — expected AVAILABLE=9, UNAVAILABLE=2 after this wiring.

## Hermes

Native toolsets remain disabled. Path: Hermes → Stratxcel dispatcher → mission token → `requestCapability` → adapter → receipt.

## Migrations

None.
