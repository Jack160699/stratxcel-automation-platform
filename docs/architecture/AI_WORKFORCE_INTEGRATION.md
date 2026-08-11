# AI Workforce Integration

Final integrated architecture after combining the ten Workforce department workstreams.

## End-to-end flow

```
BUSINESS
  → HERMES CEO (controlled capability / MCP boundaries only — no native toolsets)
  → DIAGNOSIS (Intelligence)
  → DYNAMIC DEPARTMENT DAG
  → SPECIALIST RUNS
  → ARTIFACTS / HANDOFFS
  → TRUST (quality + compliance + ReleaseReadiness)
  → AUTHORIZATION (explicit approval or scoped standing auth)
  → CAPABILITY RUNTIME (revalidation)
  → REAL EXECUTION (existing product paths only)
  → RECEIPT
  → ANALYTICS / Performance Intelligence
  → OPTIMIZATION
  → REPLAN (immutable prior plan; new version)
```

## Truth vocabulary

| Term | Meaning |
|------|---------|
| **IMPLEMENTED** | Real code path exists in the monorepo for this capability class |
| **CONFIGURED** | Provider credentials / bindings / feature flags required for runtime are present |
| **ENTITLED** | Tenant commercial entitlement permits the capability class |
| **AUTHORIZED** | Deterministic approval or scoped standing authorization for this mutation |
| **EXECUTABLE** | All of the above plus tenant binding, integration, Trust (when mutating), Shadow clear, kill switch clear, budget, artifact security |

Static catalogue `AVAILABLE` is **not** the same as executable.

## Capability runtime invariants

1. `requestCapability(...)` must never return `SUCCEEDED` because of a simulated stub.
2. Production bootstrap registers only truthful placeholders or real adapters.
3. Mocks (`MockImageProvider`, `createSimulatedSuccessProvider`, `simulated: true`) are test-only.
4. Feature flags gate only `requiredFeatureFlags` on the capability definition.
5. Input artifacts are resolved authoritatively (tenant, kind, existence) before provider invoke.
6. Budget `remaining <= 0` blocks provider execution.
7. Planner snapshots never authorize execution.

## Trust ↔ Social release

Canonical publish eligibility:

- `qualityStatus === "PASS"`
- `complianceStatus === "PASS"`
- `ReleaseReadiness.readyToRelease === true`
- reviewed artifact version === publish artifact version

Then — and only then — Social authorization (manual explicit approval or package `AUTO_PUBLISH` standing auth) and Shadow / kill-switch / capability gates may proceed.

Explicit approval and package standing authorization **cannot** override Trust, Shadow, tenant binding, entitlement, or capability readiness.

Natural language (`yes`, `haan`, `kar do`, …) never authorizes manual publish.

## Revenue

`authorizeRevenueMutation` is a **domain gate** only. Final CRM / WhatsApp mutation also requires Capability Runtime readiness. WhatsApp Workforce send remains `NOT_CONFIGURED` until a real controlled adapter is wired. Standing authorization must be kind-scoped (`standingAuthorizationKind`).

## Search / Web

- `website.audit` — internal deterministic engine over a provided page inventory; **no** `website_maintenance` entitlement.
- `website.generate` — separate generate path; requires `website_maintenance` when configured.
- SEO / website publish and production deploy remain blocked / not configured.
- No fabricated SERP rankings or invented URLs.

## Creative Studio

Provider boundaries, briefs, art direction, candidate/revision model, and provenance are integrated. Real image/video generation remains `NOT_CONFIGURED` / `UNAVAILABLE`. `MockImageProvider` is never selected in production bootstrap.

## Acquisition

Campaign plans set `authorizesSpend: false`. No `ads.publish` execution until capability and policy allow. No invented CPC/CPA/ROAS.

## Performance

Consumes real execution receipts / metric observations. Unknown attribution, unknown cost, and missing baselines remain honest unknowns.

## Company operations / E2E

Contract harnesses remain. Master integration E2E exercises real combined modules across Audit, Lead bottleneck, Social/Trust, cross-tenant, feature flags, new business, performance loop, fake-success prevention, and tenant concurrency.

## Hermes

Host/native tools remain disabled (terminal, browser, file, code execution, native web, native image). Production `HERMES_MODE` is unchanged.

## Production safety

No Social publish, WhatsApp send, ads spend, website deploy, SEO publish, CRM destructive mutation, subscription upgrade, payment charge, production DB migration, Shadow disable, or Hermes enablement is performed by this integration branch.
