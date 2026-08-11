# Performance Intelligence

**Status:** Foundation (measurement → analysis → learning → plan revision)  
**Workstream:** 8/10 — Analytics + Reporting + Optimization  
**Production mutations:** NONE

## Purpose

Tell Hermes:

1. **What actually happened?** (measured signals only)
2. **What should change next?** (evidence-backed recommendations; no automatic external mutation)

Closes the operating loop:

```
PLAN → EXECUTION → RECEIPT → MEASUREMENT → ANALYSIS → LEARNING → PLAN REVISION
```

## Module

Canonical implementation: `@stratxcel/workforce-core` → `src/performance/`

| Area | Entry |
|------|--------|
| Metrics | `MetricObservation`, `createMetricObservation`, `recordMissingMetric` |
| KPIs | `selectKpisForContext` (context-specific; no universal dashboard) |
| Attribution | `DIRECT` / `LIKELY` / `ASSISTED` / `UNKNOWN` |
| Receipts | `ExecutionReceipt` → `linkReceiptToMetric` |
| Baselines | `createBaselineReference`, `compareToBaseline` (missing stays missing) |
| Anomalies | `detectAnomalies` (sample-size aware) |
| Optimization | `proposeOptimization` (`CONTINUE`…`CHANGE_SEQUENCE`, `mutatesExternalSystems: false`) |
| Reviews | `WeeklyPerformanceReview`, `MonthlyGrowthReview` |
| Reports | Customer vs Admin (no secrets) |
| Usage | `toUsageAccounting` from billing truth only |
| Cost | `createCostObservation` — unknown remains unknown |
| Learning | `applyLearningRevision` → `reviseThirtyDayPlan` |

## Non-negotiables

- **No fabricated metrics.** Missing source → `MissingMetric` / omit observation — never invent zeros as “facts.”
- **No fake learning.** Model opinions are not performance evidence (`rejectOpinionAsEvidence`).
- **No automatic spend/publish mutation.** Recommendations propose; humans/capability gates execute.
- **Attribution honesty.** Do not claim “this Instagram post generated the sale” without `DIRECT` evidence.
- **Plan history preserved.** Revision increments version, sets `previousPlanId`, retains commercial/planning context; prior plan object remains immutable for the caller.
- **Tenant isolation.** Cross-tenant receipts/observations/recommendations are rejected.

## Departments

| Department | Role in loop |
|------------|--------------|
| **analytics** | Observations, attribution, anomalies → `analytics_evidence` |
| **reporting** | Weekly/monthly + customer/admin reports from verified evidence |
| **optimization** | Recommendations → optional Business Growth Plan revision |

All three remain `externalMutationEverPermitted: false` at the department default.

## KPI contexts

Contexts (`seo_focused`, `crm_conversion`, `social_focused`, `paid_acquisition`, …) select different primary KPIs. There is no single universal KPI dashboard.

## Learning contracts

Existing contracts in `learning/types.ts`:

- `MeasuredPerformanceSignal`
- `AnalyticsEvidenceSignal`
- `OptimizationRecommendationEvent`

Performance module bridges `MetricObservation` → measured signal → recommendation → `applyLearningRevision`.

## Events (additive names)

- `workforce.metric.observed`
- `workforce.anomaly.detected`
- `workforce.optimization.recommended`
- `workforce.weekly_review.created`
- `workforce.monthly_review.created`
- `workforce.learning.applied`

## Capability requirements

Uses existing capability classes:

- `analytics.read`
- `analytics.attribution` (may remain PLANNED until provider work)
- `report.generate`

This workstream does **not** apply production DB migrations or enable live GA4/GSC pulls by itself. Providers remain upstream (`search-discovery`, social analytics, billing entitlements).

## Tests

```bash
npm run test:performance-intelligence
npm run test:workforce-core
```

Coverage includes receipt→metric linking, missing-data honesty, attribution uncertainty, plan revision evidence gate, historical immutability, weekly/monthly reviews, optimization without mutation, tenant isolation, context KPIs, healthy CONTINUE, anomaly surfacing, and usage accounting.
