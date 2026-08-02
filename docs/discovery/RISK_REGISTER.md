# Risk Register

Ordered by severity × likelihood, based on live discovery on 2026-08-03.

## R1 — WhatsApp bot host is invisible to this engagement (Critical)

The production WhatsApp Business bot for `ai-automation-system` runs on infrastructure (EC2/VPS + systemd, per its own README) that no connected tool in this session can see, query, or verify. Its actual uptime, current code version relative to the repo, and whether it's still receiving live customer messages are all unknown.

- **Why it matters:** any migration plan that assumes "the bot is running fine, just port the code" could be building against a bot that's already degraded, or duplicating effort if it isn't actually in active use.
- **Mitigation:** owner must confirm (a) the bot's current host/IP, (b) that it is still processing real WhatsApp traffic, (c) SSH or hosting-console access if server-side inspection becomes necessary. Tracked as a `MANUAL_SETUP_REQUIRED.md` item.

## R2 — Two Vercel projects claim the same production domain (High)

`stratxcel` and `stratxcel-site` both list `stratxcel.in` and `www.stratxcel.in` as assigned domains. Only one can actually be verified/serving at a time in Vercel; which one is live was not determined from MCP data alone.

- **Why it matters:** any DNS or project-level change made without first confirming which project is truly live risks taking `stratxcel.in` down, or editing the wrong project's env vars/domains under the mistaken belief they're inert.
- **Mitigation:** owner (or a live HTTP check) confirms which project is authoritative before either project is touched. No changes made to either project in this pass.

## R3 — `app.stratxcel.in` runs 2-month-stale code holding the only Razorpay/WhatsApp/CRM logic (High)

Per [SYSTEM_INVENTORY.md](SYSTEM_INVENTORY.md), this is live, unmaintained, and load-bearing for payments and customer conversations.

- **Why it matters:** it is both the thing we must not break, and the thing that's hardest to change safely because nobody has been actively maintaining it.
- **Mitigation:** per the agreed migration sequence, this deployment is left completely unchanged until the migrated functionality in the canonical repo reaches verified parity and passes shadow testing. Tracked, not touched.

## R4 — Real, separate LIVE Razorpay keys already exist in the codebase (High, financial)

`RAZORPAY_LIVE_KEY_ID` / `RAZORPAY_LIVE_KEY_SECRET` / `RAZORPAY_LIVE_WEBHOOK_SECRET` env vars are referenced meaning this is a system processing real money today.

- **Why it matters:** any code path that could plausibly touch the live Razorpay keys must be treated as production-financial code, not a scaffold. No live payment flow should be exercised, tested, or refactored without explicit sign-off, per the approved migration sequence's rule 6 (test-mode only) and rule 8 (explicit approval before cutover).
- **Mitigation:** all migration/testing work against Razorpay uses the existing `RAZORPAY_TEST_KEY_ID`/`RAZORPAY_TEST_KEY_SECRET` pair exclusively until explicit go-ahead.

## R5 — Supabase MCP connector cannot see the actual StratExcel or ai-automation-system databases (Medium)

Only Jan Darpan's project is visible to the connected account. See [SUPABASE_DATA_AND_RLS_MAP.md](SUPABASE_DATA_AND_RLS_MAP.md).

- **Why it matters:** RLS policies, table shapes, and current data volumes for the two databases that actually matter to this migration cannot be verified live; work must proceed from migration-file history alone, which can drift from what's actually deployed.
- **Mitigation:** treat migration files as the source of truth for schema intent, but do not assume they've all been applied to the live database without CLI-based verification (`supabase migration list` against a correctly authenticated project) before relying on any specific table existing.

## R6 — `ai-automation-system`'s own Supabase migration history is likely a third, unidentified project (Medium)

Its `backend/supabase/migrations/` predates and uses a different naming convention than `stratxcel-automation-platform`'s, suggesting it is not the same project as either `uccqlgeghkwzujeeymua` or `giiuqshoconjbpiueasp`.

- **Mitigation:** identify this project's ref before writing any migration that assumes shared schema between the two codebases' data layers.

## R7 — Two separate Razorpay webhook routes exist for the same monorepo (`apps/ai-os` and `apps/stratxcel-os`) (Medium)

Unclear which is actually registered with Razorpay as the live webhook target, or whether both are.

- **Mitigation:** confirm via Razorpay dashboard (webhook settings) which URL is currently registered before assuming either route is dead code.

## R8 — Local working tree had unrelated in-flight work at engagement start (Low, contained)

`stratxcel-automation-platform`'s original working directory had uncommitted YouTube-privacy and Social Autopilot changes at the start of this engagement.

- **Mitigation:** left untouched; all this engagement's work happens in an isolated worktree/branch (`worktree-stratxcel-ai-build`) branched from `origin/main`, per your instruction. No stash, reset, or commit was applied to the original working directory.
