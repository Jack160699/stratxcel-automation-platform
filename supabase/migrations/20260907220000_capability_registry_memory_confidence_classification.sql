-- Registers the memory confidence/provenance classification (master brief
-- Section 19). Applied live via Supabase MCP on 2026-09-07; this file makes
-- it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:memory_confidence_classification',
  'agent_memories now carries a real provenance/confidence classification -- master brief Section 19',
  'Section 19: "Never turn an AI assumption into a verified business fact automatically." Before this, agent_memories had no confidence/provenance classification for ANY caller -- WhatsApp/Admin Copilot''s own rememberAgentFact, AND Hermes'' remember_company_fact (built this session, Update 80) -- every memory was treated as equally authoritative, precisely what Section 19 forbids. This was explicitly flagged as a known future task in Update 80''s own status_notes, and is now closed. Added a real confidence column (migration 20260907210000) with exactly the 7 values the brief names (FACT, VERIFIED, OBSERVATION, INFERENCE, PREFERENCE, EXPERIMENT, UNKNOWN), NOT NULL DEFAULT ''UNKNOWN'' -- the safe default, live-verified via a dry-run proving the CHECK constraint genuinely rejects an invented value and rolls back with zero side effects. Wired through every real write/read path: packages/agent-core''s rememberAgentFact/listAgentMemories (used by WhatsApp/Admin Copilot''s remember_fact/recall_memory tools -- confidence is an optional tool parameter, explicitly validated against the real enum before use, defaulting to UNKNOWN on omission or an invalid value, never silently upgraded to FACT/VERIFIED), and Hermes'' own remember_company_fact/recall_company_memory (same default-to-UNKNOWN discipline, confidence returned on both remember and recall so a mission or the model can see how sure each fact actually is). Hermes'' tool contract/schema/description/json-schema all updated (the tool''s own instruction text explicitly tells the model never to omit confidence to make a guess look verified).',
  'hermes',
  'Engineering',
  'remember_fact, recall_memory, remember_company_fact, recall_company_memory',
  'read_write',
  'global',
  'free',
  'low_mutation',
  'Two new/extended test files: packages/agent-core/src/__tests__/memory-confidence-classification.test.ts (5 scenarios -- MEMORY_CONFIDENCE_VALUES matches the real DB CHECK constraint exactly, rememberAgentFact defaults to UNKNOWN and never silently upgrades on update, listAgentMemories selects+returns the real column, remember_fact''s schema exposes confidence as optional+correctly-enumerated, the handler validates rather than trusting raw model input) and apps/hermes-gateway/src/__tests__/company-memory.test.ts (extended with 3 new scenarios -- schema accepts every real value and rejects an invented one, the handler defaults to UNKNOWN and persists an explicit value on both insert and update, recall selects confidence for every returned memory). The migration itself was live-verified with a real transactional dry-run that intentionally violated the CHECK constraint, confirmed to reject it AND leave the whole batch (including the ALTER TABLE) rolled back with zero side effects, before the real migration was applied. Zero regressions across test:agent-core (17 files) and test:hermes-mission-control (11 files). Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production build (exit 0).',
  'REAL_EXPOSED',
  'Deliberately does not add automatic confidence classification (e.g. an LLM guessing a memory''s own confidence after the fact) -- the model that WRITES the memory must state its own confidence honestly at write time, matching the brief''s own emphasis on the AI never fabricating certainty. A pre-existing memory written before this migration reads back as UNKNOWN (the honest state: genuinely unclassified), not silently reclassified.',
  now(),
  'claude_session_2026-09-07'
);
