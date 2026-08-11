# Acquisition Department (Advertising + Growth)

**Status:** Planning contracts (no production spend)  
**Branch:** `feat/workforce-acquisition-department`  
**Baseline:** `736b170`

## Goal

Implement **Advertising** and **Growth** as evidence-driven departments:

determine whether paid acquisition is appropriate → plan intelligently → create executable campaign artifacts → request creatives → define budget/risk → require approval → measure → optimize.

**Not:** “make ads” or uncontrolled spend.

## Ownership boundaries

| Area | Owner |
|------|--------|
| Canonical capability registry | Do not edit in this workstream |
| Creative asset production | Creative Studio (consumes `AdCreativeBrief`) |
| Global analytics interpretation | Workstream 8 measurement engine |
| Website generation/deploy | Website Department (landing handoff only) |

## PaidAcquisitionReadiness

`evaluatePaidAcquisitionReadiness` scores:

- offer clarity, landing page, tracking, conversion path, audience
- creative availability, account connection, payment/spend authority
- historical data, entitlement (`meta_ad_campaigns`)

Returns: `READY` | `PARTIAL` | `NOT_READY` | `SETUP_REQUIRED`

Rules:

- Do **not** recommend spending when the funnel cannot convert (`NOT_READY`).
- `authorizesSpend` is always `false`.
- Missing ad account / spend authority → `SETUP_REQUIRED` when funnel is otherwise OK.

## Growth strategy

`selectGrowthLevers` chooses among:

`organic` | `search` | `social` | `paid` | `conversion` | `crm_followup` | `retention`

- Growth ≠ ads. Paid is one optional lever (`paidMandatory: false`).
- Strong organic inquiry volume does not mandate paid ads.
- Response/follow-up and conversion leaks defer paid.

## CampaignPlan

Structured planning artifact including objective, outcome, platform, funnel stage, audience hypotheses, offer, landing, creative requirements, placements, budget proposal, duration, KPI, measurement contract, stop conditions, experiment link, approvals, evidence.

Always:

- `authorizesSpend: false`
- `authorizesPublish: false`
- `approvals.approvedForSpend: false`

## Budget

`proposeCampaignBudget`:

- Suggests ranges only from mission/policy envelope inputs
- Never fabricates CPC/CPA (`predictedCpcCents` / `predictedCpaCents` are always `null`)
- Caps to commercial/policy envelope
- States assumptions when evidence is insufficient
- Does not authorize spend

## Audiences

Supports first-party, retargeting, lookalike, interest/contextual, search intent — only when platform/account eligibility allows. Sensitive-category interest targeting is flagged and not recommended.

## Handoffs

- **AdCreativeBrief** → Creative Studio (`handoffDepartment: "creative"`)
- **LandingPageHandoffRequest** → Website Department when destination missing/insufficient (no duplicate website engine)

## Experiments

`ExperimentPlan` includes hypothesis, variable, control, variants, metric, minimum evidence criterion, evaluation window, stop condition.  
`claimsStatisticalSignificance` is always `false`.

## Execution boundary

`evaluateAdsPublishGates` always returns `DENIED` / `productionMutations: "NONE"`.

Future publish (not in this workstream) must still pass: tenant, account, entitlement, approval, spend authorization, budget, kill switch, provider readiness.

`refuseAdSpendMutation` / `refuseAdAccountBillingMutation` throw hard errors.

## Measurement contract

`AcquisitionMeasurementContract` (`feedSchemaVersion: acquisition.v1`) feeds Workstream 8. Advertising does not interpret analytics globally.

## Audit integration

`assessPaidAdsForAudit` answers “Should this customer run paid ads?”

Possible verdicts include `NO` (conversion foundation insufficient), `SETUP_REQUIRED`, `NOT_YET`, `CONDITIONAL_YES`, `INSUFFICIENT_EVIDENCE`.  
Never upsell ads by default (`upsellDefault: false`, `shouldRunPaidAds: false` in this workstream).

## Planner wiring

Workflow focus `paid_acquisition_readiness` expands to growth → research → ads plan → creative brief → landing handoff → experiment → finance → quality.  
Work items mark missing `meta_ad_campaigns` entitlement as `SETUP_REQUIRED`.  
`ads.publish` is never included in planning stages.

## Safety

| Control | Status |
|---------|--------|
| Production campaign launch | NONE |
| Ad spend mutation | Forbidden |
| Account billing mutation | Forbidden |
| Tenant isolation | Gate-enforced |
| Entitlement | Required for execution path |

## Tests

`packages/workforce-core/src/__tests__/acquisition.test.ts` (included in `npm run test:workforce-core`).
