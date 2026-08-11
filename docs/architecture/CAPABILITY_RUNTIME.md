# Capability Runtime

**Status:** Workstream 1 — platform capability reality + provider boundaries  
**Package:** `@stratxcel/workforce-core`

## Invariant

**Department ≠ Capability ≠ Provider ≠ Integration ≠ Entitlement ≠ Authorization.**

A department may *request* a capability. This layer alone decides whether that capability:

- exists in the catalogue
- has a real implementation (`AVAILABLE` / `NOT_CONFIGURED` / `PLANNED` / `UNAVAILABLE`)
- is configured for the platform
- is available for *this* tenant
- is allowed by entitlement
- has required integrations
- requires approval
- is externally mutating
- is blocked by Shadow / kill switch
- may safely execute **now**

No AI/model output may override this decision. Hermes CEO plans and planner snapshots **never** authorize execution.

## Status semantics (static catalogue)

| Status | Meaning |
|--------|---------|
| `AVAILABLE` | Real end-to-end implementation path exists (runtime may still block) |
| `NOT_CONFIGURED` | Implementation/provider slot exists; platform wiring incomplete |
| `PLANNED` | Product contract only — no end-to-end execution path |
| `UNAVAILABLE` | Intentionally disabled/unsupported |

`status` is **required** on every definition. There is **no** default to `AVAILABLE`.

Static catalogue state and runtime readiness are different concepts. Example: `social.publish` may be statically `AVAILABLE` while a given tenant lacks account binding, approval, entitlement, or is in Shadow.

## Public API

Departments and other workstreams should consume:

```ts
import {
  getCapability,
  resolveCapabilityReadiness,
  revalidateCapabilityForExecution,
  requestCapability,
  buildStaticCapabilityPlannerSnapshot,
  buildCapabilityPlannerSnapshot,
} from "@stratxcel/workforce-core";
```

| API | Role |
|-----|------|
| `resolveCapabilityReadiness` | Fail-closed readiness (tenant / entitlement / integration / approval / Shadow / kill switch) |
| `revalidateCapabilityForExecution` | Execution-time revalidation (never from planner snapshot) |
| `requestCapability` | Provider-neutral execution entrypoint |
| `build*CapabilityPlannerSnapshot` | Safe CEO/planner summary — **not** authorization |

## External mutation boundary

Marked `externalMutation: true` with `approvalRequired: true`:

- `social.publish`
- `website.deploy`
- `ads.publish`
- `crm.write`
- `whatsapp.send`
- `seo.publish`
- `content.publish`

Planning, Hermes saying “publish”, or a specialist artifact labeled “approved” is **not** authorization.

## Provider boundary

Providers live under `packages/workforce-core/src/providers/`:

- typed `CapabilityProvider` contract
- registry + eager `bootstrap.ts`
- bounded failover that **does not** hop on `POLICY_BLOCK` / `AUTH_CONFIGURATION` / `INVALID_INPUT`
- usage/cost metadata with `costKnown: false` when unknown (never invent cost)

Hermes native host toolsets (terminal, browser, native image_gen, etc.) remain disabled. Specialists receive only Stratxcel-controlled capability/tool bridges (`capabilities/tool-mapping.ts`).

## How other workstreams consume this

1. Look up capability truth with `getCapability` / readiness APIs.
2. Call `requestCapability(...)` — do not import provider SDKs from department code.
3. Treat planner snapshots as advisory only; always revalidate before mutation.
4. Do not grow the catalogue ad hoc; propose capability keys through this workstream’s contract.

See also: [AI_WORKFORCE_ARCHITECTURE.md](./AI_WORKFORCE_ARCHITECTURE.md).
