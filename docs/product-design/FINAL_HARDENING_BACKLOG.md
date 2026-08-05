# Final Hardening Backlog

Deferred issues from the client-module completion pass (branch
`feat/stratxcel-core-product-experience`). Nothing here was fixed in this
pass by explicit instruction — this session built out the remaining
client-facing product modules over the existing onboarding, mission,
approval, and RBAC foundation, and preserved onboarding as-is. Each item
below is classified so a later pass can triage without re-deriving context.

Classification legend:
- **Blocker** — must be fixed before Production traffic relies on this path.
- **Limitation** — a real, honest current constraint; safe to ship as-is with the disclosed UI state already in place.
- **Optional** — worth doing, not required for correctness or safety.

## Onboarding & tenant creation

1. **Atomic tenant + owner creation** — Blocker. `createTenant()` (`lib/tenants/repository.ts`) inserts the `tenants` row and the owner's `tenant_members` row as two separate statements, not one transaction. If the second insert fails, the result is an orphaned tenant with no owner — nobody can ever reach it through normal membership resolution. Needs a Postgres function (`security definer`, single transaction) or an RPC wrapping both inserts.
2. **Onboarding partial-persistence recovery** — Blocker. `app/api/platform/onboarding/route.ts` has no documented behavior for a client that abandons the wizard mid-flow after some but not all steps persisted. Needs an explicit resumable/idempotent design, not a UI-level workaround.
3. **Onboarding retry idempotency** — Blocker. Retrying a failed onboarding submission has no idempotency key today (unlike mission creation's `idempotencyKey` pattern in `createAndEstimateMission`) — a network retry could plausibly double-submit. Needs the same idempotency-key treatment onboarding's own flow doesn't yet have.

## Data model gaps

4. **Authoritative goals model** — Limitation. There is no structured "business goals" entity; Brand Brain's free-form `pillars`/`rules` arrays are the closest proxy. Reports and Copilot both degrade honestly (no fabricated goal-tracking UI was built) but a real goals model is still absent.
5. **Subscription/plan schema** — Limitation. Billing (`/app/billing`) already discloses this: wallet balance is real, plan/invoicing has zero backend. No schema exists for plan tier, seats, or renewal state.
6. **Tenant-profile fields** — Limitation. `tenants` only has `slug`/`name`, and there is no PATCH route for either post-creation. `/app/settings`'s Business Profile tab keeps `website`/`location`/`description` as explicitly-labeled unsaved local drafts for exactly this reason — do not wire them to a fake save until the schema and a PATCH route exist.
7. **Team invitation model** — Limitation. `inviteMember()` (`lib/tenants/repository.ts`) inserts a `tenant_members` row directly and requires an already-existing Supabase user ID — there is no invitations table (token, expiry, pending state) and no email-invite-link flow. `/app/team`'s invite form stays disabled with this reason surfaced verbatim.
8. **Artifact/file schema gaps** — Limitation. `storage_file_references` has no first-class `mission_id` column — the new Files/Copilot/Website/Ads "source mission" references fall back to `metadata.missionId`, which is not enforced or guaranteed present. No upload endpoint exists at all (`app/api/platform/artifacts/route.ts` is read-only); uploading requires a connected provider, which this phase does not activate.
9. **Settings persistence gaps** — Limitation. Workspace preferences (timezone/language/working hours/approval preference) and notification toggles have no backing table — both tabs in `/app/settings` are explicitly labeled as unsaved local drafts.
10. **CRM lead creation from the client UI** — Optional. `/app/crm` only reads and updates status on leads created by other flows (WhatsApp shadow ingestion, manual/import) — there's no "add lead manually" form. `createLead()` already exists in `@stratxcel/leads-and-crm` if this is wanted later.

## Cross-cutting

11. **Tenant-scoped Social migration** — Limitation, tracked pre-existing (`CURRENT_TO_FINAL_MIGRATION_PLAN.md §3a`). Social Autopilot's content/inbox/campaign tables remain `owner_id`-scoped behind `stratxcel_admins` RLS. `/app/content/*` and the new `/app/conversations` correctly show `StaffScopedNotice` rather than attempting to read this data — do not "fix" this by weakening RLS or adding a service-role bridge without a real schema decision.
12. **Reports usage/cost history** — Limitation. `/api/platform/wallet` only returns the current balance; there is no ledger/transaction-history endpoint, so `/app/reports`'s "Spend over range" tile is `MetricUnavailable` rather than a fabricated number. `@stratxcel/payments-and-wallet`'s ledger table already has the rows a history endpoint would need.
13. **Conversations unread/read-state tracking** — Optional. `whatsapp_shadow_messages` has no read/unread column, so `/app/conversations` shows every conversation rather than an unread-filtered view, with an explicit note that read state isn't tracked.
14. **Team member email lookups are N+1** — Optional. `app/api/platform/team/route.ts` calls `auth.admin.getUserById` once per member rather than a batched lookup. Fine at current team sizes; would need a real batch call (or a cached profiles table) before it matters.
15. **Single-record GET routes** — Optional. Mission detail, lead detail, and artifact detail all reuse their tenant-scoped list endpoint and filter client-side (the pre-existing convention `/app/missions/[missionId]` established) rather than adding `/api/platform/{missions,leads,artifacts}/[id]` routes. Fine while list sizes stay small (`limit`-bounded); worth revisiting if any of these lists grow large enough that fetching the whole list per detail view becomes wasteful.

## Security & rollout

16. **Final security penetration checks** — Blocker before Production. This pass added three new read routes (`/api/platform/leads`, `/api/platform/artifacts`, `/api/platform/conversations`) and one write route (`/api/platform/leads/[leadId]` PATCH), all gated by `requireTenantContext` with tenant-membership re-verification on every call, matching the existing pattern. They have not had a dedicated penetration/fuzz pass — that's still owed before Production traffic depends on them.
17. **Production rollout checklist** — Blocker before Production, out of scope for this session by explicit instruction (no migrations applied, no Production deploy, no integrations activated, Hermes/AWS/EC2 untouched).

## Explicitly not touched this session

- Onboarding transactionality/retry edge cases (see items 1–3 above) — recorded, not fixed, per this session's scope.
- Hermes infrastructure, AWS/EC2, Production environment variables, and integration activation.
