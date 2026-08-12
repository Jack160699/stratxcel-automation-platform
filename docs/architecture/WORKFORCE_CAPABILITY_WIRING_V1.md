# Workforce Capability Wiring V1

**Branch:** `feat/v1-workforce-capability-wiring`
**Status:** Wiring existing real implementations into Workforce capability contracts — no fake success.

## Preserved architecture and excluded workstreams

| Workstream | Relationship |
|------------|--------------|
| **AI runtime / image generation (PRs #45 and #49)** | Already merged on `main` and preserved. `media.image_generation` remains backed by the real AI runtime and canonical generation records. The separate Workforce `content.shortform` adapter is still not wired and therefore remains `NOT_CONFIGURED`. |
| **Creative Studio / Brand Brain / Social asset accounting** | Already merged on `main` and preserved without replacement or downgrade. |
| **PR #48 research** | Explicitly excluded from this PR. Research capabilities retain the truthful state inherited from `main`. |
| **PR #46 transactional email** | Explicitly excluded from this PR; the email subsystem is not modified. |

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
| analytics.read | analytics-read-reporting | host → canonical tenant-scoped Search/Google GA4 reader |
| media.image_generation | media-image-ai-runtime | real AI runtime + canonical image generation records |
| content.shortform | placeholder | AI runtime exists, but no canonical Workforce short-form provider is wired |

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

After this PR (real GA4 reads and real image generation preserved):

- static AVAILABLE = 10
- NOT_CONFIGURED = 3 (`content.shortform`, `seo.publish`, `content.publish`)
- Runtime operational ≤ static AVAILABLE and depends on host binding + integrations.

## Final V1 capability matrix

| Capability | State | Real executor | Gates | Receipt / evidence |
|------------|-------|---------------|-------|--------------------|
| `social.schedule` | AVAILABLE | Canonical Social package queue | tenant, entitlement, integration, exact approval/standing authorization, Shadow/kill switch, idempotency | queue job receipt |
| `social.publish` | AVAILABLE | Canonical Social publish/worker path | tenant/account ownership, entitlement, integration, exact approval/standing authorization, Shadow/kill switch, artifact version/fingerprint, idempotency | authoritative publish/queue receipt |
| `crm.read` | AVAILABLE | `@stratxcel/leads-and-crm` repository | mission tenant, closed operation allowlist | tenant-scoped CRM snapshot |
| `crm.write` | AVAILABLE | `@stratxcel/leads-and-crm` repository | mission tenant, closed operation allowlist, exact approval or verified Hermes mission-tool grant, idempotency | CRM mutation receipt + lead reference |
| `whatsapp.send` | AVAILABLE | Canonical WhatsApp outbound choke point | tenant, plan entitlement, active outbound binding, consent/session rules, approval, Shadow/kill switch, idempotency | message/provider receipt |
| `seo.audit` | AVAILABLE | Search/SEO audit builder | tenant, safe public URL, feature flag | `seo_audit_report` artifact + receipt |
| `website.audit` | AVAILABLE | Internal search-web audit | tenant, safe public URL, feature flag | website audit receipt |
| `website.generate` | AVAILABLE | Websites-and-domains draft generator | tenant, website entitlement, feature flag | `website_draft` artifact; never a deploy claim |
| `analytics.read` | AVAILABLE | Canonical Search/Google GA4 reader | tenant, connected Google integration, selected GA4 property | `analytics_evidence` artifact + truthful read receipt; empty GA4 rows are valid |
| `media.image_generation` | AVAILABLE | Canonical AI Runtime image provider | tenant, mission, provider/storage configuration, plan budget, idempotency | canonical image-generation record, assets, usage/cost receipt |
| `content.shortform` | NOT_CONFIGURED | No canonical Workforce content executor yet | provider wiring absent | no success artifact |
| `research.web` / `research.serp` | PLANNED | PR #48 intentionally not imported | implementation absent | no success artifact |

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
