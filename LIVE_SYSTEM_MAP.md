# Live System Map

**Status update (2026-09-02):** everything below this point, including the 2026-08-03
status update immediately following, is now itself substantially **stale** — roughly a
month of real, further platform development has landed since (none of it captured here):
WhatsApp and Razorpay are now genuinely `live` (not "disabled/undeployed" as stated
below — confirmed this session via `GET /api/health`'s `environment.whatsappMode`/
`razorpayMode`), and real, mature engines now exist that this document predates entirely
and never mentions: `packages/search-discovery` (real SEO/AEO/GEO crawl+analysis+
execution), `packages/websites-and-domains` (a real website creation/editing/deployment
state machine), `packages/workforce-core` (25 real departments, 85 real roles, 30
capability-status keys), `lib/owner-brain` (~50 files of real personal-assistant memory/
decisions/connectors), a full Social Autopilot product with its own separate agent loop,
and a considerably more mature `/admin` information architecture
(`docs/product-design/ADMIN_INFORMATION_ARCHITECTURE.md`) than the "7 of ~30 screens"
described in `FINAL_RELEASE_REPORT.md`.

**Do not treat this file as the current picture.** For an accurate, continuously
maintained account of what the WhatsApp/Admin Copilot Brain can actually do right now,
honestly classified (REAL_EXPOSED/REAL_NOT_EXPOSED/PARTIAL/BROKEN/NOT_BUILT/
EXTERNAL_REQUIRED), see `docs/discovery/WHATSAPP_AI_AGENCY_GAP_AUDIT.md` and the live
`capability_registry` Postgres table (queryable directly, or via the `check_capabilities`
agent tool / the `/admin/capabilities` admin page) — both updated as of this same
session, unlike this file. This addendum follows this file's own existing convention
(see the 2026-08-03 addendum immediately below) of appending a dated status update
rather than rewriting history.

**Status update (2026-08-03, later the same day):** the sections below describing migrations as "not applied" and the branch as "never merged to main" are now **stale** — superseded by the release described here. Left in place as historical record of the pre-release state; do not treat as current.

Since the original snapshot: all 22 migrations were applied to production Supabase (`uccqlgeghkwzujeeymua`) and verified read-only afterward (`supabase migration list --linked` shows Local↔Remote aligned, `db push --dry-run` reports up to date). The foundation dashboard (`/admin/platform/*`) was merged to `main` and deployed to production (`www.stratxcel.in`, `stratxcel.vercel.app`). A follow-up hotfix closed an RSC information-disclosure gap where `/admin/platform`'s overview page embedded integration-status data in the response payload for unauthenticated visitors even though the visible page correctly showed a login screen — both the page-level and layout-level guards are now in place and verified against production. Phase 1 (this document's latest addition) replaces the raw-tenant-ID/localStorage workflow with a unified Command Center and a real client switcher; see the Phase 1 section below.

Integrations (WhatsApp, Razorpay, Hermes, Google Drive, BYOK) and the three standalone worker apps remain disabled/undeployed — none of that changed in this release or in Phase 1.

## Original snapshot (2026-08-03, first session — historical)

Nothing in Phase 1's discovery (`docs/discovery/SYSTEM_INVENTORY.md`) changed — no production system, domain, or Vercel alias was touched. This document adds what exists as of tonight's build.

## Repository state

- **Canonical repo:** `Jack160699/stratxcel-automation-platform`
- **Working branch (superseded):** `worktree-stratxcel-ai-build` — has since been merged to `main` and deployed to production (see status update above)
- **Commits this session:** 10 checkpoints (Phase 2 foundation → Phase 6 Hermes/BYOK/storage/UI), each independently typechecked, linted, tested, and built before commit

## What's live vs. what's only code (original snapshot — see status update above for current state)

| Component | Live? | Where |
|---|---|---|
| `stratxcel.in` / `www.stratxcel.in` production site | Yes | Vercel project `stratxcel`, unchanged |
| `app.stratxcel.in` (legacy WhatsApp/Razorpay/CRM system) | Yes, per Phase 1 | Vercel project `ai-os-ai-os`, `ai-automation-system` repo — untouched |
| Preview of this branch | Yes | `https://stratxcel-git-worktree-stratxcel-ai-build-jack160699s-projects.vercel.app` — 6 successful preview builds this session, target `null` (never production) |
| `/admin/platform/*` dashboard pages | Now live in production (see status update) | Tenant bootstrap, missions, approvals, wallet, queue, WhatsApp phone bindings/shadow messages |
| `apps/whatsapp-worker` | No | Code complete, not deployed anywhere (see M11) |
| `apps/mission-worker` | No | Code complete, not deployed anywhere (see M11) |
| `apps/hermes-gateway` | No | Code complete, not deployed anywhere (see M11) |
| A real Hermes instance | No | Docker unavailable this session; `MockHermesAdapter`/`DisabledHermesAdapter` are the only adapters actually exercised |
| Database migrations (22 files, all now applied — see status update) | Applied to production | `supabase db push --linked` succeeded; verified via read-only `migration list`/`dry-run` |

## Supabase

All 22 migrations are applied to the real StratExcel project (`uccqlgeghkwzujeeymua`) and verified via `supabase migration list --linked` (Local↔Remote aligned) and `supabase db push --linked --dry-run` (reports up to date). No migration, repair, or pull has been run beyond that single applied `db push`.

## Domains / callbacks touched

None beyond the production deploy described in the status update above. Every new callback path (`/api/platform/storage/drive/callback`, `apps/whatsapp-worker`'s `/webhook`, `apps/hermes-gateway`'s `/tools/:toolName`) exists in code but has not been registered with any external provider (Meta, Google) — that registration is itself a manual step (see `MANUAL_SETUP_REQUIRED.md`).

## Phase 1 — Unified Command Center & tenant UX (this change)

- `/admin` is now the unified Command Center (previously the contact inbox); the contact inbox moved to `/admin/inbox` with identical functionality.
- A real client switcher (`app/admin/(shell)/ClientSwitcher.tsx`) replaced the raw tenant-ID `localStorage` hack (`TenantIdBar`/`useTenantId`, both deleted). Selection persists via an httpOnly cookie, re-verified against real membership on every read.
- First-run onboarding: an owner with zero tenant memberships sees a create-client form directly on `/admin` instead of an empty dashboard.
- `/admin/platform/*` URLs are unchanged (route groups keep the same public paths); pages now read the active client from shared context instead of a pasted ID.
- `/admin/social` was not touched — still its own independent shell, guards, and data model, now reachable from the unified nav.
- Nothing here activates WhatsApp, Razorpay, Hermes, Drive, BYOK, or any standalone worker.
