-- Mission/approval automation: optimistic concurrency, idempotent mission
-- creation, approval expiry, and artifact versioning. All additive
-- (ALTER TABLE ADD COLUMN IF NOT EXISTS / new indexes only).

alter table missions add column if not exists version integer not null default 1;
alter table missions add column if not exists idempotency_key text;
alter table missions add column if not exists actual_cost_cents integer;

-- A tenant can only have one active mission per idempotency key — mirrors
-- the queue's own dedup pattern (see 20260803130000_queue.sql) so a
-- redelivered webhook or a double-submitted "create mission" request can't
-- create two missions for the same logical event. Terminal missions are
-- excluded so the key becomes reusable once the prior mission finishes.
create unique index if not exists missions_tenant_idempotency_active_idx
  on missions (tenant_id, idempotency_key)
  where idempotency_key is not null
    and state not in ('COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');

alter table approvals add column if not exists expires_at timestamptz;
alter table mission_artifacts add column if not exists version integer not null default 1;
