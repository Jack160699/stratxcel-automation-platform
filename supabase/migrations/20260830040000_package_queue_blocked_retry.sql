-- Mission D+ Section 21: automatic regeneration loop for BLOCKED package
-- queue items. Before this, prepareNearTermPackageItems's due-item query
-- only ever matched status = 'PLANNED' -- once an item exhausted its
-- in-pass corrective-instruction attempts and was marked BLOCKED, it was
-- permanently excluded from every future preparation pass, forever. The
-- mission explicitly requires a bounded retry loop instead ("Any failed
-- post must go back into the loop... Use retry limits to avoid infinite
-- execution").
--
-- retry_count tracks cross-pass retries specifically (distinct from the
-- existing in-pass runGenerationLoop attempt counter, which already lives
-- in creative_spec.attempts on the resulting variant and only exists for
-- items that got far enough to produce one). The application layer caps
-- retries at a small constant and bounds the retry query to BLOCKED items
-- under that cap, so this alone does not create unbounded execution --
-- it only makes a bounded number of additional attempts possible instead
-- of zero.
alter table social_autopilot_queue_items
  add column if not exists retry_count integer not null default 0;

comment on column social_autopilot_queue_items.retry_count is
  'Cross-pass retry counter for a BLOCKED item that prepareNearTermPackageItems has re-attempted. Incremented each time a retried item fails again; the application layer caps how many times a BLOCKED item is re-selected. 0 for every item that has never been retried (all pre-existing rows).';
