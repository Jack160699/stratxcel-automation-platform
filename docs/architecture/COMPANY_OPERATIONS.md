# Company Operations

**Status:** Supporting internal departments for AI workforce reliability and customer accountability
**Package:** `@stratxcel/workforce-core` → `src/company-ops/`
**Scope:** customer_success · operations · engineering · finance

## Principles

- Purchased-service gated readiness (never force irrelevant integrations)
- Finance `chargingAuthority: NONE` — never autonomous charges
- Engineering: Hermes tools only (`ALL_TOOL_NAMES`); **no** host terminal/shell/code_execution
- Operations oversight scope is **`mission_execution`**, not System Health
- Offboarding never auto-executes destructive deletion
- Unknown costs stay unknown

## Customer Success

Modules:

- `customer-success/readiness.ts` — onboarding readiness by purchased services
- `customer-success/lifecycle.ts` — next action, alerts, renewal, offboarding handoff
- `offboarding/workflow.ts` — pause automation, stop scheduled external actions, human-only deletion

Readiness dimensions: business context, Brand Brain, website, social, analytics, CRM, WhatsApp, ads, billing, permissions.

Alerts are specific (Brand Brain incomplete, approval waiting, package nearly exhausted, payment recovery, blocked capability, human handoff) — not spammy generics.

## Operations

`operations/oversight.ts` provides:

- mission queue
- blocked stages / missions
- retries
- provider & integration failures
- human handoffs
- SLA/age signals
- worker health (mission-scoped)
- dead-letter / recovery flags
- approvals backlog

## Engineering

`engineering/diagnosis.ts`:

- technical diagnosis & classification (integration / platform / website / infrastructure)
- repair proposals routed through Stratxcel services
- infrastructure incident handoff
- `assertEngineeringNoHostTools` enforced against Hermes `ALL_TOOL_NAMES`

## Finance

- `finance/entitlement-health.ts` — `ACTIVE | LOW_REMAINING | EXHAUSTED | PAUSED | EXPIRED | CONFIGURATION_REQUIRED`
- `finance/cost-visibility.ts` — estimated / reserved / actual / provider-reported (unknown stays unknown)
- `finance/finance-view.ts` — snapshot + `attemptFinanceCharge` (never mutates) + payment failure surface

## Views & observability

- Customer view contract — YOUR BUSINESS, CURRENT POSITION, 30-DAY PLAN, THIS WEEK, WIP, NEEDS YOU, RESULTS, NEXT RECOMMENDATION
- Admin view contract — departments, stages, latency, cost, retries, providers, handoffs, quality failures, capability blockers (no credentials)
- Mission reconstruction from events — no secrets

## Production mutations

**NONE** from this package path: no DB migration application, payment charge, social publish, WhatsApp send, ads, customer site deploy, Shadow change, or Hermes enablement.
