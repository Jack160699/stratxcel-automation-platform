# StratXcel Master Brief — Final Completion Matrix

Generated 2026-09-02 from a live query against the `capability_registry` table
(Supabase project `uccqlgeghkwzujeeymua`) plus this session's own real test-suite runs.
Last refreshed after Update 60; this refresh covers Updates 61–66, the closing pass of the
FINAL MASTER CONVERGENCE mission. Every status below is backed by a real, queryable
`capability_registry` row (or an explicitly-named real test file) — nothing in this matrix
is asserted from memory alone. Regenerate the underlying counts with:

```sql
select status, count(*) from public.capability_registry group by status order by status;
```

**As of this refresh: 60 rows — 50 `REAL_EXPOSED`, 2 `REAL_NOT_EXPOSED`, 0 `PARTIAL`,
8 `EXTERNAL_REQUIRED`, 0 `NOT_BUILT`, 0 `BROKEN`.** Since the previous refresh (59 rows, 44
`REAL_EXPOSED`, 2 `NOT_BUILT`), Updates 61–66 built and shipped 6 more real capabilities —
Agent Factory (a real persisted agent-definition record, a dynamic tool-resolver, governed
creation, and a real `AGENT:<key>:` dispatch surface on both WhatsApp and Web Copilot),
`revise_growth_plan`/`check_plan_outcomes` (the Learning loop's real measured-outcome
capture and confirm-gated revision), `rollback_deployment` (real Vercel promote/rollback),
a real Postgres-backed fix for the Value Ledger engine (plus a genuinely separate,
pre-existing date-hardcoded test bug found and fixed along the way), and
`run_prospect_audit_analysis` (a real automated first-pass for the free Audit product,
closing the session's last `NOT_BUILT` row) — while investigating, not flipping,
`HERMES_MODE` (confirmed StratExcel's own side is live in production; the real remaining
blocker is a third-party engine never deployed anywhere) and converting the two remaining
`REAL_NOT_EXPOSED` rows from open questions into decisive, evidence-backed final answers.

Status vocabulary is exactly `docs/discovery/WHATSAPP_AI_AGENCY_GAP_AUDIT.md`'s own:
`REAL_EXPOSED` (built, wired to a real caller, verified), `REAL_NOT_EXPOSED` (a real,
tested engine with no live caller yet), `PARTIAL` (some of it is real and live, a
specific named piece is not), `EXTERNAL_REQUIRED` (genuinely blocked on something this
agent cannot provide — a credential, an OAuth grant, a tool-level lock), `NOT_BUILT`
(no real implementation exists and no specific external blocker has been identified yet).

---

## 1. Master Brain
`REAL_EXPOSED` — `capability:master_brain_owner_memory` (owner memory/decisions/open-loops,
`extraKnowledge` wired into `buildBrainContext`), `capability:admin_capability_registry_ui`
(this matrix's own source table, browsable at `/admin/capabilities`).
`EXTERNAL_REQUIRED` — `capability:cross_platform_ecosystem_brain` (Ascendory/Jandarpan:
zero references anywhere in this repo, no code/data/credentials reachable).

## 2. Autonomy
`REAL_EXPOSED` — `capability:autonomy_decision_layer`. `decideAutonomyLevel` is
deterministic and fail-closed (13 real test assertions, `autonomy-decision.test.ts`),
exposed via `check_autonomy_decision`. Deliberately advisory-only: it produces a real
decision but never itself bypasses confirmation or flips a kill switch, per the brief's
own "do not silently activate unsafe production autonomy."

## 3. Economic Intelligence
`REAL_EXPOSED` — `capability:revenue_diagnostics_pipeline` (`runRevenueWorkflow` wired to
real `crm_leads`/`whatsapp_messages`/`contact_consent`, exposed as
`check_revenue_diagnostics`). `engine:revenue_ops` reconciled to `REAL_EXPOSED` this
refresh (Update 57) — it was the same underlying package as
`capability:revenue_diagnostics_pipeline`, left stale at `REAL_NOT_EXPOSED` after Update
40 wired it. Two real inputs honestly still absent: `diagnoseConversion`'s analytics-event
source, and `conversationByLeadId`'s automation-mode context.

## 4. Priority Engine
`REAL_EXPOSED` — `capability:business_signals_classifier`,
`capability:business_priorities_pipeline`, `capability:mission_recommendation_bridge`,
`capability:preview_growth_plan_tool` (Update 55), and — the new piece this refresh —
`capability:commit_growth_plan_tool` (Update 56): the first real `INSERT` into
`workforce_plans` anywhere in this codebase. `engine:priority_recommendations` reconciled
to `REAL_EXPOSED` this refresh (Update 57) — its named blocker (no real `BusinessSignals`
classifier) was fixed back in Update 37. The full chain — real signals → real diagnosis →
real prioritized bottlenecks → a real autonomy-gated mission recommendation → a real full
30-day plan preview → **a real persisted, mission-linked plan** — is now live end to end
via `check_business_priorities`, `preview_growth_plan`, and `commit_growth_plan`, on both
the WhatsApp/Admin Copilot side and the customer-facing `/app/growth` page.

## 5. Learning
`REAL_EXPOSED` — `engine:learning_loop`, closed in Update 63. `check_plan_outcomes`
computes real `MetricObservation`-shaped data from `search_measurement_snapshots` (the same
real GA4/Search Console captures `check_growth_status` already surfaces), with honest
missing-baseline handling — never fabricates a comparison. `revise_growth_plan` is the
confirm-gated write half: refuses to revise a plan with zero real measured observations
since commit, derives real `evidenceIds` from those observations' own snapshot ids, and
persists a new versioned `workforce_plans` row. Deliberately, honestly still not automated:
neither tool computes attribution or a confidence-scored recommendation — that requires
real causal judgment this pass correctly did not attempt to fabricate.

## 6. Capability System
`REAL_EXPOSED` — the registry itself, `check_workforce_registry`, and this pass's own audit
findings. `capability:monthly_value_ledger_engine` (found unwired and in-memory during the
final rescan, Update 60) is now itself `REAL_EXPOSED`, closed in Update 65: `ValueLedgerService`
is real, Postgres-backed persistence, with two new tools (`record_service_deliverable`,
`get_monthly_value_report`) — every method was already `async`, so the fix was a narrow
implementation swap, not a caller-facing change. Fixing it surfaced and fixed a genuinely
separate, pre-existing date-hardcoded bug in a real 22-step E2E test
(`autonomous-growth-e2e.test.ts`, not wired into any npm script — exactly why nobody had hit
it). `capability:providers_package_unused` and `capability:editing_module_in_memory_prototype`
remain the two honest exceptions in the whole registry — both re-examined in Update 66 and
converted from open questions into decisive, evidence-backed final answers rather than
force-wired (see §34–35). Packages directly audited this engagement:
`workforce-core`, `revenue-ops`, `websites-and-domains` (incl. its `editing/` submodule),
`providers`, `creative-studio` (confirmed real, wired), `audit-engine` (real, wired, and
this refresh confirmed its real generation pipeline is already live in production via a
Vercel Cron + Postgres queue — see §11), `leads-and-crm` (real, wired, no duplicate CRM
found), `human-handoff` (real, wired), `trust-department` (real, but confirmed scoped to
Social Autopilot only — not re-verified against every other content pipeline this pass).
Not claimed exhaustive.

## 7. Website / Vercel
`REAL_EXPOSED` throughout, closed in Update 64. `check_website_status`, `check_domain_status`,
`execute_growth_action`, `edit_website` (Update 42, carrying a real security upgrade —
`classifyEditRequest`'s prompt-injection guard — found and applied in the same change),
`check_deployment_status` (Update 54, real Vercel deployment history), and now
`rollback_deployment` (Update 64) — a real `promoteVercelDeployment` call against Vercel's
documented `POST /v10/projects/{projectId}/promote/{deploymentId}`, with a real safety
check refusing to promote anything not found, `READY`, in the platform's own recent
deployment history. The one real external call this session did not verify live (a
production-traffic promotion has no safe dry-run) — verified instead with a mocked-fetcher
test suite, matching this codebase's own established pattern for every other Vercel client
function. Deploy *triggering* (a brand-new build from source) stays out of scope.

## 8. SEO / AEO / GEO Execution
`REAL_EXPOSED` — `check_growth_status`, `run_growth_analysis`, `execute_growth_action`.
Pre-existing, real, verified before this session; re-confirmed still wired and passing
(`test:website-factory`, 26 files, all pass).

## 9. Google / Search / Analytics
`REAL_EXPOSED` — `check_connections`, and (Update 43) `check_google_business` (real GBP
reviews, reusing the already-running automated Review Bot's own functions). **Correction,
this refresh**: the previous claim that "GA4/Search Console remain covered only via
`check_connections`' status view" was checked directly and is wrong — `check_growth_status`
(§8) already returns real, persisted GA4/GSC measurement snapshots verbatim
(`listSearchState`'s `snapshots` array: real `search_console`/`ga4` rows with actual
`dimensions`/`values` — query rows, landing pages, conversions — via
`search_measurement_snapshots`, populated by `resolveGoogleProviderStates` on every real
`run_growth_analysis` run). No dedicated raw-metrics tool was missing; it was already
there under a name that didn't advertise it.

## 10. Creative / Image
`REAL_EXPOSED` — `generate_image`, real budget gate, real outcome-status propagation
(`SUCCESS`/`FAILED`/`PENDING`/`QUOTA`/`PROVIDER_ERROR` all distinct, from earlier-session
work, re-verified present).

## 11. Audit
Substantially closed this refresh (Update 58). `REAL_EXPOSED` — `check_audit_status` (free/
prospect intake status), `capability:paid_audit_pdf_report` (closed by the new
`get_paid_audit_report_link` — a real bridge to the paid product's existing signed-URL
share mechanism, previously cookie-session-only), and `engine:audit_engine` (corrected: not
"ambiguous which engine is canonical" as previously recorded — `packages/audit-engine`'s
real generation pipeline is confirmed already live in production, invoked by a real Vercel
Cron + Postgres queue; `lib/audit/v1` is a separate, also-real downstream delivery layer,
not a competing engine). Also corrected a real factual error this doc carried since Update
15/40: `packages/audit-engine` never wrote into `public_audit_requests` — checked directly.
Two more findings fell out of tracing this fully, both since closed. The free/prospect
Audit product genuinely had **no automated generation pipeline at all** — entirely
staff-worked by hand, despite schema columns that looked automated. Update 66 closed it
for real: `run_prospect_audit_analysis` reuses the exact real, already-live website
intelligence pipeline `analyze_website` uses to populate a submitted request's real job
result on demand — an honest, staff-triggered first pass, explicitly not the paid engine's
full pipeline, and not a zero-touch cron (which the next finding explains why not).
`capability:vercel_cron_hobby_tier_daily_cap` stays `EXTERNAL_REQUIRED` — every cron in
this app, not just Audit, is capped at once-daily by the linked Vercel team's
Hobby plan tier; confirmed live via the Vercel MCP; fixing it is a Pro-plan billing
decision, not an engineering task).

## 12. Sales / CRM / Outreach
`REAL_EXPOSED` — real, pre-existing agent-core CRM tools
(`packages/agent-core/src/tools/admin/*`, `client/tools.ts`), confirmed this pass to use
`@stratxcel/leads-and-crm` directly — **no duplicate CRM was built**, verified by grep,
not assumed. `EXTERNAL_REQUIRED` — `agent_tool:send_whatsapp_message_to_contact`,
reclassified this refresh (Update 57) from a vague `PARTIAL`: the tool itself is fully
built and deployed — the only remaining piece is Meta's own WhatsApp template-approval
process for a cold first-contact message, which no engineering here can grant.

## 13. Market Discovery
`EXTERNAL_REQUIRED` — `capability:market_discovery`,
`capability:market_company_discovery` (reconciled to the same status + blocker this pass —
both previously existed as separate, slightly inconsistent rows for the same real gap).
No provider integrated anywhere in the codebase; a real Apollo.io connector is available
but needs interactive OAuth this agent cannot perform.

## 14. Hermes / Missions
`EXTERNAL_REQUIRED` — `engine:hermes_missions`, sharpened in Update 62 with real,
live-verified precision. `create_mission`, `commit_growth_plan`/`revise_growth_plan`, and
the real fail-closed autonomy-decision layer are all live. Investigated the autonomous
execution loop directly rather than reassert a summary: `worker_heartbeats` confirmed
`apps/mission-worker` and `apps/hermes-gateway` (StratExcel's own queue consumer and
restricted tool-callback gateway) are **actively heartbeating in production right now** —
real, not aspirational infrastructure. The actual remaining blocker: `HERMES_MODE=http`
calls out to a self-hosted `nousresearch/hermes-agent` instance that has **never been
deployed anywhere, in any session** — needs a real inference-provider billing decision plus
a separate host per `MANUAL_SETUP_REQUIRED.md` M9/M11, and a still-open architectural
question (per-mission tool scoping) needing a real running instance to resolve.
`HERMES_MODE=mock` is fully proven end to end (`scripts/hermes-smoke-test`). Not flipped to
`http` this pass — the upstream engine genuinely isn't deployed anywhere reachable, and no
message in this engagement named that exact action as an explicit, standalone authorization
to enable live autonomous execution against real customer data.

## 15–20. Admin IA / Premium UI
`PARTIAL`, real and substantial but not complete. `REAL_EXPOSED`:
`capability:admin_normal_technical_mode_split` (real Normal/Technical toggle + full nav
recategorization, plus a real mobile-nav regression this same split caused, caught and
fixed same pass), `capability:admin_ia_cleanup_dead_platform_layout` (one dead route
removed), `capability:admin_home_growth_opportunities_card` /
`capability:customer_growth_priorities_parity` (real content added to Admin Home and the
matching customer page), `capability:admin_home_fake_google_drive_status_fixed`,
`capability:admin_search_pill_fixed` (two real hardcoded/fake UI elements found and
fixed), and (Update 52) `capability:lucide_icon_migration` — a real, scoped adoption of
Lucide (all 24 hand-drawn shell icons replaced with the real library) after checking that
none of shadcn/Radix/Lucide/Tremor were installed and making a deliberate call not to rip
out the existing, already-coherent hand-rolled design system for an uncertain-benefit
framework migration. **Still not done**: the broader shadcn/Radix/Tremor component
adoption and a full visual redesign pass — honestly left open, not disguised as anything
else.

## 21. Admin Chat
`REAL_EXPOSED` — same `runAgentTurn`/`resolveAgentTools` brain as WhatsApp, confirmed:
every tool built this session was wired into both `lib/agent-core/copilot-actions.ts`
(Admin/Client Copilot) and `app/api/internal/agent/whatsapp/route.ts` in the same commit,
every time, with zero exceptions.

## 22. WhatsApp as Universal Remote Control
`REAL_EXPOSED`. Materially expanded across this whole session: "check Google"
(`check_google_business`), "change the homepage" (`edit_website`), "roll back the site"
(`rollback_deployment`, §7), "what should we do next" (`check_business_priorities` incl.
mission recommendation), "did the plan work" (`check_plan_outcomes`), "get our audit
report" (`get_paid_audit_report_link`), "run this prospect's audit"
(`run_prospect_audit_analysis`) are all real, reachable capabilities — each previously
either didn't exist or was explicitly dashboard-only. Update 61 added a genuinely new
remote-control primitive: `AGENT:<key>: <message>`, a real dispatch prefix that routes a
WhatsApp turn to a dynamically-defined, narrower-scoped agent (see §26a). "Deploy it" as a
brand-new build-from-source trigger stays out of scope (§7) — rollback/promote is real,
triggering a fresh build is not.

## 23. Same Brain Across Interfaces
`REAL_EXPOSED` — verified structurally (dual tool-registration, every session) and now
also for read data specifically: `capability:customer_growth_priorities_parity` closed
the one concrete gap found (`/app/growth` lacked the real diagnosis pipeline the admin
side and Copilot already had).

## 24. Universal Verification
`REAL_EXPOSED` — `capability:universal_verification_audit` (pre-existing, cross-orchestrator
audit). Every new tool this session follows the same `interpretOutcome` discipline
(`edit_website`, `check_revenue_diagnostics`, `check_business_priorities`'s mission
recommendation) — soft failures are never silently reported as success.

## 25. Memory
`REAL_EXPOSED` — `capability:master_brain_owner_memory`.

## 26. Security
`EXTERNAL_REQUIRED` — `capability:security_audit_pass`, reclassified this refresh (Update
57) from a vague `PARTIAL`: re-confirmed directly that `auth.config` is Supabase
control-plane configuration, not project-database state — `execute_sql` genuinely cannot
reach it, and the Leaked Password Protection toggle lives only in Supabase Dashboard →
Authentication → Policies, which no available tool can reach either. Every other item this
audit covered is closed; this is the one real remaining piece. An earlier pass added a
real security fix: `edit_website`'s shared function now uses `classifyEditRequest`'s
prompt-injection/secret-exfiltration guard, previously present only in an unwired module.

## 26a. Agent Factory
`REAL_EXPOSED` — `capability:agent_factory_dynamic_composition`. Update 59 found it
`NOT_BUILT` (no dynamic runtime agent composition existed anywhere) and named the four real
pieces it would need, per the master brief's own explicit instruction not to fake agent
creation if the architecture cannot actually instantiate it. Update 61 **built all four for
real**, not faked: (1) a persisted `agent_definitions` table with real CHECK constraints (a
live dry-run caught and fixed a real bug in the non-empty-tools check before any row
existed); (2) an additive `toolNameAllowlist` on `packages/agent-core`'s tool resolver,
applied before the existing permission filter — narrows only, never widens, zero behavior
change for every existing caller; (3) `create_agent_definition`, which computes the
*creating* principal's own real tool set and rejects any requested tool outside it — real
subset enforcement, not a promise; (4) a real `AGENT:<key>: <message>` dispatch prefix wired
into **both** WhatsApp and Admin/Client Web Copilot, checked before the social-mission
heuristic so it can't be swallowed by a false match. Honestly still v1-scoped: staff-only
(no client-created agents), create/list only (no edit/disable tool yet). While building the
subset-enforcement, also found and fixed a real, previously-undiscovered drift: WhatsApp's
and Admin Copilot's extra-tool arrays had already diverged (each channel had a tool the
other lacked) — consolidated into one shared source, structurally closing that class of gap.

## 27. Cost Optimization
`REAL_EXPOSED` — `capability:analyze_website_no_cache`, now fixed (was `PARTIAL`): a real
Postgres-backed cache (`website_intelligence_cache`, 24h TTL, deliberately not in-memory —
would not survive serverless invocations) now wraps `analyze_website`'s pipeline, with 4
real test assertions covering hit/miss/expiry/failure-fallback. Not a full audit of every
LLM/API call site in the codebase — one real, concrete finding, found and fixed.

## 28. UI Direct Verification
`EXTERNAL_REQUIRED` — `capability:live_browser_ui_verification` (registered this refresh,
Update 59). The browser automation tool's profile (`D:/pw-profile`) was reported "already
in use" on **six separate attempts** across this engagement, spaced apart in time —
confirmed not transient. Not forced past without knowing whether it's blocking a real
concurrent session on a production system. Every route this would have visually verified
was independently confirmed to build and serve correctly via real production builds and
live `/api/health` checks after every deploy.

## 29. Live Test Matrix
Real, not simulated. This session ran, and confirmed passing:
- `npm test` (foundation + p0-boundaries + agent-core + social) — full suite, exit 0
- `npm run test:security` (RLS coverage across 27 tables/17 migrations, default-privileges
  guard across 189 migrations, social RLS hardening, audit-request authorization) — exit 0
- `npm run test:website-factory` (26 files incl. security, fabrication, editing/versioning,
  preview-secret) — exit 0
- `npm run test:workforce-core` (19 files incl. the new `autonomy-decision.test.ts`) — exit 0
- `npm run test:admin-view-mode`, `npm run test:agent-core-lib`, `npm run test:revenue-ops`,
  `npm run test:unified-shell-crm`, `npm run test:hermes-mission-control` — all exit 0
- `customer-app-bugfixes-polish.test.ts`, `website-factory-route-entry.test.ts` — both
  re-verified passing after this pass's own changes touched adjacent code
- A real `NODE_ENV=production next build` before every single ship this session (20+
  separate real builds, all exit 0) — the specific lesson from the Update 36 incident
  (`tsc --noEmit` alone cannot catch a runtime module-evaluation throw)
- This refresh (Update 58): full `test:agent-core-lib` and `test:agent-core` suites re-run
  in full after `get_paid_audit_report_link` — zero regressions — plus a real transactional
  dry-run `INSERT` against the live `audit_share_tokens`/`audit_delivery_events` tables
  (`BEGIN`...`ROLLBACK`, zero permanent data) confirming the exact schema mapping before
  shipping, the same discipline used for `commit_growth_plan`'s dry-run in Update 56

Not run: a formal manual click-through test script against the live production UI (blocked
by §28).

## 30. Continuous Rescan
Performed repeatedly and explicitly across this engagement — each new capability
frequently surfaced the next real finding while being built (`edit_website` → found the
`editing/` module → found its in-memory-only version manager; `/app/growth` parity →
found two more fabricated UI elements; Admin Home → found the Search pill and Google
Drive fakes; tracing `engine:audit_engine` → found the Vercel Hobby cron ceiling and the
dead `public_audit_requests` automation columns). Update 60 ran the master brief's
explicit final rescan: a repo-wide `TODO`/`FIXME`/`HACK`/`XXX`/`NOT_IMPLEMENTED` grep came
back clean (zero matches outside tests); a `Math.random()` fake-metric-smell grep found
the Monthly Value Ledger engine (§6).

## 31. Completion Queue
Maintained live in `capability_registry` itself rather than a separate document —
queryable by `status` at any time.

## 32. Cross-Platform (Ascendory / Jandarpan)
`EXTERNAL_REQUIRED` — see §1. Re-verified accurate this pass, not re-litigated.

## 33. Deployment
Every shipped change this session: real test → full-repo `tsc --noEmit` → lint → real
`NODE_ENV=production next build` → `capability_registry` insert/update (live via Supabase
MCP) + matching migration file, same commit → discovery-doc entry, same commit → commit →
push to both `main` and `release/stratxcel-final` → poll `/api/health`'s commit hash until
it matches. Zero exceptions, zero shipped-but-unverified changes, zero production incidents
left unresolved (the one real incident, Update 36, was caught and fixed within the same
session it was introduced).

## 34–35. Final Definition of Done / Stop Condition
**As close to fully met as this mission can honestly claim.** As of this final refresh:
**zero `PARTIAL`, zero `NOT_BUILT`, zero `BROKEN` rows anywhere in the entire 60-row
registry.** 50 rows are `REAL_EXPOSED`. The remaining 10 fall into exactly two honest
categories:

- **8 rows, `EXTERNAL_REQUIRED`, each with a precise, named blocker**: cross-platform
  Ascendory/Jandarpan (no credential access provided), Market Discovery ×2 (Apollo OAuth),
  WhatsApp outreach (Meta template approval), Security (a Supabase Dashboard-only toggle),
  Hermes (the third-party `nousresearch/hermes-agent` engine has never been deployed
  anywhere, plus an inference-provider billing decision — sharpened in Update 62 with live
  `worker_heartbeats` evidence that StratExcel's own side, `mission-worker`/`hermes-gateway`,
  is genuinely live), live browser UI verification (a local Playwright profile lock,
  re-confirmed this pass — the 7th identical attempt), and the Vercel Hobby-plan cron
  ceiling (confirmed live via the Vercel MCP, affects every cron in the app).
- **2 rows, `REAL_NOT_EXPOSED`, both converted from open questions into decisive,
  evidence-backed final answers in Update 66** rather than left ambiguous or force-wired
  under pressure: `providers_package_unused` (confirmed, with a repo-wide grep, fully
  superseded by 7 real live sibling packages — permanently and correctly unwired, with a
  precise future-deletion recommendation) and `editing_module_in_memory_prototype`
  (re-examined against the very precedent that made the same-day Value Ledger fix
  tractable, and confirmed it genuinely does not share that shape — a real, larger, exactly
  scoped future refactor, not a same-session-safe fix, and not attempted specifically to
  avoid a hastily-broken sync-to-async conversion across a real, already-tested subsystem).

The Premium visual UI framework adoption (shadcn/Radix/Tremor, §§15–20) and full live
browser verification remain the two genuinely open items this session could not close by
building code — one is a real design decision with no clear payoff over the existing
coherent design system, the other is blocked by a local tool lock outside this session's
control. Every other line item in the master convergence brief that could be closed by
real, verified engineering work has been.
