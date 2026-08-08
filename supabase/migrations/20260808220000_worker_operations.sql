-- Migration: Worker Operations — kill switches, worker heartbeats, DLQ requeue.
-- Additive only. Does not touch queue_jobs, missions, or any payment table.
--
-- Ops-only surface: kill_switches and worker_heartbeats describe worker-process
-- and operational state, not any single tenant's data (a "global_hermes" or
-- "worker_type" scoped row has no tenant at all). Per the same pattern used for
-- payment_reconciliation_issues, RLS is enabled with NO tenant-read policy —
-- service_role only. Support staff read these via an authenticated, platform-
-- staff-gated API route (never directly from client code).

-- ============================================================
-- 1. KILL SWITCHES
-- ============================================================

create table if not exists kill_switches (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global_hermes', 'worker_type', 'tenant', 'mission')),
  -- '' (empty string, not null — see the plain unique index below, which a
  -- nullable column can't back: NULL <> NULL means two "global" rows could
  -- otherwise coexist) only for scope='global_hermes' (exactly one global row
  -- makes sense); worker_type: 'mission-worker' | 'whatsapp-worker' |
  -- 'hermes-gateway'; tenant/mission: the tenant_id / mission_id as text (no
  -- FK — a kill switch must be settable/readable even if the referenced row
  -- is being cleaned up).
  scope_id text not null default '',
  enabled boolean not null default true,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table kill_switches enable row level security;

create unique index if not exists kill_switches_scope_id_unique_idx
  on kill_switches (scope, scope_id);

create index if not exists kill_switches_active_idx
  on kill_switches (scope, scope_id) where enabled = true;

grant select, insert, update, delete on kill_switches to service_role;

-- ============================================================
-- 2. WORKER HEARTBEATS — one row per running worker instance
-- ============================================================

create table if not exists worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  worker_type text not null check (worker_type in ('mission-worker', 'whatsapp-worker', 'hermes-gateway')),
  instance_id text not null,
  status text not null default 'idle' check (status in ('idle', 'busy', 'degraded', 'stopped')),
  version text,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  queue_backlog_hint integer,
  last_error jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table worker_heartbeats enable row level security;

create unique index if not exists worker_heartbeats_instance_unique_idx
  on worker_heartbeats (worker_type, instance_id);
create index if not exists worker_heartbeats_type_idx
  on worker_heartbeats (worker_type, last_heartbeat_at desc);

grant select, insert, update, delete on worker_heartbeats to service_role;

-- ============================================================
-- 3. DEAD-LETTER REQUEUE — tenant-scoped, idempotent, no cross-tenant recovery
-- ============================================================

create schema if not exists queue_internal;
-- (already created by 20260803130000_queue.sql; safe no-op if it exists)

create or replace function queue_internal.requeue_dead_letter_job(
  p_job_id uuid,
  p_tenant_id uuid
) returns setof public.queue_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.queue_jobs;
begin
  select * into v_job from public.queue_jobs where id = p_job_id for update;

  if v_job.id is null then
    return;
  end if;

  -- Cross-tenant recovery is refused outright, not silently ignored.
  if v_job.tenant_id <> p_tenant_id then
    raise exception 'tenant_mismatch';
  end if;

  -- Idempotent: requeuing a job that isn't (or is no longer) DEAD_LETTER is a
  -- no-op that returns its current row rather than an error — a support
  -- operator double-clicking "requeue" must never re-trigger anything.
  if v_job.status <> 'DEAD_LETTER' then
    return query select * from public.queue_jobs where id = p_job_id;
    return;
  end if;

  return query
    update public.queue_jobs
    set status = 'PENDING',
        scheduled_at = now(),
        attempt_count = 0,
        lease_owner = null,
        lease_expires_at = null,
        last_error = coalesce(v_job.last_error, '{}'::jsonb) || jsonb_build_object('manually_requeued_at', now()),
        updated_at = now()
    where id = p_job_id
    returning *;
end;
$$;
revoke all on function queue_internal.requeue_dead_letter_job(uuid, uuid) from public, anon, authenticated;
grant execute on function queue_internal.requeue_dead_letter_job(uuid, uuid) to service_role;

-- Thin public wrapper — same pattern as the rest of packages/queue's RPCs
-- (queue_internal is never exposed to PostgREST regardless, but every
-- exposed entry point still carries its own explicit hardening).
create or replace function public.requeue_dead_letter_job(p_job_id uuid, p_tenant_id uuid)
returns setof public.queue_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from queue_internal.requeue_dead_letter_job(p_job_id, p_tenant_id);
$$;
revoke all on function public.requeue_dead_letter_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.requeue_dead_letter_job(uuid, uuid) to service_role;
