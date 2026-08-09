# Owner Operating Brain — Manual Actions Remaining

Branch: `feat/owner-operating-brain` — built off `origin/main` @ `abd2a58`.
Everything below requires a human action (OAuth consent, a dashboard click,
or entering a secret into a secure UI field). No coding, schema, API, or
UI work is deferred here — see `# MANUAL ACTIONS REMAINING` in the final
chat report for the authoritative, up-to-date list with time estimates.

## 1. Google OAuth client (Gmail, Calendar, Drive)

- **Platform:** Google Cloud Console
- **Screen:** APIs & Services → Credentials → Create OAuth client ID (Web application)
- **Action:** Create a new OAuth 2.0 client (separate from the existing Drive BYOS client), add authorized redirect URI `https://www.stratxcel.in/api/admin/operating-brain/connectors/google/callback`
- **Permission:** none beyond having access to the Google Cloud project
- **Why manual:** creating an OAuth client and enabling the Gmail/Calendar/Drive APIs is an account-owner console action; cannot be done via API without existing credentials
- **Set env vars:** `GOOGLE_OWNER_BRAIN_CLIENT_ID`, `GOOGLE_OWNER_BRAIN_CLIENT_SECRET`, `OWNER_BRAIN_OAUTH_STATE_SECRET` (any random 32+ char string)
- **What becomes active afterward:** the "Connect" buttons for Gmail, Calendar, and Drive in Source Health
- **Estimated time:** 10–15 minutes

## 2. Google OAuth consent (per source)

- **Platform:** Stratxcel Admin → My Operating Brain → Source Health
- **Action:** Click "Connect" next to Gmail / Calendar / Drive, complete the Google consent screen
- **Why manual:** OAuth consent is legally an end-user action, cannot be automated
- **Estimated time:** 1 minute per source, after #1 is done

## 3. Notion internal integration secret

- **Platform:** notion.so/my-integrations
- **Action:** Create an internal integration, share the relevant pages (Shriyansh Chat Operating System, Daily Operating Review) with it, copy the secret
- **Where:** paste into Stratxcel Admin → My Operating Brain → Source Health → Notion → Connect (a secure field, posted directly to the API — never typed into chat)
- **Why manual:** integration creation and page-sharing are account-owner Notion UI actions
- **Estimated time:** 5 minutes

## 4. GitHub fine-grained personal access token

- **Platform:** github.com/settings/personal-access-tokens/new
- **Action:** Create a fine-grained PAT scoped to the relevant repos with **read-only** Contents, Pull requests, Issues permissions
- **Where:** paste into Source Health → GitHub → Connect
- **Why manual:** PAT creation is an account-owner action; least-privilege scoping is a deliberate per-repo choice only the owner should make
- **Estimated time:** 5 minutes

## 5. GEMINI_API_KEY (voice-note transcription)

- **Platform:** Vercel → Project Settings → Environment Variables (or Stratxcel Admin → Integrations, if already configured there for Social Autopilot)
- **Action:** Confirm `GEMINI_API_KEY` is set in production — this feature reuses the same key Social Autopilot's agent already uses
- **Why manual:** if not already set, only the account owner can generate/paste it
- **What becomes active:** voice-note upload + transcription
- **Estimated time:** 2 minutes (likely already done)

## 6. CRON_SECRET

- **Platform:** Vercel → Project Settings → Environment Variables
- **Action:** Confirm `CRON_SECRET` is set (already required by the existing `/api/social/worker` cron) — the 4 new Operating Brain cron routes reuse it
- **Why manual:** secret generation/rotation is an account-owner action
- **Estimated time:** 2 minutes (likely already done)

## 7. `BYOK_VAULT_ENCRYPTION_KEY`

- **Platform:** Vercel → Project Settings → Environment Variables
- **Action:** Confirm it's set (already required by the existing Drive BYOS vault) — every Operating Brain connector's stored secret reuses this same vault
- **Why manual:** key generation/rotation is an account-owner action
- **Estimated time:** 2 minutes (likely already done)

## 8. Desktop companion install (per machine)

- **Platform:** the owner's own Windows PC
- **Action:** `cd apps\owner-brain-companion && npm install && npm run pair`, then `npm start`
- **Why manual:** installing/running software on a personal machine and completing device pairing is inherently a local, physical action
- **Optional:** register auto-start via `shell:startup` (see `apps/owner-brain-companion/README.md`)
- **Estimated time:** 5 minutes

## 9. Hermes-assisted planning (optional, deferred by design — not blocking)

- **Platform:** internal decision, not a dashboard click
- **Action:** designate a real internal "agency ops" tenant_id and set `OWNER_BRAIN_HERMES_TENANT_ID`, then wire `attemptHermesAssistedPlan` to a real mission through the existing `packages/missions` + `packages/hermes` pipeline
- **Why manual/deferred:** the existing Hermes mission pipeline is tenant-scoped end-to-end (signed mission tokens, `packages/missions` compiler); Operating Brain data has no tenant. Bolting a synthetic tenant onto that pipeline without exercising it against the real mission-worker queue risks destabilizing Hermes's production security guarantees — see `lib/owner-brain/hermes/morning-plan-hermes.ts` for the full rationale. The rules-based planner is fully functional without this.
- **Estimated time:** N/A — this is a follow-up engineering decision, not a quick manual click

## 10. Notion canonical page

- **Status:** updated automatically this session via the Notion MCP connection — see the "Build Status — 10 Aug 2026" section appended to *Admin Persona & Decision Brain — voice/chat/computer memory*.
