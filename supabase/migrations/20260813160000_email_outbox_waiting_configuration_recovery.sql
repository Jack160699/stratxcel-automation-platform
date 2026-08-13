-- Additive: WAITING_CONFIGURATION recovery + email-processor heartbeat type.
-- Does not alter email_outbox columns or revoke existing grants.

-- Allow email-processor heartbeats from the mission-worker hosted email loop.
alter table public.worker_heartbeats
  drop constraint if exists worker_heartbeats_worker_type_check;

alter table public.worker_heartbeats
  add constraint worker_heartbeats_worker_type_check
  check (worker_type in (
    'mission-worker',
    'whatsapp-worker',
    'hermes-gateway',
    'package-autopilot-worker',
    'email-processor'
  ));

comment on constraint worker_heartbeats_worker_type_check on public.worker_heartbeats is
  'Includes email-processor for the long-running outbox poll hosted inside mission-worker (independent of mission jobs).';

-- Re-enter PENDING when provider/config becomes operational.
-- Preserves attempt_count and idempotency. Never resurrects CANCELLED or
-- permanent invalid-recipient failures. Bounded batch.
create or replace function public.recover_email_outbox_waiting_configuration(
  p_limit integer default 100
)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
begin
  return query
  with candidates as (
    select e.id
    from public.email_outbox e
    where e.status = 'WAITING_CONFIGURATION'
      and coalesce(e.last_error_code, '') in (
        'NOT_CONFIGURED',
        'HTTP_401',
        'HTTP_403',
        'SENDER_UNVERIFIED'
      )
      -- Permanent recipient rejection must stay failed — never recover those.
      and coalesce(e.last_error_code, '') not in ('HTTP_422', 'INVALID_RECIPIENT', 'HEADER_INJECTION')
    order by e.updated_at asc
    for update skip locked
    limit v_limit
  )
  update public.email_outbox e
  set status = 'PENDING',
      next_attempt_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      last_error_code = null,
      last_error_safe = null,
      updated_at = now()
      -- attempt_count intentionally preserved
  from candidates c
  where e.id = c.id
  returning e.*;
end;
$$;

revoke all on function public.recover_email_outbox_waiting_configuration(integer) from public, anon, authenticated;
grant execute on function public.recover_email_outbox_waiting_configuration(integer) to service_role;

comment on function public.recover_email_outbox_waiting_configuration(integer) is
  'Moves eligible WAITING_CONFIGURATION email_outbox rows back to PENDING after provider/config recovery. Preserves attempt_count. service_role only.';
