# Security Model

Everything below was reviewed statically (no live Supabase project was reachable this session — see `docs/discovery/SUPABASE_DATA_AND_RLS_MAP.md`). `npm run test:security` runs the two automated checks referenced throughout; both pass.

## Tenant isolation

Every platform table has row-level security enabled and a `tenant_members`-scoped read policy, checked automatically by `supabase/__tests__/rls-coverage.test.ts` (26 tables, 11 migrations, 3 documented service-role-only exceptions — `vault_secrets`, `razorpay_webhook_events`, `whatsapp_unmatched_events`, each with a stated reason). Every API route under `app/api/platform/*` follows the same two-client split as the pre-existing Social Autopilot code (`lib/social/db-context.ts`): a session-scoped client proves tenant membership + role (RLS grants it `SELECT` only), then a service-role client does the actual read/write — a route can never mutate through the session client, because no `INSERT`/`UPDATE` policy exists for `authenticated` on these tables by design.

**Not yet verified live:** RLS behavior has never been exercised against a real Postgres instance this session. The `get_advisors` Supabase tool should be run against a reachable non-production project before this goes live, per your instruction.

## RBAC

`lib/rbac/policy.ts` is a closed `role -> permission` map (`owner`/`admin`/`operator`/`viewer`), unit-tested (`policy.test.ts`) including: viewers cannot create missions or edit Brand Brain; operators can create missions but cannot decide approvals, top up the wallet, or manage tenant membership (billing/owner-level actions). Every mutating `/api/platform/*` route calls `requirePermission` before touching data.

## Audit

`recordAuditEvent` (`packages/audit`) redacts any metadata key matching `/token|secret|password|key|credential|authorization/i` before writing, regardless of what the caller passes — defense in depth, tested (`log.test.ts`) against `accessToken`, `RAZORPAY_KEY_SECRET`, and `userPassword` keys specifically.

## Queue: worker-only mutation

`queue_jobs`' claim/heartbeat/complete/fail/cancel operations are SQL functions in a `queue_internal` schema PostgREST never routes to, with thin `public`-schema wrappers as the only reachable entry points — every one of those wrappers is `REVOKE`d from `public`/`anon`/`authenticated` and `GRANT`ed only to `service_role`, with a fixed `search_path` (a `SECURITY DEFINER` function without one is a classic privilege-escalation vector). Verified by `packages/queue/src/__tests__/migration-security.test.ts` (also run inside `test:security`), which fails loudly if a future edit drops any of this hardening. No API route exposes queue mutation to a public client — `/api/platform/queue` is read-only.

## Hermes-scoped tokens cannot exceed mission permissions

`packages/hermes/src/token.ts`'s mission tokens are HMAC-signed, carry exactly one mission's `tenantId` and `allowedTools` list, and expire after 15 minutes by default. `isToolAllowed` is checked both by the token's own payload and, redundantly, at `apps/hermes-gateway`'s dispatch layer against a `STRATXCEL_CONTROLLED_TOOLS` constant (`submit_publish_request`, `create_website_change_request` — publishing and deployment stay StratExcel-controlled per the master brief). Tamper-detection is unit-tested: re-encoding a modified `tenantId` under the original signature is rejected (`token.test.ts`).

## Secrets: vault, never returned to the browser

`packages/byok`'s dev vault (AES-256-GCM, tested for tamper/wrong-key rejection in `vault.test.ts`) stores ciphertext in `vault_secrets`, a table with RLS enabled and zero policies — `authenticated` gets nothing even under RLS, only `service_role` (which bypasses RLS) can touch it. No API route in this codebase exposes `retrieve()`; a saved secret cannot come back to the browser after creation, by construction (there's no code path that does it, not just a missing UI button).

## Webhook security

- **WhatsApp:** `X-Hub-Signature-256` HMAC-SHA256 verification, reused/duplicated intentionally from the existing Meta webhook pattern (`lib/social/webhook-signature.ts`), tested in `packages/whatsapp/src/__tests__/webhook.test.ts`.
- **Razorpay:** Its own HMAC-SHA256 scheme (no `sha256=` prefix — a real difference from Meta's convention), tested in `razorpay-webhook.test.ts`, plus replay protection via a unique `provider_event_id` constraint (`razorpay_webhook_events`) — a redelivered/replayed webhook is caught and turned into a typed `DuplicateWebhookEventError` rather than double-processed.

## What is NOT yet true

- No RLS policy has been exercised against a live database — only reviewed as SQL source.
- No cross-tenant integration test (Tenant A reading Tenant B's data over a real HTTP call) has been run — RBAC/RLS were reviewed independently, not proven together end to end.
- `Supabase get_advisors`/security advisor has not run (no reachable project).
