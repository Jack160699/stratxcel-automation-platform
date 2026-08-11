# AI Workforce Architecture

**Status:** Foundation (WorkforceCore + Hermes CEO + 30-Day Planner)  
**Branch intent:** Contract PR — verify before launching parallel department builds.  
**Verified main base:** `1757d15`

## Reality check (Hermes mode)

Production mission-worker selects Hermes via `HERMES_MODE`:

| Value | Behavior |
|-------|----------|
| unset / `disabled` / unrecognized | `DisabledHermesAdapter` → missions `BLOCKED` |
| `mock` | Deterministic local fake |
| `http` | Live Nous Hermes Agent `/v1/runs` |

**This PR does not change production environment variables.** Default remains fail-closed `disabled`. See `HERMES_SKILLS_AND_TOOLS.md`.

## Architectural rule

```
USER / PACKAGE / AUTOMATIC TRIGGER
        ↓
STRATXCEL MISSION
        ↓
HERMES CEO
        ↓
30-DAY / MISSION STRATEGY
        ↓
DEPARTMENT WORKFLOW DAG
        ↓
SPECIALIST HERMES SUB-RUNS
        ↓
ARTIFACTS → CRITIQUE / REVISION / QA → FINAL
        ↓
SAFE EXECUTION → MEASUREMENT → LEARNING → NEXT PLAN
```

- **Hermes** is the central CEO / orchestration intelligence.
- **Stratxcel** owns departments, roles, delegation, mission state, tenant isolation, entitlements, tools, artifacts, quality, budgets, approvals, audit, and external execution.
- Specialist agents are **not** separate permanent Hermes installations — they are bounded Hermes runs with narrowed tools/budget/output contracts.
- **Never** delegate authorization decisions to model text.

## Package: `@stratxcel/workforce-core`

```
packages/workforce-core/src/
  departments/     # 25-department registry
  roles/           # specialist roles under departments
  capabilities/    # provider-independent capability registry
  planning/        # WorkforcePlan, allocation, 30-day planner, validator
  execution/       # DAG, Hermes CEO compile/parse, specialist runner
  quality/         # scores, critic, critique/revision loop
  artifacts/       # provenance metadata for mission_artifacts
  handoffs/        # DepartmentHandoff contract
  budgets/         # hierarchical envelopes
  events/          # structured workforce.* events
  security/        # tool/capability/budget narrowing
  evidence/        # EvidenceReference contract
  learning/        # measured-signal interfaces only
  brand-context/   # Brand Brain slice compiler
  catalogue/       # V2 metadata layer (non-breaking)
```

## Departments vs capabilities

Departments are logical operating units. **A department name grants NOTHING.**

Authorization is compiled by narrowing against the parent mission allowlist.

Capabilities report `AVAILABLE` | `NOT_CONFIGURED` | `UNAVAILABLE` | `PLANNED`.  
Unavailable media must not produce fake artifacts.

## Hermes CEO

- Profile: `stratxcel-ceo` (new). Compatibility profile `stratxcel-orchestrator` unchanged.
- CEO: understand → plan → delegate → evaluate → escalate. Does not write every final artifact.
- `compileHermesCeoPlan` / `parseCeoPlanProposal` validate departments, roles, DAG, budgets, and capability non-escalation.

## Specialist sub-runs

`runSpecialistAgent({...})` verifies tenant/mission from trusted mission row, verifies department/role registries, verifies artifact ownership, narrows tools ⊆ parent, budget ≤ parent remaining, issues bounded capability token, invokes Hermes, audits, fails closed.

## 30-Day Growth Planner

| Policy | Behavior |
|--------|----------|
| `FIXED_COMPOSITION` | Preserve exact purchased mix (e.g. Starter 8 image + 4 reel) |
| `FLEXIBLE_COMPOSITION` | Choose mix totaling ≤ unit cap |
| `MINIMUM_COMPOSITION` | Meet floors |
| `CUSTOM_CONTRACT` | Explicit contract composition |
| `UNKNOWN` | **Fail closed** |

Planner may optimize topics, themes, sequence, timing, platforms, creative style, funnel purpose, messaging, CTA — **inside** the contract.

Compatible with `lib/social/package-composition.ts` via allocation helpers. Package Autopilot is **not** replaced; Shadow / AUTO_PUBLISH unchanged.

Claims are `KNOWN` | `DERIVED` | `ASSUMPTION` | `RESEARCH_REQUIRED`. No fabricated market/competitor/SERP/performance facts.

## Quality loop

`GENERATE → CRITIQUE → SCORE → REVISE → COMPARE → VALIDATE → SELECT`

Creator ≠ sole critic. Revision attempts bounded. Brand / factuality gates enforceable.

## Persistence

| Reused | Added |
|--------|-------|
| missions, mission_events, mission_artifacts, audit_events, usage_entitlements, subscriptions | `workforce_plans`, `workforce_stages`, `workforce_reviews` |

Migration: `supabase/migrations/20260812090000_workforce_core.sql`  
**Production migration applied: NO**

## Security boundary

- Tenant from trusted mission context only.
- Child cannot broaden tenant/tools/entitlement/approval/budget.
- No Hermes built-in host toolsets re-enabled.
- Planning does **not** authorize social publish, website deploy, ad spend, WhatsApp send, or destructive CRM.

## Next phase

After this contract PR is verified: media providers behind capability registry, department execution adapters, Package Autopilot consuming approved 30-day allocation, Command Center week view, enable `HERMES_MODE=http` only when model/credit path is solid.
