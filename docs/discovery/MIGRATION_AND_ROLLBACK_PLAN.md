# Migration & Rollback Plan

Canonical base: `stratxcel-automation-platform`. Source of business-logic capabilities to migrate: `ai-automation-system` (WhatsApp bot, Razorpay, CRM/leads). This plan implements the sequence approved 2026-08-03.

## Sequence

1. **Inventory and document the live legacy functionality.** ✅ Done — [SYSTEM_INVENTORY.md](SYSTEM_INVENTORY.md), [REPOSITORY_CAPABILITY_MATRIX.md](REPOSITORY_CAPABILITY_MATRIX.md), [OAUTH_WEBHOOK_CALLBACK_MAP.md](OAUTH_WEBHOOK_CALLBACK_MAP.md).
2. **Identify the authoritative implementation of each feature.** Where `ai-automation-system` has duplicate implementations (e.g. two Razorpay webhook routes in `apps/ai-os` vs `apps/stratxcel-os`, WhatsApp webhook logic in both `backend/app/whatsapp/webhook.py` and `backend/routes/webhook.js`), determine which is actually wired to the live domain/webhook registration before porting either — see R7 in [RISK_REGISTER.md](RISK_REGISTER.md). Requires the owner to confirm live webhook URLs registered with Razorpay/Meta (dashboard-only information, not visible via API in this session for security).
3. **Build clean packages/services in `stratxcel-automation-platform`.** Proposed initial package boundaries (subset of the brief's target architecture, additive only — no existing `app/` or `lib/social/` code moved or renamed in this step):
   - `packages/payments-and-wallet/` — Razorpay client, order/checkout, webhook signature verification, ledger primitives — ported from `ai-automation-system`'s `packages/payments`, `apps/ai-os/lib/payments/*`, `backend/app/payments/*`.
   - `services/whatsapp/` — WhatsApp Cloud API client, webhook verification/handling, message send — ported from `backend/app/whatsapp/*`. Given it's currently Python/Flask and the canonical repo is Next.js/TypeScript, this needs an explicit language decision (rewrite in TypeScript vs. keep as a separate Python service called over an internal API) before implementation starts — this is an architecture choice, not a mechanical port, and will be brought back for confirmation once packages 1 and the Brand Brain/mission scaffolding exist to hang it off of.
   - `packages/leads-and-crm/` (or folded into a `sales` module) — from `backend/app/leads/`, `backend/app/sales/`, `apps/stratxcel-os/components/os/inbox-view.tsx`.
4. **Preserve existing Meta, YouTube, Google, LinkedIn, social-provider work.** No changes planned to `lib/social/providers/*`, `app/api/social/*`, or the Copilot runtime as part of this migration; they continue to evolve independently.
5. **Connect migrated modules to tenant/Brand Brain/mission/wallet/approval/audit/human-handoff architecture.** Sequenced after step 3's packages exist and after the platform foundation (tenants, RBAC, audit) is scaffolded — this is Phase 2/3 of the brief's build phases, not yet started.
6. **Test WhatsApp and Razorpay using safe test/shadow methods only.** Razorpay: `RAZORPAY_TEST_KEY_ID`/`RAZORPAY_TEST_KEY_SECRET` exclusively. WhatsApp: Meta's test number / sandbox flow, never `OWNER_WHATSAPP_NUMBERS` or production phone number IDs.
7. **Produce a verified parity report** once steps 3–6 are functionally complete, comparing new implementation behavior against the legacy `ai-automation-system` behavior feature-by-feature.
8. **Explicit approval checkpoint before any live webhook or domain cutover** — Razorpay live webhook URL, WhatsApp production webhook, any DNS/domain change, and the `app.stratxcel.in` → new system switch all require your sign-off, not just passing tests.
9. **Rollback readiness.** Until cutover: `ai-os-ai-os` stays deployed unchanged on `app.stratxcel.in`; the `ai-automation-system` repo stays untouched (only read via a local disposable clone in this session's scratchpad, never pushed to); rollback is simply "don't repoint the domain/webhooks" since nothing live is being modified pre-cutover. Post-cutover rollback plan (repointing DNS back, restoring `ai-os-ai-os` as active deployment, re-registering legacy webhook URLs) will be written as its own dated runbook entry immediately before cutover is proposed, not now, since the exact cutover mechanics depend on decisions not yet made (step 3's WhatsApp language choice in particular).

## What this plan deliberately does not do yet

- Does not move or delete anything in `ai-automation-system`.
- Does not change any Vercel project's domain assignment (resolving the `stratxcel`/`stratxcel-site` conflict, R2, is independent of this migration and is a separate confirmation needed from you).
- Does not create any new Supabase project or apply any migration to a live database.
- Does not touch the `ai-os-ai-os` deployment serving `app.stratxcel.in`.
