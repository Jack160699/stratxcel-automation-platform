# AI Workforce Architecture

**Status:** Foundation (WorkforceCore + Hermes CEO + Business Growth Operating System)
**PR:** #32 (draft) â€” verify before parallel department builds.

## Product model

Stratxcel is a **full AI growth agency / business growth operating system**.
**Social is one execution channel**, not the center of the architecture.

Canonical lifecycle:

```
BUSINESS
â†’ DIAGNOSE
â†’ IDENTIFY BOTTLENECKS
â†’ PRIORITIZE
â†’ RECOMMEND
â†’ PLAN
â†’ ASSEMBLE DEPARTMENTS
â†’ EXECUTE PURCHASED SERVICES
â†’ CAPTURE OPPORTUNITIES
â†’ CONVERT
â†’ MEASURE
â†’ OPTIMIZE
â†’ REPLAN
```

### Customer entry modes

| Mode | Meaning |
|------|---------|
| `AUDIT_ONLY` | Diagnostic product â€” recommend, do not execute unpurchased work |
| `NEW_BUSINESS` | Foundation-first (positioning, website, capture, CRM skeleton) |
| `EXISTING_BUSINESS` | Preserve what works; bottleneck-first routing |
| `ACTIVE_PACKAGE_CUSTOMER` | Allocate purchased entitlements to highest-priority work |
| `EXISTING_CUSTOMER_RENEWAL` | Optimization / renewal cycle |

## Hermes CEO

Hermes CEO operates the **entire business-growth system**:

1. What kind of business is this?
2. What stage is it in?
3. What is already working?
4. What evidence do we have?
5. Where is the biggest growth bottleneck?
6. What should we NOT change?
7. What should we improve first?
8. What did the customer purchase?
9. What can Stratxcel actually execute?
10. Which departments are required?
11. What is the 30-day plan?
12. What requires setup/approval?
13. What should be measured?
14. What should we reconsider after measurement?

Profile: `stratxcel-ceo` (compatibility: `stratxcel-orchestrator`).

## Planning concepts

| Concept | Role |
|---------|------|
| **Business Growth Plan** | Canonical plan object |
| **30-Day Execution Plan** | Immediate entitlement-bound horizon |
| **Strategic horizon** | now / 30 / 31â€“60 / 61â€“90 **direction** (not fabricated unpurchased execution) |

Social allocation lives at `businessGrowthPlan.socialPlan?.allocation` and is **optional**.
Audit-only, SEO-only, website-only, CRM-only plans may omit it.

## Diagnosis â†’ bottlenecks â†’ recommendations

```
AUDIT / SIGNALS
â†’ BusinessGrowthDiagnosis (KNOWN | DERIVED | ASSUMPTION | RESEARCH_REQUIRED)
â†’ GrowthBottleneck (priority-scored)
â†’ GrowthRecommendation + PlanRecommendation
â†’ commercial fit = SMALLEST covering option (or CUSTOM)
â†’ 30-day Business Growth Plan
â†’ department DAG
â†’ measurement â†’ optimization
```

Never guarantee revenue, leads, ROAS, rankings, or sales.
Never upsell the highest plan for revenue alone.
Never invent Instagram/channels when none are connected (`NO_CONNECTED_CHANNEL` / `SETUP_REQUIRED`).

## Departments vs capabilities

25 departments remain logical operating units â€” **grant nothing**.
Capabilities are independently compiled; unavailable media cannot fake reel success via image generation.

## Quality principle

Stratxcel does not sell task counts as primary value.
Purchased entitlements fund the highest-quality, highest-priority evidence-backed work:

Research â†’ Strategy â†’ Specialist production â†’ Independent critique â†’ Revision â†’ Brand/fact QA â†’ Safe execution â†’ Measurement â†’ Learning

## Persistence / security

Additive tables: `workforce_plans`, `workforce_stages`, `workforce_reviews` (RLS).
**Production migration: NOT applied by this PR.**
`HERMES_MODE` production default remains disabled â€” unchanged.

## Next parallel sprints

Department/capability providers (media, SEO publish, website deploy, ads, WhatsApp send) behind the registry â€” not in this foundation PR.
