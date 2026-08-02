# System Inventory

Live-state discovery performed 2026-08-03 via GitHub CLI (`gh`, authenticated as `Jack160699`), Vercel MCP tools, and Supabase MCP tools. No secret values were read or recorded. Where a claim could not be verified live, it is marked **UNVERIFIED**.

## GitHub repositories (account: Jack160699)

| Repository | Visibility | Last commit | Notes |
|---|---|---|---|
| `stratxcel-automation-platform` | public | 2026-08-02 | Active development. Next.js marketing site + "Social Autopilot" module (Meta/Threads/YouTube publishing, Copilot agent). This is the repo this working directory is checked out from. |
| `ai-automation-system` | public | 2026-05-28 | **Stale (~2 months)**. Turborepo monorepo. Contains the only working WhatsApp bot, Razorpay integration, and CRM/lead/sales code found anywhere in the account. See [REPOSITORY_CAPABILITY_MATRIX.md](REPOSITORY_CAPABILITY_MATRIX.md). |
| `jandarpan-ai-news-system` (aka `newspaper-motion`) | public | — | **Jan Darpan**. Separate product, separate Supabase project. Out of scope except to avoid damaging it. |
| `job-agent`, `TradePilot-AI`, `nestlink`, `care-cure-spa`, `ascend-theory-community-platform`, `noor-optical` (archived), `grand-dhillon-website` (archived), `honest-asset-management` (archived) | public | — | Unrelated client/portfolio projects. Not touched. |

No repositories named `ai-os`, `ai-os-ai-os`, or `stratxcel-os` exist as separate GitHub repos — those names are **Vercel project names only**; the deployed code for them lives inside `ai-automation-system`'s `apps/` workspace (see below).

## Vercel projects (team: `jack160699's projects`, `team_UWCzHaOLdAOtezWqRxYNxdYf`)

| Project | Domains | Last deployment | Source |
|---|---|---|---|
| `stratxcel` | `stratxcel.in`, `www.stratxcel.in`, `stratxcel.vercel.app` | 2026-08-02 (active) | `stratxcel-automation-platform` |
| `stratxcel-site` | `stratxcel.in`, `www.stratxcel.in`, `stratxcel-site.vercel.app` | 2026-07-24 (stale relative to `stratxcel`) | Same repo family — **duplicate/legacy project claiming the same production domains as `stratxcel`.** Needs explicit resolution (see Risk Register). |
| `ai-os-ai-os` | **`app.stratxcel.in`**, `ai-os-ai-os.vercel.app` | 2026-05-28 | `ai-automation-system` (`apps/ai-os` most likely, unconfirmed which app within the monorepo is actually wired) — **currently live in production on `app.stratxcel.in`**, serving whatever includes the WhatsApp/Razorpay/CRM code, but unmaintained for ~2 months. |
| `ai-os` | `ai-os-wine.vercel.app` (no custom domain) | 2026-05-28 | `ai-automation-system`, not attached to a production domain. |
| `stratxcel-os` | `stratxcel-os.vercel.app` (no custom domain) | 2026-05-16 | `ai-automation-system` `apps/stratxcel-os`, not attached to a production domain. |
| `newspaper-motion` | — | — | Jan Darpan. Not part of this effort. |
| others (`job-agent`, `trade-pilot-ai-web`, `care-cure-spa`, `noor-optical`, `ascend-theory`, `honest-asset-management`, `v0-luxury-hotel-website`, `kairela-platform-completion`) | — | — | Unrelated. |

**Domain `app.stratxcel.in`** — named in the brief as a known lead — is confirmed live and points at `ai-os-ai-os`.

## Supabase

| Project | Ref | Status | Visible to connected MCP account? |
|---|---|---|---|
| `newspaper-motion` (Jan Darpan) | `giiuqshoconjbpiueasp` | ACTIVE_HEALTHY | Yes |
| StratExcel dedicated project | `uccqlgeghkwzujeeymua` | Unknown (not queryable via this MCP session) | **No** — not visible under the connected Supabase org (`glyavnovrqlwlgaojfos`). Linked locally via Supabase CLI (`supabase/.temp/project-ref` in `stratxcel-automation-platform`) and referenced in that repo's `.env.local`. Its migrations exist as files in `stratxcel-automation-platform/supabase/migrations/`. Likely lives under a different Supabase account/org than the one this session's MCP connector is authenticated to. |
| Any Supabase project used by `ai-automation-system` (`backend/supabase/migrations` exists in that repo) | Unknown | Unknown | **No** — not identified among the one visible project. |

**Operational consequence:** any Supabase MCP tool call in this session can only reach the Jan Darpan database. Schema work on the actual StratExcel database must go through file-based migrations + Supabase CLI (already the existing pattern in `stratxcel-automation-platform`), never through the MCP connector, until the correct Supabase org is connected.

## What was NOT found anywhere in the account

- No dedicated LinkedIn app credentials/config beyond a provider adapter file (`lib/social/providers/linkedin.ts` in `stratxcel-automation-platform` — code exists, connection/verification status unconfirmed).
- No YouTube/Google OAuth verification evidence beyond `CLAUDE_YOUTUBE_PRIVACY_HANDOFF.md` (in-progress, uncommitted, in `stratxcel-automation-platform`).
- No Meta App Review evidence document (referenced by `stratxcel-meta-review-evidence.mp4`, present untracked in `stratxcel-automation-platform`, not inspected here — binary, out of scope for text discovery).
