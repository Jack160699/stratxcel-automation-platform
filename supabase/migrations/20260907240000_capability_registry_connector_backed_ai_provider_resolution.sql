-- Registers the connector-backed AI provider resolution (a connected
-- gemini/openrouter key now actually overrides the env var for real AI
-- calls), and corrects the two earlier connector_definitions/
-- capability_registry rows that said this was not yet done. Applied live
-- via Supabase MCP on 2026-09-07; this file makes it reproducible from a
-- fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:connector_backed_ai_provider_resolution',
  'A connected Gemini/OpenRouter key now actually overrides the env var for real AI calls -- closes the honest gap from earlier the same day',
  'Closes a gap explicitly flagged as future work when the Connector Control Plane shipped: connecting a gemini/openrouter key via /admin/connectors previously only vaulted+health-checked it, never actually affecting real inference. Built packages/connectors/src/resolve-effective-key.ts''s resolveCachedPlatformConnectorSecret -- a real, cached (5-minute TTL), fail-open resolver -- and wired it into lib/social/agent/provider.ts''s AiRuntimeSocialProvider.complete(), the REAL, SINGLE composition root every platform AI completion goes through today (WhatsApp, Admin Copilot, and Hermes missions via createAgentCoreProviderAdapter -> resolveConfiguredProvider -> this same provider). The resolved key is passed into the real GeminiTextProvider/OpenRouterTextProvider constructors via their existing apiKey option (confirmed both already supported this before writing any code -- no constructor change needed). No circular dependency: this is app code (lib/social) depending on a package (@stratxcel/connectors); @stratxcel/connectors itself never imports lib/social or @stratxcel/ai-runtime for this purpose (it already depended on ai-runtime for readiness probes, unchanged). Safety-first design given this sits on the single highest-traffic code path in the product: (1) behaviorally a strict no-op today -- since no connector is connected in production yet, every resolution returns the existing env var, identical to prior behavior, proven by a dedicated test; (2) cached so this adds zero DB round-trips per AI call in steady state, only one lookup per 5 minutes; (3) fails open on ANY error (network, DB, vault) by falling back to the env var immediately, briefly caching that fallback too so a persistent failure does not retry the DB every request -- a connector-resolution problem must never be capable of breaking a real AI response.',
  'ai-runtime',
  'Engineering',
  'internal (no new agent-facing tool -- affects the underlying AI provider selection every existing tool already uses)',
  'read_write',
  'global',
  'free',
  'low_mutation',
  'Extended packages/connectors/src/__tests__/connectors.test.ts with 4 new scenarios: falls back to the env var with no connection (proves the strict-no-op-today property), fails open on a simulated DB outage, caches within its TTL (call-counting fake proves exactly one DB hit across 3 calls), and the real composition root (lib/social/agent/provider.ts) is confirmed via source inspection to actually pass the resolved keys into the real GeminiTextProvider/OpenRouterTextProvider constructors, not just compute and discard them. Ran and passed the FULL existing test suite touching this exact file/path before treating this as safe: lib/social/__tests__/provider.test.ts (AiRuntimeSocialProvider requires tenantId + 4 other real scenarios), lib/social/__tests__/package-autopilot-producer.test.ts, packages/ai-runtime/src/__tests__/ai-runtime-accounting-hardening.test.ts, and the full 11-file test:ai-runtime suite (including openrouter-provider.test.ts) -- all pass. Two pre-existing, unrelated failures (lib/social/__tests__/studio-creative-treatment.test.ts -- an environmental precondition about OPENAI_API_KEY being set in this shell, unrelated to this change; lib/image-generation/__tests__/image-generation.test.ts -- a validateCreativeTreatment assertion in a different subsystem never touched here) were confirmed via git stash to fail IDENTICALLY without this change too, before being ruled out as regressions. Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'Deliberately conservative: a 5-minute cache means a newly-connected or just-revoked key can take up to 5 minutes to take/lose effect platform-wide -- an intentional trade-off (favoring never adding hot-path latency/DB load over instant propagation), stated honestly rather than silently accepted. Company-scoped connectors (vercel/whatsapp/meta/google_workspace) are untouched by this -- only the 2 platform-scoped AI connectors (gemini, openrouter) are wired here, matching their real scope_level.',
  now(),
  'claude_session_2026-09-07'
);

update connector_definitions set description =
  'Google AI Studio/Gemini API for AI generation -- a platform-level key (GEMINI_API_KEY), the same one @stratxcel/ai-runtime''s Google provider already uses. Health is the real, already-live probeGeminiReadiness() live HTTP check, reused unmodified. Connecting a key here now actually overrides the runtime GEMINI_API_KEY env var for real AI calls -- lib/social/agent/provider.ts''s real composition root resolves this connector''s vaulted key (via resolve-effective-key.ts''s cached, fail-open resolveCachedPlatformConnectorSecret) and passes it into the real GeminiTextProvider constructor, used by every platform AI completion (WhatsApp, Admin Copilot, Hermes). No circular dependency: app code depends on this package, not the other way around. Behaviorally a strict no-op until a key is actually connected (falls back to the env var otherwise), cached 5 minutes so this adds no hot-path DB load.'
where key = 'gemini';

update connector_definitions set description =
  'OpenRouter as an opt-in AI resource pool (built earlier this session, Update 71) -- a platform-level key. Health is the real, already-live probeOpenRouterReadiness() live HTTP check, reused unmodified. Connecting a key here now actually overrides the runtime OPENROUTER_API_KEY env var for real AI calls -- lib/social/agent/provider.ts''s real composition root resolves this connector''s vaulted key (via resolve-effective-key.ts''s cached, fail-open resolveCachedPlatformConnectorSecret) and passes it into the real OpenRouterTextProvider constructor. Still requires OPENROUTER_ENABLED=1 to actually be selected by task-class routing (unchanged, separate opt-in gate) -- connecting a key here alone does not activate OpenRouter traffic. Behaviorally a strict no-op until a key is actually connected, cached 5 minutes so this adds no hot-path DB load.'
where key = 'openrouter';

update capability_registry set status_notes = status_notes ||
  ' SUPERSEDED SAME DAY: the composition-root resolver flagged as a future task here was built the same day (capability:connector_backed_ai_provider_resolution) -- a connected gemini/openrouter key now DOES override the runtime env var for real AI calls, via a cached, fail-open resolver wired into lib/social/agent/provider.ts''s real composition root. See that capability row for the full description.'
where capability_key = 'capability:connector_capability_control_plane';
