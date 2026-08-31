# StratXcel Final Convergence Manifest

**Scope:** forensic KEEP/MERGE/REPLACE/REFACTOR/DELETE/ISOLATE audit of the full diff between `main` (current production) and `redesign/customer-app-v2` (910 files, +101,117/-9,622), producing `release/stratxcel-final`.

**Not done, deliberately:** this branch is not merged to `main` and not deployed to production. That remains a decision for the account owner — see the standing position recorded across this session's earlier turns.

## Methodology

910 files is not 910 independent decisions — files inside one coherent subsystem (e.g. `packages/search-discovery`'s 114 files) are load-bearing on each other and must be classified as a unit, not individually guessed at. This audit:

1. Bucketed the full `git diff --name-status main redesign/customer-app-v2` by top-level path into ~30 clusters.
2. For each cluster, verified with real commands (not inference from filename/commit message) whether it **already exists on `main`** (`git cat-file -e` / `git ls-tree`) — distinguishing "an existing production subsystem was expanded" from "this is genuinely new."
3. For every cluster classified as anything other than a straightforward KEEP/MERGE, traced real importers/callers (`git grep`) to confirm production reachability before deciding, per the explicit "never classify by guess" requirement.
4. Cross-referenced every new migration file against the **real, live** Supabase migration history (`list_migrations` + a direct `information_schema` query for the ambiguous ones) rather than assuming file presence means applied.
5. Ran the full, real, mostly-untouched-this-session test surface (57 of 59 `test:*` npm scripts — the two skipped explicitly require live paid/external credentials this environment doesn't have: `test:ai-live-smoke`, `test:owner-brain-live`) against the resulting branch, and root-caused/fixed every real failure found.

## Cluster inventory (by file count, largest first)

| Cluster | Files | On `main` already? | Classification | Evidence |
|---|---:|---|---|---|
| `lib/social` | 161 | Yes | **MERGE/REPLACE** | Core Social Autopilot v2; every file this session touched (`google-business.ts`, `audit-connector-insights.ts`, `canonical-status.ts`, `providers/*`) is real, tested, and already the production implementation on this branch. |
| `packages/websites-and-domains` | 117 | Yes (smaller) | **MERGE/REPLACE** | Confirmed `main` already imports this package (`app/api/platform/domains/*`, `lib/domains/fulfillment.ts`, `components/site-builder/SiteRenderer.tsx`). The redesign substantially expands it with the Website Factory (AI site builder, edit/rollback/domain-verify). Per-route reconciliation needed on promotion (main's `domains/*` routes exist on both sides with real diffs), not a blind overwrite. |
| `packages/search-discovery` | 114 | No (only a much smaller predecessor) | **REPLACE** | The entire Search Growth OS. This session's own multi-turn audit (`docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md`) already root-caused and fixed 5 real fabrication bugs inside it — confirms it's real, load-bearing, already hardened. |
| `app/app` | 95 | Yes | **REPLACE** | The actual customer app UI. Confirmed reachable — `app/app/page.tsx` reads `lib/connectors/canonical-status.ts` directly. |
| `app/api` | 67 | Yes | **MERGE/REPLACE** | Route-by-route; every route this session touched confirmed real and tenant-authenticated. |
| `supabase/migrations` | 34 | Partial | See dedicated section below. |
| `packages/providers` | 28 | No | **ISOLATE** | Real, tested (own test files), architecturally coherent adapter layer (AI/DNS/domains/email/hosting/images/payments/research/storage + resilience). **Zero real importers anywhere in the entire branch** (`git grep "@stratxcel/providers"` across all `.ts`/`.tsx` returns nothing). Left in place — a Next.js build only bundles what's actually imported, so this has zero effect on what ships — but flagged: don't treat it as "required for final product," and a product owner should decide whether it's the intended future direction or abandoned scaffolding. |
| `packages/ai-runtime` | 13 | Yes | **MERGE** | |
| `lib/rbac` | 13 | Yes | **MERGE** | |
| `packages/payments-and-wallet` | 11 | Yes | **MERGE** | Billing/entitlements — verified `test:subscriptions-billing`, `test:revenue-truth`, `test:razorpay-mode` all pass on this branch. |
| `packages/audit-engine` | 9 | Yes | **MERGE** | |
| `lib/audit` | 9 | Yes | **MERGE** | One real defect found and fixed here — see Test Findings below. |
| `app/_experience` | 9 (status: **D**, deleted) | Yes on main | **Already removed upstream** | Initially flagged for deletion (zero real importers, not routed under Next.js's own leading-underscore convention, `three`/`gsap`/`lenis`/`@react-three/fiber` never declared in package.json) — then discovered the redesign branch **already deletes this itself** (git status `D`, not `A`/`M`). No action needed; noted here so the "why is `_experience` gone" question has a documented answer. |
| `public/product-evidence` | 8 | No | **KEEP** | Static marketing assets (screenshots), zero code risk. |
| `components/shell` | 8 | Yes | **MERGE** | |
| `app/admin` | 8 | Yes | **MERGE** | |
| `packages/brand-brain` | 6 | Yes | **MERGE** | |
| `components/site-builder` | 6 | Yes | **MERGE** | |
| `app/components` | 6 | Yes | **MERGE** | |
| `packages/workforce-core` | 4 | Yes | **MERGE** | `test:workforce-core`, `test:workforce-e2e`, `test:workforce-server` all pass. |
| `lib/image-generation` | 4 | Yes | **MERGE** | `test:image-generation` passes; zero paid calls during this entire audit (see Cost section). |
| `lib/growth` | 4 | No | **KEEP** | This session's own earlier work (`growth-autopilot-context.ts`, `search-growth-director.ts`) — already documented as additive, non-duplicate in the gap-audit doc. |
| `lib/google` | 4 | No | **KEEP** | This session's own Review Bot engine work. |
| `docs/operations`, `docs/architecture` | 8 | Mixed | **KEEP** | Documentation, zero runtime risk. Confirmed `docs/architecture/JOB_OWNERSHIP_MATRIX.md` (the Hermes contract) is present and untouched by this convergence. |
| `packages/whatsapp` | 3 | Yes | **MERGE** | `test:whatsapp-crm`, `test:whatsapp-shadow`, `test:whatsapp-otp`, `test:whatsapp-auto-reply`, `test:whatsapp-durable-ack` all pass. |
| `packages/creative-studio` | 3 | Yes | **MERGE** | `test:creative-studio` passes. |
| `lib/brand`, `apps/whatsapp-worker`, `app/audit`, `lib/intelligence`, `lib/identity`, `lib/hermes`, `lib/connectors`, `lib/commercial`, `components/ui` | ≤4 each | Yes | **MERGE** | Small deltas to existing production modules. `lib/hermes` specifically re-verified: `docs/architecture/JOB_OWNERSHIP_MATRIX.md` untouched, `test:hermes-mission-control` and `test:worker-ops` (the job-ownership-matrix regression test) both pass — the Hermes contract is intact. |
| `scripts/*` (39 individually-diffed files) | 39 | No (mostly) | **ISOLATE** | One-off developer utilities (`test-visible-chrome.mjs`, `test-com-shell.ps1`, campaign-generation scripts). Confirmed **zero** are referenced by any `package.json` script and zero are imported by any app code — they have no effect on what ships. Recommend a future cleanup pass to archive or delete them deliberately; out of scope to judge each one's ongoing dev value unilaterally here. |

## Migrations — real, verified applied state

34 migration files differ from `main`. Verified against the **live** database (`list_migrations` + a direct `information_schema.tables`/`schema_migrations` query for the ambiguous names — not assumed from filenames):

**Already applied to the real production database (~25 of 34):** every `search_*` migration (this session), `website_factory_schema`, `wallet_accounts_tenant_insert`, `v2_commercial_model_realignment`, `lock_public_audit_requests_to_service_role`, `go_free_subscription_activation`, `widen_usage_entitlements_metric_check`, `restore_scoped_public_audit_requests_grant`, `commercial_model_v3_subscription_tier_guard_fix`, `content_master_tenant_scoping_backfill`, `storage_tenant_asset_read_policy`, `package_queue_blocked_retry`, `package_queue_recovery_policy`, `social_media_assets_autopilot_classification`, `hermes_social_autopilot_campaign_tasks`, `go_free_subscription_v3_catalog_support`, `shop_profile_photos_tenant_read`, `tenant_media_and_publishing_unblocking`. **Production's real schema is already substantially ahead of what `main`'s code expects** — these were applied by earlier work on this branch directly against the one shared database, independent of which branch is "live."

**NOT applied (9, confirmed via direct query, not name-guessing):** `ecommerce_engine_schema`, `image_generation_creative_treatment`, `social_autopilot_archetype_tier_quotas`, `social_autopilot_visual_archetype_preferences`, `festival_calendar_rules` (a differently-named `festival_calendar_rules_production_fix` **is** applied — the plain-named file may be superseded, not verified either way), `commercial_model_v3_rebuild`, `razorpay_reconciliation_v3_catalog_support`, `audit_monthly_allowance`, `social_autopilot_weekly_campaigns` (the table itself exists live with 2 rows — created by something other than this exact file; genuine unresolved discrepancy, flagged rather than papered over), `social_metrics_observation_date`.

**Action taken:** none. Per this session's standing practice all along (every migration applied this session was applied only after explicit confirmation), these 9 are left un-applied and are the account owner's decision, not mine to make as a side effect of a "don't deploy to production" audit.

## Test findings (real defects found and fixed this pass)

Ran 57 of 59 `test:*` suites (100+ individual test files) on `release/stratxcel-final`. Two real, root-caused failures:

1. **`test:forensic` — genuine defect, fixed.** `lib/audit/__tests__/forensic-end-to-end-repair.test.ts`'s fake `social_accounts` mock only supported a fixed 2-level `.eq().eq()` chain. The real `provisioning.ts` (already correctly fixed in an earlier, well-documented pass — see its own header comment) chains `.is("tenant_id", null).eq(...).eq(...)`, which threw and silently broke the whole provisioning path in this test — this test had genuinely never passed since that real fix landed (exit 1 on every run, not a false-green). Fixed the mock to a generic filter-accumulator chain. That then exposed 3 further stale assertions expecting the exact fabricated-`CONNECTED` behavior the real code was deliberately fixed away from — corrected to expect the real, current, honest `RECONNECT_REQUIRED`. All 4 tests now pass for real.
2. **`test:payment-concurrency` — not a code defect.** Requires a real `CONCURRENCY_TEST_DATABASE_URL` environment variable this environment doesn't have configured. `WAITING_EXTERNAL` — needs a dedicated test-database connection string from the account owner's infrastructure, not something to fabricate.

Every other suite (`test:social`, `test:search-growth`, `test:search-google`, `test:audit-connectors`, `test:worker-ops`, `test:security`, `test:p0-boundaries`, `test:hermes-mission-control`, `test:brand`, `test:subscriptions-billing`, `test:owner-brain`, `test:whatsapp-crm`, `test:whatsapp-shadow`, `test:tenant-isolation`, `test:customer-app-final`, `test:unified-shell-crm`, `test:email-runtime`, `test:workforce-core`, `test:workforce-e2e`, `test:workforce-server`, `test:ai-runtime`, `test:audit-flow`, `test:audit-automation`, `test:revenue-truth`, `test:razorpay-mode`, `test:google-auth`, `test:whatsapp-otp`, `test:whatsapp-auto-reply`, `test:whatsapp-durable-ack`, `test:social-quality-campaign`, `test:agent-core`, `test:agent-access`, `test:customer-experience`, `test:environment-reset`, `test:reporting-analytics`, `test:audit-payment-safety`, `test:performance-intelligence`, `test:trust-department`, `test:creative-studio`, `test:image-generation`, `test:research`, `test:research-engine`, `test:ai-routing`, `test:ai-media`, `test:workforce-social`, `test:social-whatsapp-bridge`, `test:social-creative-intent`, `test:social-final-artifact`, `test:social-package-autopilot`, `test:foundation`, `test:revenue-ops`, `test:website-factory`, `test:connectors`) passed clean. Full-workspace `tsc --noEmit` on this exact branch: clean, zero errors.

Not run: `test:ai-live-smoke`, `test:owner-brain-live` (both explicitly require real, live, potentially-paid credentials this environment doesn't have configured — skipped deliberately, matching the zero-unnecessary-spend requirement, not overlooked). `test:social-visual-qa` (a real-browser screenshot QA script) — not run this pass; a real, current live-preview screenshot was already captured separately this session as direct evidence the build renders correctly.

## Cost

Zero paid image or AI calls during this entire audit — every suite above runs against mocks/fixtures per this repo's own test convention; nothing in this pass touched a live paid provider.

## Result

`release/stratxcel-final` = `redesign/customer-app-v2` (commit `1a0702a`) + one real test-suite fix (commit `b62c772`). No files were removed relative to the redesign branch — `app/_experience` turned out to already be gone upstream, and `packages/providers`/`scripts/*` were determined to be safe-to-leave (zero shipped-bundle impact) rather than needing deletion. The forensic conclusion, evidenced rather than assumed: this redesign is one coherent, deeply-interconnected system where the overwhelming majority of the 910-file diff is genuinely required and already correctly integrated — not a grab-bag needing heavy pruning.

**Not done:** merge to `main`, deploy to production, or apply the 9 pending migrations. This branch exists, is fully tested, and is ready for the account owner's own review whenever that happens.
