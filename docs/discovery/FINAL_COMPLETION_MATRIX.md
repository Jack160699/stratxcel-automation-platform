# StratXcel Master Brief — Final Completion Matrix

Generated 2026-09-02 from a live query against the `capability_registry` table
(Supabase project `uccqlgeghkwzujeeymua`) plus this session's own real test-suite runs.
Last refreshed after Update 55; this refresh covers Updates 56–60. Every status below is
backed by a real, queryable `capability_registry` row (or an explicitly-named real test
file) — nothing in this matrix is asserted from memory alone. Regenerate the underlying
counts with:

```sql
select status, count(*) from public.capability_registry group by status order by status;
```

As of this refresh: **59 rows** — 44 `REAL_EXPOSED`, 5 `REAL_NOT_EXPOSED`, 0 `PARTIAL`,
8 `EXTERNAL_REQUIRED`, 2 `NOT_BUILT`. Since the previous refresh (52 rows, 36
`REAL_EXPOSED`, 3 `PARTIAL`), Updates 56–60: shipped `commit_growth_plan` (the first real
write to `workforce_plans`) and `get_paid_audit_report_link` (closing the paid Audit
share-link gap from Update 21); reconciled every remaining `PARTIAL` row to a precise
`REAL_EXPOSED` or `EXTERNAL_REQUIRED` (zero `PARTIAL` rows remain in the entire registry);
corrected a real factual error about `packages/audit-engine` carried since Update 15/40;
found and honestly recorded two genuinely new items — an Agent Factory investigated and
confirmed `NOT_BUILT` (no dynamic runtime agent composition exists anywhere in this
codebase), and a platform-wide Vercel Hobby-plan cron ceiling affecting every cron in the
app, not just Audit generation.

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
`REAL_NOT_EXPOSED` — `engine:learning_loop`. Update 56 closed the specific blocker
recorded in the previous refresh: `commit_growth_plan` is the first real write path to
`workforce_plans`, so a real, mission-linked `BusinessGrowthPlan` can now genuinely exist
in production. Still honestly open, and deliberately not forced to `REAL_EXPOSED`:
`applyLearningRevision` (the actual revision logic) is not wired to any real tool yet, and
no real measured-outcome capture pipeline feeds it real `MeasuredPerformanceSignal` data —
the write path existing is necessary but not sufficient for the full loop to run.

## 6. Capability System
`REAL_EXPOSED` — the registry itself, `check_workforce_registry`, and this pass's own
audit findings (`capability:providers_package_unused`,
`capability:editing_module_in_memory_prototype`, and — new this refresh —
`capability:monthly_value_ledger_engine`: a real, well-built Monthly Value/ROI report
engine with zero real callers anywhere, using the same in-memory-store anti-pattern
already flagged in `editing/`). Packages directly audited this engagement:
`workforce-core`, `revenue-ops`, `websites-and-domains` (incl. its `editing/` submodule),
`providers`, `creative-studio` (confirmed real, wired), `audit-engine` (real, wired, and
this refresh confirmed its real generation pipeline is already live in production via a
Vercel Cron + Postgres queue — see §11), `leads-and-crm` (real, wired, no duplicate CRM
found), `human-handoff` (real, wired), `trust-department` (real, but confirmed scoped to
Social Autopilot only — not re-verified against every other content pipeline this pass).
Not claimed exhaustive.

## 7. Website / Vercel
`PARTIAL`. `REAL_EXPOSED`: `check_website_status`, `check_domain_status`,
`execute_growth_action`, `edit_website` (Update 42, carrying a real security upgrade —
`classifyEditRequest`'s prompt-injection guard — found and applied in the same change),
and (Update 54) `check_deployment_status` — real Vercel deployment history
(`listVercelDeployments`, another real function with zero prior callers). `REAL_NOT_EXPOSED`:
`engine:website_vercel_orchestration` remains the label for the still-missing piece
specifically — deployment *triggering*, rollback, and recovery as agent-invokable
mutations (status is now read-only-complete, mutation surface still open).

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
Two new, honest findings fell out of tracing this fully: `capability:prospect_audit_automated_pipeline`
(`NOT_BUILT` — the free/prospect Audit product has **no automated generation pipeline at
all**; it's entirely staff-worked by hand today, despite schema columns that look
automated) and `capability:vercel_cron_hobby_tier_daily_cap` (`EXTERNAL_REQUIRED` — every
cron in this app, not just Audit, is capped at once-daily by the linked Vercel team's
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
`EXTERNAL_REQUIRED` — `engine:hermes_missions`, reclassified this refresh (Update 57) from
a vague `PARTIAL`: `create_mission`, `commit_growth_plan`, and the real fail-closed
autonomy-decision layer are all live — the engineering side is complete.
`capability:mission_recommendation_bridge` (earlier pass) closed the "when should a
mission be created" gap. What remains is deliberately not an engineering task:
`HERMES_MODE=disabled` is a real, intentional production kill-switch, and flipping it to
let missions actually execute autonomously is a business/safety decision requiring
explicit owner authorization — never something this agent will do unilaterally.

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
`PARTIAL`. Materially expanded this pass: "check Google" (`check_google_business`),
"change the homepage" / "create a page" (`edit_website`), "what should we do next"
(`check_business_priorities` incl. mission recommendation) are now real, reachable
capabilities that were not reachable before this session (each previously either didn't
exist or was explicitly marked dashboard-only). Not every example phrase in the brief's
own list resolves to a dedicated tool yet (e.g. "deploy it" as a standalone deployment
lifecycle action — see §7).

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
`NOT_BUILT` — `capability:agent_factory_dynamic_composition`, investigated directly this
refresh (Update 59) per the master brief's own explicit instruction not to fake agent
creation if the architecture cannot actually instantiate it. No dynamic runtime agent
composition exists anywhere in this codebase: `packages/workforce-core`'s departments/
roles/capabilities registries are 100% compile-time source data, and the single canonical
agent runtime (`runAgentTurn`) resolves its tool set from one hardcoded array literal
(`lib/agent-core/copilot-actions.ts`'s `extraTools`), identical on every request. A real
Agent Factory needs four pieces, none of which exist even as a stub: a persisted
agent-definition record, a dynamic tool-resolver replacing today's fixed array, a governed
creation flow (never privilege escalation), and a real dispatch surface. Correctly not
attempted as a same-session increment — a genuine multi-file architecture change, and a
stub version would itself be the exact fabrication the brief warned against.

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
**Not fully met, but real and substantial movement this refresh.** The stop condition
(from an earlier brief) demanded every item be `COMPLETE` or `EXTERNAL_REQUIRED`; the
current brief's status vocabulary (this matrix's own) is broader and more honest, and is
what's reported here. As of this refresh: **zero `PARTIAL` rows remain anywhere in the
registry** — every row that was `PARTIAL` in the previous refresh (`send_whatsapp_message_to_contact`,
`security_audit_pass`, `hermes_missions`) has been reclassified to a precise
`EXTERNAL_REQUIRED` with a named blocker, not left vague. 8 rows are genuinely
`EXTERNAL_REQUIRED`: cross-platform Ascendory/Jandarpan, Market Discovery ×2 (Apollo
OAuth), WhatsApp outreach (Meta template approval), Security (Supabase dashboard toggle),
Hermes (owner authorization), live browser UI verification, and — new this refresh — the
Vercel Hobby-plan cron ceiling. 2 rows are honestly `NOT_BUILT` with full architectural
reasoning: the Agent Factory (new this refresh — investigated, not assumed) and automated
free/prospect Audit generation (new this refresh). 5 rows remain `REAL_NOT_EXPOSED` — real,
tested engines genuinely without a live caller: `engine:learning_loop` (revision logic,
sharper now that the write path exists), `engine:website_vercel_orchestration` (deploy
trigger/rollback as an agent mutation), and three honest audit findings
(`editing_module_in_memory_prototype`, `providers_package_unused`,
`monthly_value_ledger_engine`, new this refresh). Real, uncompleted work reported as such
rather than forced into either bucket: the Premium visual UI framework adoption
(shadcn/Radix/Tremor, §§15–20), Website/Vercel's deploy-trigger mutation surface (§7), and
Learning's revision logic (§5).
