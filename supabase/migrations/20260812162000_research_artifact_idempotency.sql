-- Additive research artifact idempotency guard.
-- Ensures canonical research.web artifacts are race-safe on retries.
create unique index if not exists mission_artifacts_research_storage_ref_uidx
  on mission_artifacts (mission_id, kind, storage_ref)
  where kind in ('research_evidence', 'research_summary')
    and storage_ref like 'workforce://research.web/%';
