# Intelligence Department

**Status:** Workstream 2 — business audit and growth strategy intelligence layer in `@stratxcel/workforce-core`.
**Branch:** `feat/workforce-intelligence-department`

## Purpose

Stratxcel must first understand the business before prescribing work:

**Research before claims → Diagnosis before tactics → Bottlenecks before execution → Customer need before upsell → Evidence before confidence.**

The Intelligence Department turns tenant/mission-scoped evidence into customer-ready audit and strategy artifacts without inventing performance facts or mutating billing. Social is one downstream execution channel, not the center of diagnosis.

## Pipeline (`runIntelligencePipeline`)

```
BUSINESS CONTEXT
→ RESEARCH PLAN
→ EVIDENCE REVIEW
→ DIAGNOSIS
→ BOTTLENECKS (+ causal graph)
→ OPPORTUNITIES / PRIORITY
→ STRATEGY
→ DEPARTMENT RECOMMENDATION
→ ENTITLEMENT / COMMERCIAL FIT
→ BUSINESS GROWTH AUDIT ARTIFACT
→ HANDOFFS TO EXECUTION DEPARTMENTS
```

1. **Tenant checks** — `assertBrandBrainTenant`, `assertTenantScopedEvidence`
2. **Research plan** — parallel research roles via canonical WorkforceCore registry; `research.web` / `research.serp` remain PLANNED (no live provider bypass)
3. **Evidence quality & contradictions** — freshness windows by source type, first-party precedence, external claims cannot become KNOWN; CONFLICTING_EVIDENCE surfaced
4. **Brand assessment** — READY | PARTIAL | MISSING_REQUIRED_CONTEXT; prohibited claims blocked; Brand Brain remains canonical
5. **Diagnosis** — wraps `diagnoseBusinessGrowth` / `resolveEntryMode`; NO DATA ≠ bad performance (`INSUFFICIENT_EVIDENCE` / `RESEARCH_REQUIRED`); `MISSING_FOUNDATION` for new businesses
6. **Bottlenecks** — causal edges (`LIKELY_CONTRIBUTOR` | `CORRELATED_SIGNAL` | `CONFIRMED_CAUSE`), root vs symptom, customer-need priority scoring
7. **Recommendations** — problem → evidence → action → capability/service → commercial fit
8. **Commercial fit** — live catalogue snapshot (`PLAN_DEFINITIONS`); smallest covering / ALREADY_ENTITLED / PARTIAL / CUSTOM; billing mutation blocked
9. **Strategy** — `GrowthStrategyArtifact`; objective ≠ tactic; CRM/WhatsApp for response bottlenecks (not Social); PURCHASED_EXECUTION vs RECOMMENDED_FUTURE_WORK
10. **Audit artifact** — customer-ready sections; creator/reviewer separation; generic-output penalty
11. **Hermes specialist plan & handoffs** — CEO delegation guidance
12. **Events** — `intelligence.*` on WorkforceEventEmitter

## Entry modes

| Mode | Intelligence posture |
|------|----------------------|
| `AUDIT_ONLY` | Diagnose + recommend only; never execute unpurchased work; never auto-purchase |
| `NEW_BUSINESS` | Foundation-first; no fabricated performance problems |
| `EXISTING_BUSINESS` | Preserve strengths; bottleneck-first (e.g. response/CRM over more social) |
| `ACTIVE_PACKAGE_CUSTOMER` | Allocate purchased entitlements; package is commercial envelope, not strategy |
| `EXISTING_CUSTOMER_RENEWAL` | Use prior strategy/receipts/analytics; do not blindly repeat last plan |

Business maturity (`PRE_LAUNCH` … `MATURE`) is classified separately from customer relationship state.

## Recommendation safeguards

- AUDIT DOES NOT ALWAYS UPSELL — healthy businesses may get `NO_CHANGE_NEEDED`
- Prefer smallest covering catalogue option (never highest-revenue ranking)
- Existing entitlements → `USE_CURRENT_ENTITLEMENT` / `ALREADY_ENTITLED`
- Partial coverage returns explicit gaps
- No automatic subscription purchase, trial, upgrade, charge, or entitlement grant
- No guaranteed revenue / ROAS / ranking claims

## Hermes CEO

CEO requests intelligence services; specialists execute. See `HERMES_INTELLIGENCE_DELEGATION_GUIDANCE` in `hermes/delegation.ts`.

Parallel research → evidence_reviewer → growth_strategist → brand_strategist → final_reviewer. Same agent must not be sole author and approver.

## Capability gaps (Workstream 1)

Live execution of `research.web` and `research.serp` remains PLANNED. Intelligence builds workflow/evidence contracts; does not bypass the capability registry with ad-hoc provider calls.

## Tests

`packages/workforce-core/src/__tests__/intelligence.test.ts` — audit-only, slow-response CRM routing, foundation-first new business, healthy NO_CHANGE, commercial fit, evidence governance, brand safety, tenant isolation, billing mutation blocked.
