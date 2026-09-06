-- Registers OpenRouter as a real, opt-in fourth AI resource pool
-- (packages/ai-runtime/src/providers/openrouter.ts) -- the master brief's
-- explicit Resource/Quota Manager requirement. Applied live via Supabase
-- MCP on 2026-09-07; this file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  connection, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, external_blocker, last_verified_at, last_verified_by
) values (
  'capability:openrouter_resource_pool',
  'OpenRouter integrated as a real, opt-in fourth AI resource pool',
  'The master brief''s Resource/Quota Manager section explicitly names OpenRouter as a required resource pool ("do not always use the strongest model"). Found the codebase had a leftover typed placeholder (an older, unused model-router.ts listed "openrouter" as a possible ModelRoutingDecision.provider value but its switch statement never actually returned it) and zero real client anywhere -- AIProviderId itself was a closed "google" | "openai" | "local" union with no fourth option at all. Built a real OpenRouterTextProvider (packages/ai-runtime/src/providers/openrouter.ts) implementing the canonical AITextProviderAdapter interface against OpenRouter''s real, live-fetched (2026-09-07, not recalled from training data) published API reference: POST https://openrouter.ai/api/v1/chat/completions, Bearer auth, standard OpenAI-compatible chat/completions request+response shape (messages/tools/tool_calls), with 401/402/429 mapped to this codebase''s real AIErrorCategory vocabulary (402 -> CREDIT, OpenRouter''s own documented "insufficient credits" code). Threaded through as a genuine fourth AIProviderId: runtime.ts''s providerFor()/isAnyProviderConfigured(), factory.ts''s createTenantAIRuntime, a real readiness probe (probeOpenRouterReadiness, GET /api/v1/models, live-verified endpoint), a real $0 cost-catalog entry for the specific :free model used by default, and a new isOpenRouterRoutingEnabled() opt-in gate mirroring isLocalAiRoutingEnabled''s exact fail-safe pattern -- appended as an escalation-only candidate on GENERAL_SPECIALIST (the task class whose own stated purpose, "routing, classification, extraction, cheap specialist work," is exactly OpenRouter''s free-tier-suitable niche) only when OPENROUTER_ENABLED=1, never touching default routing.',
  'ai-runtime',
  'Engineering',
  'openrouter',
  'read',
  'global',
  'free',
  'low_mutation',
  'packages/ai-runtime/src/__tests__/openrouter-provider.test.ts (8 scenarios: isConfigured requires a key, a real chat/completions response parse, real OpenAI-compatible tool_calls parsing, HTTP 402 classifying as CREDIT, readiness probe not-configured and configured-with-real-GET-/models paths, and two routing-safety tests proving OPENROUTER_ENABLED unset leaves every existing task policy byte-for-byte unchanged while =1 appends exactly one escalation-only candidate to GENERAL_SPECIALIST and nowhere else) -- all pass, wired into the tracked test:ai-runtime script. Zero regressions across the full 11-file test:ai-runtime suite plus targeted lib/social provider.test.ts/gemini-boundary.test.ts (the heaviest ai-runtime consumers). Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production npm run build (exit 0).',
  'REAL_EXPOSED',
  'A genuinely real, tested provider and full wiring, but honestly still capability-pending in production per the master brief''s own External Access Model (section 43: "build the connector/abstraction... mark capability pending... continue"): no OPENROUTER_API_KEY is configured anywhere in this deployment, and OPENROUTER_ENABLED is unset, so it is inert (isConfigured() false) until the owner adds a real key at https://openrouter.ai/keys and deliberately opts in -- the identical, proven-safe two-flag pattern Local AI already uses. Recorded here, not left silently unbuilt: the connector exists, is tested, and needs zero further code once a key is added.',
  'openrouter_api_key_not_configured_and_feature_flag_unset_by_design',
  now(),
  'claude_session_2026-09-07'
);
