-- Corrects an overclaim caught in the same session it was written, before
-- the day's work ended: the gemini/openrouter connector descriptions said
-- connecting a key here is "a genuine alternative to the env var" for real
-- AI calls. It vaults and health-checks the key for real, but does NOT yet
-- override the runtime OPENROUTER_API_KEY/GEMINI_API_KEY env var actually
-- used for inference -- @stratxcel/ai-runtime cannot depend on
-- @stratxcel/connectors without a circular workspace dependency (connectors
-- already depends on ai-runtime for its readiness probes). ai-runtime's
-- factory already supports dependency injection (deps.openrouter/
-- deps.google) for exactly this, so a composition-root resolver is a real,
-- well-scoped, not-yet-done future task. Applied live via Supabase MCP on
-- 2026-09-07; this file makes it reproducible from a fresh database.

update connector_definitions set description =
  'Google AI Studio/Gemini API for AI generation -- a platform-level key (GEMINI_API_KEY), the same one @stratxcel/ai-runtime''s Google provider already uses. Health is the real, already-live probeGeminiReadiness() live HTTP check, reused unmodified. Stated honestly: connecting a key here vaults it and health-checks it for real, but does NOT yet override the runtime GEMINI_API_KEY env var used for actual AI calls -- @stratxcel/ai-runtime cannot depend on @stratxcel/connectors without a circular workspace dependency (connectors already depends on ai-runtime for its readiness probes), so wiring the vaulted key into real inference calls needs a composition-root resolver (ai-runtime''s factory already supports dependency injection via deps.openrouter/deps.google -- see factory.ts -- so this is a real, well-scoped, not-yet-done future task, not a duplicate path).'
where key = 'gemini';

update connector_definitions set description =
  'OpenRouter as an opt-in AI resource pool (built earlier this session, Update 71) -- a platform-level key. Health is the real, already-live probeOpenRouterReadiness() live HTTP check, reused unmodified. Stated honestly: connecting a key here vaults it and health-checks it for real, but does NOT yet override the runtime OPENROUTER_API_KEY env var used for actual AI calls -- @stratxcel/ai-runtime cannot depend on @stratxcel/connectors without a circular workspace dependency, so wiring the vaulted key into real inference calls needs a composition-root resolver (ai-runtime''s factory already supports dependency injection via deps.openrouter -- see factory.ts -- so this is a real, well-scoped, not-yet-done future task).'
where key = 'openrouter';

update capability_registry set status_notes = status_notes ||
  ' ADDENDUM (same session, caught before the day''s work ended): the openrouter/gemini descriptions initially overclaimed that connecting a key here is "a genuine alternative to the env var" for real AI calls -- corrected to state precisely that v1 only vaults+health-checks the key; it does not yet override the runtime OPENROUTER_API_KEY/GEMINI_API_KEY env var actually used for inference, because @stratxcel/ai-runtime cannot depend on @stratxcel/connectors without a circular workspace dependency. ai-runtime''s factory already supports dependency injection (deps.openrouter/deps.google) for exactly this, so a composition-root resolver is a real, well-scoped, not-yet-done future task, not a duplicate path.'
where capability_key = 'capability:connector_capability_control_plane';
