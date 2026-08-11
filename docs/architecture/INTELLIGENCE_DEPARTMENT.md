# Intelligence Department

**Status:** Workstream 2 — business audit and growth strategy intelligence layer in `@stratxcel/workforce-core`.

## Purpose

The Intelligence Department turns tenant/mission-scoped evidence into customer-ready audit and strategy artifacts without inventing performance facts or mutating billing.

## Pipeline (`runIntelligencePipeline`)

1. **Tenant checks** — `assertBrandBrainTenant`, `assertTenantScopedEvidence`
2. **Research plan** — parallel research roles via canonical registry; `research.web`/`research.serp` remain PLANNED (no live calls in planner)
3. **Evidence quality & contradictions** — freshness windows, first-party precedence, external claims cannot become KNOWN
4. **Brand assessment** — READY | PARTIAL | MISSING_REQUIRED_CONTEXT; prohibited claims blocked
5. **Diagnosis** — wraps `diagnoseBusinessGrowth` / `resolveEntryMode`; NO DATA ≠ bad performance
6. **Bottlenecks** — causal edges, root vs symptom, customer-need priority scoring
7. **Recommendations** — `buildGrowthRecommendations`
8. **Commercial fit** — smallest covering / ALREADY_ENTITLED / PARTIAL / CUSTOM; billing mutation blocked
9. **Strategy** — objective ≠ tactic; CRM/WhatsApp for response bottlenecks (not Social)
10. **Audit artifact** — customer sections, creator/reviewer separation
11. **Hermes specialist plan & handoffs** — delegation guidance for CEO
12. **Events** — `intelligence.*` names on WorkforceEventEmitter

## Key modules

| Module | Responsibility |
|--------|----------------|
| `evidence/model.ts` | Scoped records, claim status, freshness |
| `research/planner.ts` | Research task plan + budget |
| `diagnosis/engine.ts` | Maturity vs entry mode, MISSING_FOUNDATION |
| `bottlenecks/engine.ts` | Causal graph + priority |
| `strategy/builder.ts` | GrowthStrategyArtifact |
| `recommendations/commercial-fit.ts` | Catalogue fit, billing guards |
| `hermes/delegation.ts` | Specialist run plan + handoffs |
| `pipeline.ts` | End-to-end orchestration |

## Hermes CEO

See `HERMES_INTELLIGENCE_DELEGATION_GUIDANCE` in `hermes/delegation.ts` for stage ordering and reviewer separation rules.

## Tests

`packages/workforce-core/src/__tests__/intelligence.test.ts` — audit-only, slow-response CRM routing, foundation-first new business, healthy NO_CHANGE, commercial fit, evidence governance, brand safety, tenant isolation.
