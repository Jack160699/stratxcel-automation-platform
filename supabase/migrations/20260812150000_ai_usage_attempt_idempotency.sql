-- Additive: AI usage attempt idempotency + session attribution (non-FK).
-- DO NOT apply to production as part of this PR without review.

alter table ai_execution_usage
  add column if not exists session_id text;

alter table ai_execution_usage
  add column if not exists correlation_id text;

-- Stable identity for retries: same tenant + request + attempt must not double-count.
create unique index if not exists ai_execution_usage_attempt_uidx
  on ai_execution_usage (tenant_id, request_id, attempt_number)
  where request_id is not null;

comment on column ai_execution_usage.session_id is
  'Conversational/social session identity — NOT missions.id';
comment on column ai_execution_usage.correlation_id is
  'Optional workflow/correlation identity — NOT missions.id';
comment on column ai_execution_usage.mission_id is
  'Real missions.id only; NULL when no mapped workforce mission row exists';
