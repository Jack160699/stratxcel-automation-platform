# WhatsApp AI Agency — Gap Audit

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
