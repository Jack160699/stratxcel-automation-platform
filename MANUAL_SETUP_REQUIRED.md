# Manual Setup Required

Every item below genuinely needs owner access, a dashboard login, OTP/consent, KYC, or a business decision — nothing here was skipped because it was inconvenient to build. Code readiness is stated for each so you know exactly what's already done versus what still needs building once the manual step is complete.

No secret values are included anywhere in this document — only variable names, dashboard locations, and formats.

**Status update (2026-08-03, later the same day):** M10 (migrations) is now done — see that item below. The foundation dashboard has been merged to `main` and deployed to production, and a Phase 1 unified-shell/client-switcher change has since shipped on top of it (see `LIVE_SYSTEM_MAP.md`). WhatsApp, Razorpay, Hermes, Google Drive, and BYOK remain exactly as described below — none of that changed. M11 (worker hosting) is still open.

---

## Carried over from Phase 1 (still open)

### M1 — Confirm which Vercel project actually serves stratxcel.in
- **Priority:** High
- **System:** Vercel
- **Why manual:** Both the `stratxcel` and `stratxcel-site` projects list `stratxcel.in`/`www.stratxcel.in` as assigned domains; only one is actually verified/serving, and only the Vercel dashboard shows which.
- **Where:** Vercel dashboard → each project → Settings → Domains
- **Steps:** Open both projects' Domains tabs; whichever shows "Valid Configuration" (not a conflict warning) is live. Note it down.
- **Verify success:** One project shows "Valid Configuration," the other shows a conflict/warning.
- **Impact if skipped:** Any future domain or deploy-target decision risks touching the wrong project.
- **Code readiness:** N/A — this is a discovery step, not a code change.

### M2 — Confirm the WhatsApp bot's VPS is still alive
- **Priority:** High
- **System:** External VPS/EC2 hosting `ai-automation-system`'s Flask WhatsApp bot
- **Why manual:** No tool available to this session can reach or query that server.
- **Where:** Your own SSH/hosting console access
- **Steps:** Confirm the host is up, the bot process is running, and it's still receiving real WhatsApp traffic.
- **Verify success:** A test message to the production WhatsApp number gets a reply from the legacy bot.
- **Impact if skipped:** Cutover planning (Phase 4 shadow → live) can't be scheduled without knowing whether there's an active system to cut over from.
- **Code readiness:** N/A.

### M3 — Confirm which Razorpay webhook route is registered live
- **Priority:** High
- **System:** Razorpay dashboard
- **Where:** Razorpay Dashboard → Settings → Webhooks
- **Why manual:** Two legacy webhook routes exist (`apps/ai-os` and `apps/stratxcel-os` in `ai-automation-system`); only the dashboard shows which URL Razorpay actually calls.
- **Steps:** Note the exact webhook URL and which events it's subscribed to.
- **Verify success:** You have the exact URL and event list written down.
- **Impact if skipped:** Cannot safely decide which legacy route to preserve when cutover is eventually planned.
- **Code readiness:** `@stratxcel/payments-and-wallet`'s webhook signature verification and idempotent event storage are built and tested; wiring to a specific route is intentionally deferred until this is known.

---

## New this session

### M4 — Verify the real WhatsApp phone_number_id and WABA ID, then activate the phone binding
- **Priority:** High
- **System:** Meta Business Manager / WhatsApp Business Platform
- **Why manual:** Only Meta's dashboard shows your verified WABA ID and phone_number_id; guessing or using a placeholder would risk routing real customer messages incorrectly.
- **Where:** Meta Business Manager → WhatsApp Accounts → [your WABA] → Phone Numbers
- **Prerequisites:** An existing, Meta-verified WhatsApp Business number (already in production per Phase 1 discovery).
- **Steps:**
  1. Copy the exact WABA ID and phone_number_id from Meta's dashboard.
  2. In `/admin/platform/whatsapp` (this branch's preview), create a phone binding with those two values.
  3. Once you're ready to test (not before), flip its status from `pending` to `active` and `shadow_mode` off only when you're ready for real send — the code defaults everything to safe/off.
- **Verify success:** The binding shows status `active` and a real test message routes to the correct tenant (visible in the shadow messages list, still not sent).
- **Impact if skipped:** WhatsApp inbound messages have no active binding to route through — they're safely logged as "unmatched" and nothing breaks, but nothing is usable either.
- **Code readiness:** Full CRUD + routing logic built and unit-tested (`packages/whatsapp/src/phone-bindings/`). No UI exists yet for flipping `active`/`shadow_mode` — that's a follow-up.

### M5 — Set WhatsApp Cloud API credentials
- **Priority:** High
- **System:** Meta Developer Console → environment variables (Vercel or wherever `apps/whatsapp-worker` ends up hosted — see M11)
- **Names required (never paste values here):** `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_API_VERSION` (optional, defaults to `v20.0`)
- **Steps:** Copy each value from Meta's developer console into the hosting environment's env var settings.
- **Verify success:** `apps/whatsapp-worker`'s `/webhook` GET verification handshake succeeds when Meta re-verifies the webhook.
- **Impact if skipped:** WhatsApp webhook signature verification fails closed (by design — `verifyWhatsAppWebhookSignature` returns `false` with no secret set), so nothing processes.
- **Code readiness:** Done.

### M6 — Set Razorpay test keys, then eventually confirm live keys
- **Priority:** Medium (test keys first; live keys are a separate, later decision)
- **System:** Razorpay Dashboard → Settings → API Keys / Webhooks
- **Names required:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (or the existing `RAZORPAY_TEST_KEY_ID`/`RAZORPAY_TEST_KEY_SECRET` pair from the legacy system), a webhook secret for `verifyRazorpayWebhookSignature`
- **Steps:** Set test-mode keys first to exercise the shadow/test path; do not set live keys until M3 is resolved and you explicitly approve cutover.
- **Verify success:** A test-mode order/payment-link can be created via `RAZORPAY_INTEGRATION_MODE=shadow` without touching real money.
- **Impact if skipped:** Razorpay adapters stay `disabled` (the safe default) — no functional loss, just no testing possible yet.
- **Code readiness:** Done — full payment state machine, idempotent webhook storage, refunds model.

### M7 — Google Drive OAuth app + consent screen
- **Priority:** Medium
- **System:** Google Cloud Console
- **Why manual:** Requires creating an OAuth 2.0 client, configuring the consent screen, and — per your instruction — no login/consent flow was run tonight.
- **Where:** Google Cloud Console → APIs & Services → Credentials / OAuth consent screen
- **Prerequisites:** A Google Cloud project (may already exist for existing Google/YouTube work per Phase 1's `CLAUDE_YOUTUBE_PRIVACY_HANDOFF.md` — check before creating a new one).
- **Steps:**
  1. Create an OAuth 2.0 Client ID (type: Web application).
  2. Add authorized redirect URI: `https://<your-domain>/api/platform/storage/drive/callback` (exact domain depends on M1).
  3. Set names `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `DRIVE_OAUTH_STATE_SECRET` (generate this last one yourself — see `packages/storage/src/drive/oauth.ts`'s doc comment for the exact command).
  4. Do not complete a real consent flow until you've reviewed the code path (`/api/platform/storage/drive/connect` and `/callback`).
- **Verify success:** Visiting `/api/platform/storage/drive/connect?tenantId=...` while logged in redirects to a real Google consent screen requesting `drive.file` scope only.
- **Impact if skipped:** Drive stays in `disconnected` status — no functional loss, code is ready and waiting.
- **Code readiness:** Full OAuth initiation/callback, token refresh, and Drive API v3 adapter (upload/download/copy/move/list) are built. Untested live.

### M8 — Install Docker and acquire a local Hermes runtime image
- **Priority:** Low (development convenience only — `MockHermesAdapter` works without this)
- **System:** Local development machine
- **Why manual:** Docker is not installed in this session's environment (`docker --version` → command not found, verified before writing `infrastructure/hermes/`).
- **Steps:**
  1. Install Docker Desktop (or Docker Engine + Compose).
  2. Obtain/build a Hermes runtime image (this repo doesn't contain the Hermes engine itself — a separate project).
  3. Follow `infrastructure/hermes/README.md`.
- **Verify success:** `scripts/hermes-health` returns healthy.
- **Impact if skipped:** No functional loss — `HERMES_MODE=mock` (or the default `disabled`) works without Docker. `HERMES_MODE=http` (a real Hermes instance) requires this.
- **Code readiness:** Done — `HermesHttpAdapter`, `docker-compose.yml`, all four `scripts/hermes-*` scripts.

### M9 — Generate and set signing/encryption secrets
- **Priority:** High (blocks anything beyond `disabled`/pure-unit-test mode)
- **System:** Wherever each service is hosted (Vercel for the dashboard app; TBD for the standalone workers — see M11)
- **Names required:** `HERMES_GATEWAY_SECRET` (mission-token signing, used by dashboard + `apps/hermes-gateway`), `HERMES_SHARED_SECRET` (mission-worker ↔ Hermes instance signing, only needed for `HERMES_MODE=http`), `BYOK_VAULT_ENCRYPTION_KEY` (32-byte hex, for `@stratxcel/byok`'s dev vault), `DRIVE_OAUTH_STATE_SECRET` (see M7)
- **Steps:** Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and set as an env var wherever the relevant service runs. Use a different value for each — never reuse one secret across purposes.
- **Verify success:** `packages/hermes/src/__tests__/token.test.ts` and `packages/byok/src/__tests__/vault.test.ts` already pass locally using session-scoped test values — this step is about setting *real* values in each deployment's environment, not testing the code.
- **Impact if skipped:** The relevant feature throws a clear "not set" error rather than silently proceeding insecurely.
- **Code readiness:** Done.

### M10 — Apply the new database migrations to the real StratExcel Supabase project — ✅ DONE (2026-08-03)
- **Status:** Resolved in a later session the same day. All 22 migrations (the 9 referenced below plus corrective RLS/default-privilege hardening migrations added afterward) were applied to `uccqlgeghkwzujeeymua` via `supabase db push --linked` and independently verified via `supabase migration list --linked` (Local↔Remote aligned, all 22 present on both sides) and `supabase db push --linked --dry-run` ("Remote database is up to date").
- **Original text below, kept for history:**
- **Priority:** High
- **System:** Supabase (project `uccqlgeghkwzujeeymua`, per Phase 1 discovery)
- **Why manual:** No Supabase project reachable from this session's MCP connector can safely receive these migrations (see Phase 1's `docs/discovery/SUPABASE_DATA_AND_RLS_MAP.md`) — applying them requires either connecting the correct Supabase account to this session or running the Supabase CLI yourself.
- **Steps:**
  1. `supabase login` (if not already) and confirm the linked project is `uccqlgeghkwzujeeymua`, not Jan Darpan's.
  2. Review the 9 new migration files under `supabase/migrations/2026080*` (all additive — no `DROP`, no destructive `ALTER`).
  3. `supabase db push` (or your team's equivalent apply process) against that project only.
- **Verify success:** `supabase migration list` shows all 9 new migrations applied; `select * from queue_jobs limit 1;` etc. succeed.
- **Impact if skipped:** None of tonight's code can actually read/write real data — every route/worker will error with a clear message rather than silently using the wrong database.
- **Code readiness:** Migrations written, reviewed, and covered by a static security test (`npm run test:security`). Applied and verified in production as of 2026-08-03 (see status above).

### M11 — Decide where apps/whatsapp-worker, apps/mission-worker, and apps/hermes-gateway actually run
- **Priority:** Medium (a real infrastructure/cost decision, not a code gap)
- **System:** Your choice — a VPS, a container platform (Fly.io, Railway, Render), or similar
- **Why manual:** These are long-running Node processes (an HTTP server + poll loops) — Vercel's serverless functions are not a fit for them, and choosing a host has cost implications you should approve first, per "do not create paid hosting."
- **Steps:** Once decided, each app has its own `package.json` with a `start` script; deploy however that platform expects (Dockerfile, buildpack, etc. — none written yet, since the platform isn't chosen).
- **Verify success:** `scripts/hermes-health`-style checks against each service's `/health` endpoint.
- **Impact if skipped:** All three apps run and typecheck correctly locally/in CI but aren't reachable from the internet — WhatsApp webhooks and Hermes execution can't happen for real until this is resolved.
- **Code readiness:** Application code complete; no deployment configuration (Dockerfile, platform-specific config) written yet, since the target platform is undecided.

---

## Explicitly NOT done tonight (by your instruction, not a gap)

- No real payment was made, no live Razorpay webhook was registered or changed.
- No real WhatsApp message was sent.
- No real social content was published.
- No OAuth login (Google Drive) was completed.
- No production domain, DNS, or Vercel alias was changed.
- No credential was rotated or revealed.
- No migration was applied to any database, production or otherwise.
