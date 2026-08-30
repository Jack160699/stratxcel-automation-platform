-- STRATXCEL two-gap closure brief (Gap 1: real analytics ingestion).
--
-- social_metrics already exists (20260727210513_social_autopilot_schema_delta.sql)
-- with exactly the normalized-metric columns the ingestion brief asks for
-- (reach, impressions, views, watch_time_seconds, likes, comments, shares,
-- saves, clicks, followers_gained, leads, conversions, raw) -- it was just
-- never populated with real data (recordMetrics is only ever called once,
-- immediately after publish, with an empty {} metrics object). This
-- migration adds exactly what real, safe, idempotent ingestion needs on
-- top of that existing table: a real per-day observation key.
--
-- observation_date defaults to today (UTC) so the ALREADY-EXISTING
-- worker.ts call site (recordMetrics right after a real publish) keeps
-- working completely unmodified -- it naturally gets today's date. The
-- new analytics-ingestion module upserts against the same
-- (variant_id, observation_date) key, so:
--   - the very first metrics row a publish creates (all-null numeric
--     columns, just an anchor with the real provider_post_id) is the SAME
--     row same-day ingestion later fills in with real numbers, not a
--     second row,
--   - a genuine second calendar day's ingestion is a real NEW row (a real
--     time series, not a single mutable snapshot),
--   - two ingestion runs on the same real day (a cron tick + a manual
--     admin re-trigger, a retried request, concurrent workers) are a real,
--     atomic Postgres ON CONFLICT DO UPDATE -- never a duplicate
--     observation, and the later fetch's fresher cumulative numbers
--     correctly win over the earlier one's.
alter table social_metrics
  add column if not exists observation_date date not null default (timezone('utc', now()))::date;

create unique index if not exists social_metrics_variant_observation_date_key
  on social_metrics (variant_id, observation_date);
