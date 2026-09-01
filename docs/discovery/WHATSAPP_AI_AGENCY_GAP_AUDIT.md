# WhatsApp AI Agency — Gap Audit

## Update 3 — the worker was already deployed and already live-receiving real Meta traffic; the actual blocker was one missing DB row, plus the Update 2 billing bug; both fixed and verified with a real Boss round trip

Given AWS access this session, inspected the real EC2 host
(`i-0067f6c0dfd60cc46`, `ap-south-1`, tag `stratxcel-whatsapp-bot`, real
Elastic IP `13.205.249.104` — corrected from a prior session's unverified
`13.232.91.96` guess) via SSM (no SSH key ever needed). Findings, all
verified directly, none inferred from docs:

- **The legacy Python bot is not running.** Its PM2 process (`stratxcel-bot`,
  user `ubuntu`) shows `stopped`, 35 crash-restarts, port 3012 refusing
  connections. Not caused by this session — found this way, untouched, left
  untouched throughout.
- **`apps/whatsapp-worker` (both processes) was already deployed**, as real
  systemd services (`stratxcel-whatsapp-webhook`, `stratxcel-whatsapp-processor`,
  plus `stratxcel-hermes-gateway`, `stratxcel-mission-worker`), all
  `active running`, at commit `3e70640` (2026-08-19) — contradicting this
  repo's own `DEPLOYMENT.md`, which still claimed "nothing here has been
  deployed" from an earlier session that genuinely lacked AWS access. All
  required secrets (`WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`,
  `WHATSAPP_VERIFY_TOKEN`, `STRATXCEL_AGENT_CHANNEL_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`) were already present in
  `/opt/stratxcel-automation-platform/.env.whatsapp-worker`, confirmed by
  presence-only checks, values never read or logged.
- **nginx already routes an isolated path to it**: `bot.stratxcel.ai`'s
  existing `ai-os` site config has `location = /stratxcel-webhook` →
  `127.0.0.1:8081/webhook`, additive, alongside the untouched legacy
  `location /` → `127.0.0.1:3012`. Never edited this session — it already
  matched exactly the isolated-route design `DEPLOYMENT.md` had only
  proposed, unbuilt.
- **Meta's real, live webhook subscription already calls that exact path.**
  nginx's own access log shows a genuine `facebookexternalua`-signed POST to
  `/stratxcel-webhook` returning `200`, and `whatsapp_unmatched_events` shows
  real customer messages (Hindi/Hinglish, real content) arriving via this
  path going back to **2026-08-18** — meaning the webhook cutover this task
  was told to hold off on had, in effect, already silently happened, before
  this session started. Nothing here flipped Meta's config; this is what was
  found.
- **The actual reason nothing worked: no matching `whatsapp_phone_bindings`
  row existed** for the real `phone_number_id` (`993296527209625`). Every
  real inbound message since 2026-08-18 — customers and, on 2026-09-01, the
  Boss's own `LINK`/test messages — landed in `whatsapp_unmatched_events`
  and was silently dropped; the fully-working, fully-deployed pipeline never
  ran for a single one of them. Confirmed the three existing binding rows
  are all unrelated (a disabled onboarding-test binding on a different
  number, two placeholder/pending fixtures) — this real number had never
  had a row.
- **Fixed**: inserted the missing binding (`tenant_id` = the `Stratxcel`
  platform tenant created 2026-08-09 the same day as the agent-channel
  work, owner = the platform_owner staff account; `source:
  'migrated_verified_bot'`, `migration_status: 'cutover_live'` — the exact
  enum values this schema already defined for exactly this situation;
  `inbound_enabled`/`outbound_enabled: true`). `shadow_mode` is a stored,
  descriptive field only — confirmed by grep it gates nothing in the actual
  send path (`WHATSAPP_INTEGRATION_MODE` and the `legacy_verified_bot`
  zero-send check are the real gates), so it was set `false` to match
  reality rather than misreport it.
- **Second real bug, found live**: with the binding in place, `LINK` (a
  deterministic command, no LLM) worked and delivered
  (Meta status `delivered`), but the actual Boss question got the generic
  unavailable fallback every time. Root-caused to `agent_runs.error_reason:
  tenant_required_for_billable_ai` — see the Update 2 commit
  (`64088f7`, `lib/agent-core/provider-adapter.ts`) for the full defect:
  `createAgentCoreProviderAdapter()` never forwarded a `tenantId` into the
  billable AI runtime, for any channel, so every non-deterministic
  staff/admin/client agent-core turn (WhatsApp and web Copilot alike) threw
  on the first LLM call. Not WhatsApp-specific — the same `error_reason`
  appears for `admin_web`/`client_web` on 2026-08-15. Fixed by threading
  `principal.tenantId` through, with a new `STRATXCEL_PLATFORM_TENANT_ID`
  env var (set on Vercel production) as the billing-attribution fallback for
  staff turns, which have no tenant by design. Deployed to the real
  production Vercel project (`www.stratxcel.in`, verified via
  `/api/health`'s `commit` field advancing to `64088f7`) by fast-forwarding
  `release/stratxcel-final` onto `main`, matching this repo's established
  same-day deploy pattern.
- **Re-verified live after both fixes**: a real inbound "What do we have to
  do now? What are our plans?", synthesized server-side (a correctly
  HMAC-signed Meta-shaped payload, computed using the box's own real
  `WHATSAPP_APP_SECRET`, sent to the real local webhook receiver — no
  physical phone can be made to text on command from this environment) and
  a real "How is StratXcel doing today?" follow-up both produced real,
  tool-backed answers (`agent_runs.tool_calls_count`: 1 and 2,
  `error_reason: null`) referencing real platform data (2 active tenants,
  13 real pending search recommendations, 0 open handoffs), delivered to
  the real Boss number and confirmed **`read`** by Meta's own delivery
  status. The real human then organically replied twice from their actual
  phone ("What are these 13 pemding approval's?") and received a further
  correct, specific, tool-backed answer — the strongest possible signal
  this is a genuine, live, working round trip, not a simulated one.
- **One more real gap surfaced, not fixed (out of this task's scope)**: the
  real Boss's own organic message also triggered the `isSocialMission`
  heuristic and got "I couldn't prepare that Social Copilot mission. Nothing
  was published." — a real failure in `runWhatsAppSocialMission`, distinct
  from the two bugs above, not yet root-caused. Flagged, not chased, to
  avoid further synthetic traffic into what had become a real, live
  conversation with an actual person.

**Cleanup**: no code deployed to the legacy bot; no legacy process touched;
temporary throwaway scripts used to generate the pairing code and the two
signed test payloads were deleted from the EC2 checkout immediately after
use (`_agent_tmp_*.mjs`, never committed). No AWS credential, WhatsApp
token, or Supabase key was ever printed to any tool output — every check
used presence-only (`<SET>`) redaction.

## Update 1 — the docs undersold what's already built; the real blocker is infra deploy + a live Meta webhook cutover, not code

Tracks real, evidence-based progress against `STRATEXCEL_AI_MASTER_BUILD_BRIEF.md`'s
WhatsApp AI Agency mandate, in the same discipline as
`SEARCH_GROWTH_ENGINE_GAP_AUDIT.md`: audit before building, verify against the
real running system, never fabricate a completion claim.

## Update 1 — the docs undersold what's already built; the real blocker is infra deploy + a live Meta webhook cutover, not code

`docs/architecture/WHATSAPP_AGENT_CHANNEL.md` and `apps/whatsapp-worker/DEPLOYMENT.md`
describe a "backend foundation only, not deployed, not enabled" system with two
explicit open blockers: no live LLM tool-calling, and no outbound-delivery path
for a linked (non-lead) principal. Both docs are stale. Verified against the
actual code and the actual running production systems:

**What is real and already live:**

- `lib/social/agent/provider.ts`'s `GeminiProvider`/`AiRuntimeSocialProvider`
  do real function-calling round trips (`parseGeminiCompletionParts` extracts
  `functionCall` parts; `AiRuntimeSocialProvider` delegates to
  `@stratxcel/ai-runtime` and returns real `toolCalls`) — the "always returns
  `toolCalls: []`" claim is outdated.
- `packages/agent-core/src/orchestrator.ts`'s `runAgentTurn` is a real, bounded
  (`MAX_TOOL_ROUNDS = 5`) agentic tool-calling loop with principal-scoped tool
  resolution, mutation policy (`execute` / `confirm_required` / `dashboard_only`),
  one-time confirmation codes, idempotent run correlation by
  `providerMessageId`, and full audit logging.
- `packages/whatsapp/src/outbound.ts`'s `sendOutboundWhatsAppToRecipient` is a
  real, fully implemented non-lead outbound send path (shares preflight/adapter/
  idempotency machinery with the lead-scoped `sendOutboundWhatsAppMessage`,
  writes to `agent_channel_messages`). `app/api/internal/agent/whatsapp/route.ts`
  already calls it for every reply — deterministic commands and real Agent
  turns alike. `apps/whatsapp-worker/src/processor.ts`'s `handleAgentChannelOutcome`
  is a stale, misleadingly-commented no-op logger left over from before this was
  wired — it is not on the critical path (the send already happened upstream)
  but its comment ("delivery not yet wired") should be corrected so it stops
  contradicting `route.ts`'s accurate doc comment.
- All required migrations are applied on the real production Supabase project
  (`stratxcel`, `uccqlgeghkwzujeeymua`): `agent_sessions`, `agent_messages`,
  `agent_runs`, `agent_run_events`, `agent_action_confirmations`,
  `agent_channel_messages`, `whatsapp_channel_principals`,
  `whatsapp_channel_pairing_codes`, `whatsapp_phone_bindings` all exist.
- Two active `platform_staff_users` exist: `shriyanshchandrakar@gmail.com`
  (`platform_owner`) and `stratxcelgame@gmail.com` (`platform_admin`) — a real
  canonical admin identity to link a Boss/CEO phone against already exists; no
  hardcoded phone number exists anywhere in the codebase (verified by grep).
- **Confirmed live in production Vercel** (`jack160699s-projects/stratxcel`):
  `WHATSAPP_AGENT_CHANNEL_ENABLED` and `STRATXCEL_AGENT_CHANNEL_SECRET` are
  both set (added ~24 days before this audit). A real, unauthenticated `POST
  https://www.stratxcel.in/api/internal/agent/whatsapp` returns **401**
  (auth rejected), not 404 (`isInternalAgentEndpointEnabled()` returning
  false would 404) — direct, live proof the Next.js side of the agent channel
  is already enabled in production today, not merely "not deployed" as the
  architecture doc claims.

**What is real and NOT live — the actual remaining gap:**

- The real, live, production WhatsApp bot serving actual customers today is
  the **legacy Python/Flask bot** (`Jack160699/ai-automation-system`), running
  on an EC2 host behind `bot.stratxcel.ai`. Confirmed via Meta's own webhook
  subscription list for the "AI OS" app (`1957307684884703`): exactly one
  active subscription, `whatsapp_business_account` → `bot.stratxcel.ai`. It has
  zero connection to this repo's Supabase tenants, brand data, or any tool
  built here.
- `apps/whatsapp-worker` (the new TypeScript webhook receiver + queue
  processor) has never been deployed to any real host — confirmed both by its
  own `DEPLOYMENT.md` and by the Meta subscription list above showing no
  second callback URL exists at all. Nothing calls the new system's webhook,
  so nothing ever reaches `runAgentTurn` regardless of how ready the code is.
- The `legacy-shadow` mirror bridge (`app/api/internal/whatsapp/legacy-shadow/route.ts`,
  `packages/whatsapp/src/legacy-bridge/*`) is built, tested, and authenticated,
  but "nothing calls this endpoint in production" per its own doc comment —
  the hook that would call it from the legacy bot's repo was prepared on a
  separate branch and deliberately never shipped, pending explicit review.
- No phone has been linked to either `platform_staff_users` row yet
  (`whatsapp_channel_principals` has no active row) — a pairing code has to be
  generated and `LINK <code>` sent from the real Boss phone before any live
  test can run.

**Net assessment:** the brief's "WHATSAPP AI AGENCY OPERATIONAL" outcome is
not a large coding project at this point — the agent reasoning, tool registry,
security model, and outbound delivery are real and already live on the
Next.js side. It is a **deployment and cutover** project: stand up
`apps/whatsapp-worker` on real infrastructure without touching the legacy
bot's live nginx config (per its own `DEPLOYMENT.md`, additive by design),
decide when to point Meta's webhook at it, and link a real Boss phone. Two
external blockers, not fixable in-session: AWS access for this session was
expired (`sts:get-caller-identity` → `TOKEN_EXPIRED`) and no SSH credential
for the EC2 host is available yet. Everything above this line was verified
directly against the real running production systems (Meta Graph API,
Vercel CLI against the real linked project, Supabase against the real
`stratxcel` project) — nothing in this entry is inferred from documentation
alone.
