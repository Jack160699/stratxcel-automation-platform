-- Durable Postgres-backed job queue. Chosen as the initial durable queue
-- backend per explicit instruction (no paid managed queue tonight); hidden
-- behind packages/queue's QueueAdapter interface so it can be swapped for
-- Redis/QStash/SQS/Cloud Tasks/RabbitMQ later without touching mission or
-- WhatsApp business logic.

create table if not exists queue_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  priority integer not null default 100,
  scheduled_at timestamptz not null default now(),
  status text not null default 'PENDING' check (status in (
    'PENDING', 'LEASED', 'RETRY_SCHEDULED', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED'
  )),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_error jsonb,
  trace_id text,
  correlation_id text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table queue_jobs enable row level security;

-- Dedup: a given tenant can only have one active (non-terminal) job per
-- idempotency key. Terminal jobs (SUCCEEDED/FAILED/DEAD_LETTER/CANCELLED)
-- are excluded so the same idempotency key CAN be reused for a later,
-- genuinely new occurrence of the same logical event once the prior one
-- has finished — this is deliberate: idempotency here means "don't double
-- process an in-flight event," not "this key can never be used again."
create unique index if not exists queue_jobs_tenant_idempotency_active_idx
  on queue_jobs (tenant_id, idempotency_key)
  where idempotency_key is not null
    and status not in ('SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

create index if not exists queue_jobs_claim_idx
  on queue_jobs (status, scheduled_at, priority)
  where status in ('PENDING', 'RETRY_SCHEDULED');
create index if not exists queue_jobs_tenant_idx on queue_jobs (tenant_id, created_at desc);
create index if not exists queue_jobs_lease_expiry_idx on queue_jobs (lease_expires_at) where status = 'LEASED';

-- Tenant members can read their own tenant's queue state (for an admin
-- "queue status" view) but never mutate it directly — every state change
-- goes through the queue_internal functions below, callable only by
-- service_role.
create policy queue_jobs_tenant_read on queue_jobs for select
  using (exists (select 1 from tenant_members m where m.tenant_id = queue_jobs.tenant_id and m.user_id = (select auth.uid())));

grant select, insert, update, delete on queue_jobs to service_role;
grant select on queue_jobs to authenticated;

-- Privileged claim/lease/completion functions live in a schema PostgREST
-- never exposes (only `public` is exposed via the API), and are further
-- locked down with explicit REVOKE/GRANT so even a future accidental
-- schema exposure change can't hand queue mutation to public clients.
create schema if not exists queue_internal;
revoke all on schema queue_internal from public;
grant usage on schema queue_internal to service_role;

create or replace function queue_internal.claim_next_job(
  p_lease_owner text,
  p_job_types text[] default null,
  p_lease_seconds integer default 300
) returns setof public.queue_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
begin
  select id into v_job_id
  from public.queue_jobs
  where status in ('PENDING', 'RETRY_SCHEDULED')
    and scheduled_at <= now()
    and (p_job_types is null or job_type = any(p_job_types))
  order by priority asc, scheduled_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
    update public.queue_jobs
    set status = 'LEASED',
        lease_owner = p_lease_owner,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        heartbeat_at = now(),
        started_at = coalesce(started_at, now()),
        attempt_count = attempt_count + 1,
        updated_at = now()
    where id = v_job_id
    returning *;
end;
$$;
revoke all on function queue_internal.claim_next_job(text, text[], integer) from public, anon, authenticated;
grant execute on function queue_internal.claim_next_job(text, text[], integer) to service_role;

create or replace function queue_internal.heartbeat_job(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 300
) returns setof public.queue_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    update public.queue_jobs
    set heartbeat_at = now(),
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    where id = p_job_id
      and lease_owner = p_lease_owner
      and status = 'LEASED'
    returning *;
end;
$$;
revoke all on function queue_internal.heartbeat_job(uuid, text, integer) from public, anon, authenticated;
grant execute on function queue_internal.heartbeat_job(uuid, text, integer) to service_role;

create or replace function queue_internal.complete_job(
  p_job_id uuid,
  p_lease_owner text
) returns setof public.queue_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    update public.queue_jobs
    set status = 'SUCCEEDED',
        completed_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        updated_at = now()
    where id = p_job_id
      and lease_owner = p_lease_owner
      and status = 'LEASED'
    returning *;
end;
$$;
revoke all on function queue_internal.complete_job(uuid, text) from public, anon, authenticated;
grant execute on function queue_internal.complete_job(uuid, text) to service_role;

-- Exponential backoff with a cap, jitter-free (deterministic, so retry
-- timing is predictable and testable) — base 30s, doubling per attempt,
-- capped at 1 hour.
create or replace function queue_internal.compute_backoff_seconds(p_attempt_count integer)
returns integer
language sql
immutable
as $$
  select least(30 * power(2, greatest(p_attempt_count - 1, 0))::integer, 3600);
$$;

create or replace function queue_internal.fail_job(
  p_job_id uuid,
  p_lease_owner text,
  p_error jsonb,
  p_retryable boolean default true
) returns setof public.queue_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.queue_jobs;
  v_backoff_seconds integer;
begin
  select * into v_job from public.queue_jobs where id = p_job_id and lease_owner = p_lease_owner and status = 'LEASED';
  if v_job.id is null then
    return;
  end if;

  if p_retryable and v_job.attempt_count < v_job.max_attempts then
    v_backoff_seconds := queue_internal.compute_backoff_seconds(v_job.attempt_count);
    return query
      update public.queue_jobs
      set status = 'RETRY_SCHEDULED',
          scheduled_at = now() + make_interval(secs => v_backoff_seconds),
          last_error = p_error,
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      where id = p_job_id
      returning *;
  else
    return query
      update public.queue_jobs
      set status = 'DEAD_LETTER',
          last_error = p_error,
          completed_at = now(),
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      where id = p_job_id
      returning *;
  end if;
end;
$$;
revoke all on function queue_internal.fail_job(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function queue_internal.fail_job(uuid, text, jsonb, boolean) to service_role;

create or replace function queue_internal.cancel_job(p_job_id uuid) returns setof public.queue_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    update public.queue_jobs
    set status = 'CANCELLED', completed_at = now(), updated_at = now()
    where id = p_job_id
      and status not in ('SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED')
    returning *;
end;
$$;
revoke all on function queue_internal.cancel_job(uuid) from public, anon, authenticated;
grant execute on function queue_internal.cancel_job(uuid) to service_role;

-- Recovers jobs whose worker died mid-lease (crashed process, killed
-- container) without ever calling complete_job/fail_job. Treated as a
-- retryable failure with a synthetic error so it goes through the same
-- backoff/dead-letter path as any other failure, rather than a special case.
create or replace function queue_internal.recover_expired_leases() returns setof public.queue_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.queue_jobs;
  v_backoff_seconds integer;
begin
  for v_job in
    select * from public.queue_jobs
    where status = 'LEASED' and lease_expires_at < now()
    for update skip locked
  loop
    if v_job.attempt_count < v_job.max_attempts then
      v_backoff_seconds := queue_internal.compute_backoff_seconds(v_job.attempt_count);
      return query
        update public.queue_jobs
        set status = 'RETRY_SCHEDULED',
            scheduled_at = now() + make_interval(secs => v_backoff_seconds),
            last_error = jsonb_build_object('reason', 'lease_expired', 'lease_owner', v_job.lease_owner),
            lease_owner = null,
            lease_expires_at = null,
            updated_at = now()
        where id = v_job.id
        returning *;
    else
      return query
        update public.queue_jobs
        set status = 'DEAD_LETTER',
            last_error = jsonb_build_object('reason', 'lease_expired_exhausted', 'lease_owner', v_job.lease_owner),
            completed_at = now(),
            lease_owner = null,
            lease_expires_at = null,
            updated_at = now()
        where id = v_job.id
        returning *;
    end if;
  end loop;
end;
$$;
revoke all on function queue_internal.recover_expired_leases() from public, anon, authenticated;
grant execute on function queue_internal.recover_expired_leases() to service_role;

-- PostgREST (and therefore supabase-js's .rpc()) only ever routes to the
-- `public` schema by default — a function defined only in queue_internal
-- is unreachable over the API no matter its grants. These thin wrappers
-- are the only entry points the API surface actually exposes; the real
-- logic above stays in queue_internal so it's never reachable even if the
-- exposed-schema configuration ever changes. Each wrapper carries the same
-- security-definer/search_path/revoke/grant hardening as its
-- queue_internal counterpart, so the one function PostgREST can route to
-- is exactly as locked down as the implementation it forwards to.
create or replace function public.claim_next_job(
  p_lease_owner text,
  p_job_types text[] default null,
  p_lease_seconds integer default 300
) returns setof public.queue_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from queue_internal.claim_next_job(p_lease_owner, p_job_types, p_lease_seconds);
$$;
revoke all on function public.claim_next_job(text, text[], integer) from public, anon, authenticated;
grant execute on function public.claim_next_job(text, text[], integer) to service_role;

create or replace function public.heartbeat_job(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 300
) returns setof public.queue_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from queue_internal.heartbeat_job(p_job_id, p_lease_owner, p_lease_seconds);
$$;
revoke all on function public.heartbeat_job(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.heartbeat_job(uuid, text, integer) to service_role;

create or replace function public.complete_job(p_job_id uuid, p_lease_owner text) returns setof public.queue_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from queue_internal.complete_job(p_job_id, p_lease_owner);
$$;
revoke all on function public.complete_job(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_job(uuid, text) to service_role;

create or replace function public.fail_job(
  p_job_id uuid,
  p_lease_owner text,
  p_error jsonb,
  p_retryable boolean default true
) returns setof public.queue_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from queue_internal.fail_job(p_job_id, p_lease_owner, p_error, p_retryable);
$$;
revoke all on function public.fail_job(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.fail_job(uuid, text, jsonb, boolean) to service_role;

create or replace function public.cancel_job(p_job_id uuid) returns setof public.queue_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from queue_internal.cancel_job(p_job_id);
$$;
revoke all on function public.cancel_job(uuid) from public, anon, authenticated;
grant execute on function public.cancel_job(uuid) to service_role;

create or replace function public.recover_expired_leases() returns setof public.queue_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from queue_internal.recover_expired_leases();
$$;
revoke all on function public.recover_expired_leases() from public, anon, authenticated;
grant execute on function public.recover_expired_leases() to service_role;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
