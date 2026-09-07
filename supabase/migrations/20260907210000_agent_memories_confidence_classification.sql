-- Master brief Section 19: "Never turn an AI assumption into a verified
-- business fact automatically." agent_memories has had no confidence/
-- provenance classification for ANY caller (WhatsApp/Admin Copilot's
-- rememberAgentFact, or Hermes' own remember_company_fact, Update 80) --
-- every memory has been treated as equally authoritative, which is
-- precisely what Section 19 forbids. Adds the real classification, exactly
-- the 7 values the brief names.
--
-- NOT NULL DEFAULT 'UNKNOWN' -- the safe default: every pre-existing row
-- (written before this column existed) and every future caller that
-- doesn't explicitly classify a memory is marked as genuinely unclassified,
-- never silently upgraded to FACT/VERIFIED. A caller must actively choose
-- a stronger classification, not receive one by omission.

alter table agent_memories
  add column if not exists confidence text not null default 'UNKNOWN'
  check (confidence in ('FACT', 'VERIFIED', 'OBSERVATION', 'INFERENCE', 'PREFERENCE', 'EXPERIMENT', 'UNKNOWN'));

comment on column agent_memories.confidence is
  'Provenance classification per master brief Section 19 -- FACT (directly stated by a human), VERIFIED (independently confirmed, e.g. by research evidence), OBSERVATION (directly observed system/business state), INFERENCE (derived/reasoned, not directly confirmed), PREFERENCE (a stated preference, not a fact), EXPERIMENT (a hypothesis being tested), UNKNOWN (unclassified -- the safe default). Never defaults to FACT/VERIFIED.';
