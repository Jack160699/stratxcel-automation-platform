# Live System Map

Snapshot as of 2026-08-03, this session. Nothing in Phase 1's discovery (`docs/discovery/SYSTEM_INVENTORY.md`) changed — no production system, domain, or Vercel alias was touched. This document adds what exists as of tonight's build.

## Repository state

- **Canonical repo:** `Jack160699/stratxcel-automation-platform`
- **Working branch:** `worktree-stratxcel-ai-build` — isolated, pushed to `origin`, never merged to `main`
- **Commits this session:** 10 checkpoints (Phase 2 foundation → Phase 6 Hermes/BYOK/storage/UI), each independently typechecked, linted, tested, and built before commit

## What's live vs. what's only code

| Component | Live? | Where |
|---|---|---|
| `stratxcel.in` / `www.stratxcel.in` production site | Yes | Vercel project `stratxcel` or `stratxcel-site` (ambiguous — see `MANUAL_SETUP_REQUIRED.md` M1), unchanged |
| `app.stratxcel.in` (legacy WhatsApp/Razorpay/CRM system) | Yes, per Phase 1 | Vercel project `ai-os-ai-os`, `ai-automation-system` repo — untouched |
| Preview of this branch | Yes | `https://stratxcel-git-worktree-stratxcel-ai-build-jack160699s-projects.vercel.app` — 6 successful preview builds this session, target `null` (never production) |
| `/admin/platform/*` dashboard pages | Yes, in the preview above | Tenant bootstrap, missions, approvals, wallet, queue, WhatsApp phone bindings/shadow messages |
| `apps/whatsapp-worker` | No | Code complete, not deployed anywhere (see M11) |
| `apps/mission-worker` | No | Code complete, not deployed anywhere (see M11) |
| `apps/hermes-gateway` | No | Code complete, not deployed anywhere (see M11) |
| A real Hermes instance | No | Docker unavailable this session; `MockHermesAdapter`/`DisabledHermesAdapter` are the only adapters actually exercised |
| Database migrations (9 new files) | Not applied | No Supabase project reachable this session (see M10) |

## Supabase

Unchanged from Phase 1: the connected MCP account sees only `newspaper-motion` (Jan Darpan, `giiuqshoconjbpiueasp`) — never queried further, per the non-negotiable rule not to touch it. The real StratExcel project (`uccqlgeghkwzujeeymua`) remains unreachable from this session; all 9 new migrations exist only as files.

## Domains / callbacks touched

None. Every new callback path (`/api/platform/storage/drive/callback`, `apps/whatsapp-worker`'s `/webhook`, `apps/hermes-gateway`'s `/tools/:toolName`) exists in code but has not been registered with any external provider (Meta, Google) — that registration is itself a manual step (see `MANUAL_SETUP_REQUIRED.md`).
