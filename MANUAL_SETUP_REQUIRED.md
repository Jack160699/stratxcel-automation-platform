# Manual Setup Required

Every item below genuinely needs owner access, a dashboard login, OTP/consent, KYC, or a business decision — nothing here was skipped because it was inconvenient to build. Code readiness is stated for each so you know exactly what's already done versus what still needs building once the manual step is complete.

No secret values are included anywhere in this document — only variable names, dashboard locations, and formats.

**🔴 M14 is high priority and currently affecting real production behavior — see below.**

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

### M8 — Install Docker and run a real Hermes Agent instance — ✅ ENGINE IDENTIFIED (2026-08-09)
- **Status update:** The upstream engine is now identified and verified: [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent), official image `nousresearch/hermes-agent`, run via `gateway run` / `API_SERVER_ENABLED=true`. `infrastructure/hermes/docker-compose.yml` and its README now target this real image instead of a generic placeholder. Still not run — Docker remains unavailable in this session's environment.
- **Priority:** Low (development convenience only — `MockHermesAdapter` works without this)
- **System:** Local development machine, or the separate host from M11 for production
- **Why manual:** Docker is not installed in this session's environment (`docker --version` → command not found, verified before writing `infrastructure/hermes/`).
- **Steps:**
  1. Install Docker Desktop (or Docker Engine + Compose).
  2. Complete M9 (provider account) first — the container needs a model to call.
  3. Follow `infrastructure/hermes/README.md`.
  4. **Before trusting it for real:** confirm the two BEST-EFFORT items `HERMES_SKILLS_AND_TOOLS.md` calls out (the exact `POST /v1/runs` request body schema and the `GET /v1/runs/{id}` status vocabulary) against the actual running instance, and correct `hermes-agent-client.ts`/`http-adapter.ts` if they differ from what this session could verify from docs alone.
- **Verify success:** `curl http://localhost:8642/health` returns `{"status":"ok"}`; a real `POST /v1/runs` call reaches a terminal status this adapter correctly maps.
- **Impact if skipped:** No functional loss — `HERMES_MODE=mock` (or the default `disabled`) works without Docker. `HERMES_MODE=http` (a real Hermes instance) requires this.
- **Code readiness:** Done — `HermesHttpAdapter`, `hermes-agent-client.ts`, `docker-compose.yml`, all four `scripts/hermes-*` scripts, `packages/hermes/src/__tests__/http-adapter.test.ts`.

### M9 — Choose and activate an inference provider, then generate/rename signing secrets
- **Priority:** High (blocks anything beyond `disabled`/pure-unit-test mode)
- **System:** An inference provider account (recommended: [OpenRouter](https://openrouter.ai)) + wherever each service is hosted (Vercel for the dashboard app; TBD for the standalone workers — see M11)
- **Why manual:** Choosing and paying for a model provider is a business decision this session was explicitly told to stop at, not a code gap — see `HERMES_SKILLS_AND_TOOLS.md`'s provider section for the comparison already done.
- **Steps:**
  1. Create an OpenRouter account (or your preferred alternative — Google Gemini direct, Anthropic direct) and generate an API key. Do not activate a subscription-tier provider (Nous Portal, Claude Max, Copilot) unless you specifically want that billing model.
  2. Set that key as an environment variable **on the Hermes Agent host only** (e.g. `OPENROUTER_API_KEY`) — it never touches StratExcel code or this repo's own env vars.
  3. Generate each of the following with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and set as env vars wherever the relevant service runs, a different value for each: `HERMES_GATEWAY_SECRET` (mission-token signing, used by dashboard + `apps/hermes-gateway`), `HERMES_API_KEY` (bearer token both Hermes Agent's `API_SERVER_KEY` and mission-worker's `HERMES_MODE=http` config must share — **renamed from `HERMES_SHARED_SECRET`**, which described an HMAC-signing scheme for a contract that turned out not to exist upstream; the real server only checks a static bearer token), `BYOK_VAULT_ENCRYPTION_KEY` (32-byte hex, for `@stratxcel/byok`'s dev vault), `DRIVE_OAUTH_STATE_SECRET` (see M7).
  4. Set `STRATXCEL_TOOL_GATEWAY_URL` to wherever `apps/hermes-gateway` is reachable from the Hermes host (private/VPC address, not public).
- **Verify success:** `packages/hermes/src/__tests__/token.test.ts` and `packages/hermes/src/__tests__/http-adapter.test.ts` already pass locally using session-scoped test values — this step is about setting *real* values in each deployment's environment, not testing the code. `adapter.healthCheck()` returns `healthy: true` against the real instance once M8 is also done.
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

### M11 — Decide where apps/whatsapp-worker, apps/mission-worker, and apps/hermes-gateway actually run — apps/*-worker/-gateway: ✅ RESOLVED (deployed to the AWS host below); Hermes Agent runtime itself: still open
- **Status update (2026-08-09):** `apps/mission-worker` and `apps/hermes-gateway` are already deployed and healthy on EC2 `i-0067f6c0dfd60cc46` (`ap-south-1`, `t3.small`, ~2 GiB RAM, 20 GiB disk), alongside `stratxcel-whatsapp-webhook` and `stratxcel-whatsapp-processor`. What's still open is **where the Hermes Agent runtime itself runs** — a different question, addressed below.
- **Priority:** Medium (a real infrastructure/cost decision, not a code gap)
- **System:** AWS (existing account/region)
- **Why manual:** Adding a new always-on process has a cost/capacity implication you should approve before it's provisioned, per "do not resize AWS or create paid infrastructure without explicit approval."
- **Evidence checked this session (read-only, nothing changed):** `i-0067f6c0dfd60cc46`'s CPU utilization over the last 24h averages 0.3–2.5% (a couple of short bursts to ~33% max) — plenty of CPU headroom. Its EBS volume is 20 GiB total. No CloudWatch agent is installed, so real memory usage isn't directly observable, but the host already runs **four** persistent Node processes on ~2 GiB total RAM. Hermes Agent's own documented minimum is **2 GB RAM / 10 GB disk just for itself** (API-based-inference use case, which is what StratExcel would run — no local model), with 4 GB called "more comfortable" for daily use.
- **Recommendation: a separate small host for the Hermes Agent container**, not the shared t3.small. Adding a process that alone wants as much RAM as the whole existing box currently has, onto a box with no memory headroom visibility and an explicit "do not disturb the production WhatsApp services" constraint, is not a safe bet on CPU idle-time alone. `apps/hermes-gateway` (StratExcel's own thin tool boundary) stays exactly where it already is — it's small, already deployed, and is the trusted enforcement point regardless of where the heavier engine runs.
- **Steps (once approved):**
  1. Provision a small instance in the same region (`ap-south-1`, for latency) — a `t3.small`/2 GiB burstable instance matches Hermes Agent's own documented minimum with a little headroom.
  2. Place it on the same VPC/private network as `i-0067f6c0dfd60cc46`, or reachable only via a security-group rule scoped to that instance's private IP (or a VPN/Tailscale link) — never a public listener. `docker-compose.yml`'s `127.0.0.1` binding assumes localhost; adjust to the private interface if the two hosts are separate.
  3. Point `apps/mission-worker`'s `HERMES_GATEWAY_URL` at that host's private address.
  4. Complete M8/M9 on that host.
- **Verify success:** `scripts/hermes-health`-style checks against the new host's `/health` endpoint from the existing t3.small, over the private link only (a check from the public internet should fail/time out).
- **Impact if skipped:** `HERMES_MODE` stays `disabled`/`mock` — no functional loss, just no real Hermes execution.
- **Code readiness:** `apps/mission-worker`/`apps/hermes-gateway` deployment: done (already live). Hermes Agent runtime deployment: no Dockerfile/platform config needed beyond `infrastructure/hermes/docker-compose.yml`, since the target is "run the official `nousresearch/hermes-agent` image" rather than something to build.

---

## New this session (Search Growth Engine build)

### M14 — ✅ DONE (2026-08-31) — Apply 4 missing search-growth database migrations to production
- **Status:** Applied this session via Supabase MCP `apply_migration`, with explicit owner confirmation before the write. Verified directly against the live database afterward, not assumed: `list_tables` shows all 7 tables (`search_cms_connections`, `search_strategy_states`, `search_ai_visibility_snapshots`, `search_external_sources`, `search_entity_nodes`, `search_action_baselines`, `search_action_experiments`) present with RLS enabled; `get_advisors` (security) shows zero findings against any of them; a direct `select tenant_id from search_strategy_states limit 1` — the exact query `app/api/platform/search/health/route.ts`'s new real check performs — succeeds with no error, confirming the DATABASE health category now genuinely evaluates to `PASS` rather than the disproven hardcoded claim it used to make.
- **Original text below, kept for history:**
- **Priority:** 🔴 High — this is not a "nice to have," it's actively causing wrong behavior in production right now.
- **System:** Supabase (project `uccqlgeghkwzujeeymua`, ref matches every other item in this file)
- **Why manual:** Verified directly against the real production database (Supabase `list_migrations` + `list_tables`, not inferred) — 4 real, already-written, already-reviewed local migration files were never applied: `supabase/migrations/20260820050000_search_action_execution_and_cms.sql`, `20260820060000_search_growth_loop_and_aeo.sql`, `20260820070000_search_external_authority_and_reputation.sql`, `20260820080000_search_action_outcomes_and_experiments.sql`. All four are additive (`CREATE TABLE IF NOT EXISTS`, no destructive statements) but applying any schema change to the real production database is exactly the class of action this session has consistently held for explicit owner confirmation, same as a production deploy — not something to run unprompted.
- **Real, confirmed impact while unapplied** (see `docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md`'s Update 6 for full detail — code-level mitigations for both are already shipped this session, but the migrations are the actual fix):
  1. The real, live, **paid** action-execution route was silently falling back to a hardcoded placeholder site URL and reporting success for real customers — mitigated (now fails closed with an honest error) but customers still can't actually execute paid actions until `search_cms_connections` exists.
  2. The real, live daily cron has been running the full expensive AI/crawl/SERP growth cycle **every day instead of every 3 days** for every paid tenant, because the "have we run recently" lookup against the missing `search_strategy_states` table silently returns nothing — mitigated (now skips safely on the lookup error instead of defaulting to "always due") but the continuous-growth loop cannot actually persist strategy state or run on its intended cadence until the table exists.
- **Where:** Supabase Dashboard → project `stratxcel` → SQL Editor, or `supabase db push --linked` from a machine with the Supabase CLI linked to this project.
- **Steps:**
  1. Review the 4 migration files (all additive, already reviewed this session).
  2. Apply them to `uccqlgeghkwzujeeymua` only.
  3. Verify via `supabase migration list --linked` (all 4 should show as applied on both sides) or by re-running this session's own check: `GET /api/platform/search/health` should report `DATABASE: PASS`, not `FAIL`.
- **Verify success:** `certifyProductionReadiness()`/`runGoLiveSystemHealthCheck()` (both already fixed this session to check real state) report the tables present; a real paid customer can connect a CMS and execute an action against their real site; the scheduler's per-tenant cadence log shows `NOT_DUE` results between growth cycles instead of `COMPLETED` every day.
- **Impact if skipped:** Paid action execution stays effectively unusable (fails closed now, rather than silently wrong — but still unusable) and the growth-loop scheduler keeps running at 1-day cadence instead of 3-day, which is a real, ongoing cost/rate concern for every real AI/SERP provider call it makes each day it runs unnecessarily.
- **Code readiness:** Done — the code-level defensive fixes are shipped and tested this session; applying the migrations is the only remaining step, and it alone is what unlocks the actual features (customers connecting a real CMS, the loop persisting real strategy state).

### M12 — Vercel API/OAuth credentials for the website connector
- **Priority:** Medium
- **System:** Vercel dashboard (Account/Team Settings → Tokens, or Integrations for an OAuth app)
- **Why manual:** Verified directly this session — `.env.local`/`.env.production.local` contain `VERCEL_OIDC_TOKEN` (a build-time deployment-context token) but no `VERCEL_API_TOKEN`/OAuth client credentials. A real "connect → authorize → persist → verify → use" Vercel connector (brief Sections 7-9) cannot reach the real Vercel REST API for project/domain/deployment discovery without one.
- **Where:** Vercel Dashboard → Settings → Tokens (personal/team access token) — or Integrations Console if building a real OAuth app for multi-customer use.
- **Steps:**
  1. Decide: a single scoped access token (fastest path to proving the connector against StratXcel's own real Vercel project) vs. a full OAuth integration (required before any *other* customer can connect their own Vercel account).
  2. Generate the token/OAuth client, set `VERCEL_API_TOKEN` (or `VERCEL_CLIENT_ID`/`VERCEL_CLIENT_SECRET`) as an env var.
- **Verify success:** A real call to `GET https://api.vercel.com/v9/projects` with the token returns StratXcel's real project list.
- **Impact if skipped:** The Vercel connector stays adapter-only (no live discovery/deployment) — website SEO/AEO/GEO actions can still be computed (proven this session against the real production site) but not authorized-deployed through a generic connector; StratXcel's own site can still be fixed directly via this repo + existing deploy pipeline.
- **Code readiness:** Not yet built — real, non-fabricated actions are computed (`lib/growth/search-growth-director.ts`); the connector adapter itself is next.

### M13 — ~~Google Search Console + Google Business Profile API OAuth credentials~~ RETRACTED — already real and configured in production
- **Correction (same session):** This item was written after checking only `.env.local` (the dev env file). Re-checked against `.env.production.local` and it's wrong: `GOOGLE_SEARCH_OAUTH_CLIENT_ID`/`_SECRET`, `SEARCH_GOOGLE_OAUTH_STATE_SECRET`, `GOOGLE_BUSINESS_CLIENT_ID`/`_SECRET`, and `SEARCH_DISCOVERY_SCHEDULER_ENABLED`/`_SECRET` are all **already set in production**. There is a real, wired, tested Search Console + GA4 OAuth flow live at `app/api/platform/search/google/{connect,callback,disconnect,config,resources}/route.ts`, backed by a 12,000+-line real package (`packages/search-discovery`, exported via `@stratxcel/search-discovery`) — see `docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md`'s correction section for what that package actually contains. Leaving this struck through rather than deleted, per this file's own convention of not hiding a wrong claim once made.
- **Genuinely still true:** these production credentials are not mirrored into `.env.local`, so a real OAuth round-trip cannot be exercised from local dev without copying them (a `vercel env pull` or manual copy) — that's a real, minor, low-priority dev-environment gap, not a missing-credential blocker.

---

## Explicitly NOT done tonight (by your instruction, not a gap)

- No real payment was made, no live Razorpay webhook was registered or changed.
- No real WhatsApp message was sent.
- No real social content was published.
- No OAuth login (Google Drive) was completed.
- No production domain, DNS, or Vercel alias was changed.
- No credential was rotated or revealed.
- No migration was applied to any database, production or otherwise.
