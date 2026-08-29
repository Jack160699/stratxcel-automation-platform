-- Mission F: replace the flat "2 attempts then permanently abandoned" retry
-- count with a real, staged recovery policy. A paid-for content day must
-- eventually resolve to genuine, quality-approved content -- a temporary
-- failure or a correct quality/originality rejection must never silently
-- consume one of the customer's entitled days.
--
-- recovery_state: per-item history of every REJECTED attempt (pillar,
-- concept, objective, the real hard-failure reason codes, when) -- the
-- "content memory" a cross-pass retry reads before regenerating, so it can
-- hard-exclude what already failed instead of deterministically re-deriving
-- the identical rejected angle from unchanged campaign-wide history.
--
-- recovery_exhausted: set true only when every staged recovery attempt
-- (bounded -- see MAX_RECOVERY_ATTEMPTS in package-autopilot.ts) has been
-- tried and failed. Distinguishes "BLOCKED, still being actively retried
-- with a changing strategy" from "BLOCKED, genuinely needs a human/support
-- look" -- both are BLOCKED, but only the second is actually abandoned, and
-- only the second should stop being picked up automatically. Never used to
-- silently drop the day from the campaign -- the row (and its real,
-- diagnosable failure history) stays exactly where it is.
alter table social_autopilot_queue_items
  add column if not exists recovery_state jsonb not null default '[]'::jsonb,
  add column if not exists recovery_exhausted boolean not null default false;

comment on column social_autopilot_queue_items.recovery_state is
  'Mission F: array of {attempt, pillar, concept, objective, failureReasons, at} for every rejected generation attempt on this item -- read by the next attempt to force a materially different strategy.';
comment on column social_autopilot_queue_items.recovery_exhausted is
  'Mission F: true once every staged recovery attempt has been tried and failed -- excluded from further automatic pickup, but never deleted or hidden; surfaced for support/diagnostics.';

-- Support/diagnostic triage (Section 12): fast lookup of items that have
-- exhausted automatic recovery and genuinely need a human look.
create index if not exists social_autopilot_queue_items_recovery_exhausted_idx
  on social_autopilot_queue_items (authorization_id)
  where recovery_exhausted = true;
