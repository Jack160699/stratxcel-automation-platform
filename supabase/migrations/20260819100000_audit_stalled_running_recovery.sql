-- ==============================================================================
-- Migration: 20260819100000_audit_stalled_running_recovery.sql
-- Description: Closes a real, confirmed-live production gap discovered while
-- proving the connector-to-audit path end to end: when the Vercel worker's
-- HTTP invocation is repeatedly killed by its own 60s execution ceiling
-- while mid-pipeline (e.g. grounded research + report generation together
-- exceed budget for a sparse-public-presence tenant), queue_jobs eventually
-- exhausts max_attempts and lands in DEAD_LETTER -- but nothing reconciles
-- that back to audit_generation_runs.status, which is left permanently at
-- RUNNING with a stale heartbeat. retry_automatic_audit_generation_v1 only
-- accepts status in ('NEEDS_REVIEW', 'FAILED'), so a run in this state has
-- NO recovery path at all: not retryable, and start_automatic_audit_generation_v1
-- won't create a second run for the same (audit_order_id, brand_brain_version).
-- Confirmed live: run 69eb978d-f4f3-481a-8c2c-b30a92327c80 (tenant 2a09001e)
-- stuck exactly this way, retry_automatic_audit_generation_v1 correctly (per
-- the old rule) refused with 'generation_run_not_recoverable'.
--
-- Fix: retry_automatic_audit_generation_v1 now also accepts a RUNNING run
-- when its heartbeat is genuinely stale (> 3 minutes -- well past both the
-- 60s function ceiling and the 25s customer-polling stalled-run watchdog
-- used elsewhere, so a legitimately-still-executing invocation is never
-- mistaken for stuck) AND its current queue job is not itself PENDING or
-- LEASED (i.e. no other invocation could still be holding it). Every other
-- check, the idempotency/recovery-count bookkeeping, and the audit trail are
-- byte-for-byte unchanged.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.retry_automatic_audit_generation_v1(p_run_id uuid, p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_staff public.platform_staff_users;
  v_run public.audit_generation_runs;
  v_order public.audit_orders;
  v_job public.queue_jobs;
  v_next_recovery integer;
  v_key text;
  v_stalled_running boolean;
begin
  select *
  into v_staff
  from public.platform_staff_users
  where user_id = p_actor_user_id
    and is_active = true
    and role in ('platform_owner', 'platform_admin', 'audit_reviewer');
  if not found then
    return jsonb_build_object('success', false, 'reason', 'platform_audit_staff_required');
  end if;

  select *
  into v_run
  from public.audit_generation_runs
  where id = p_run_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'generation_run_not_found');
  end if;

  v_stalled_running := (
    v_run.status = 'RUNNING'
    and v_run.heartbeat_at is not null
    and v_run.heartbeat_at < now() - interval '3 minutes'
    and not exists (
      select 1
      from public.queue_jobs qj
      where qj.id = v_run.current_queue_job_id
        and qj.status in ('PENDING', 'LEASED')
    )
  );

  if v_run.status not in ('NEEDS_REVIEW', 'FAILED') and not v_stalled_running then
    return jsonb_build_object('success', false, 'reason', 'generation_run_not_recoverable', 'status', v_run.status);
  end if;

  select *
  into v_order
  from public.audit_orders
  where id = v_run.audit_order_id
  for update;
  if not found or v_order.tenant_id <> v_run.tenant_id then
    return jsonb_build_object('success', false, 'reason', 'audit_order_not_found_or_tenant_mismatch');
  end if;
  if v_order.status in ('cancelled', 'refunded') then
    return jsonb_build_object('success', false, 'reason', 'audit_cancelled_or_refunded');
  end if;
  if v_order.status <> 'in_review' then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_state', 'status', v_order.status);
  end if;

  v_next_recovery := v_run.recovery_count + 1;
  if v_next_recovery > 5 then
    return jsonb_build_object('success', false, 'reason', 'recovery_limit_reached');
  end if;
  v_key := 'audit.generate_v1:recovery:' || v_run.id::text || ':' || v_next_recovery::text;

  insert into public.queue_jobs (
    tenant_id,
    job_type,
    payload,
    idempotency_key,
    priority,
    max_attempts,
    trace_id,
    correlation_id
  )
  values (
    v_run.tenant_id,
    'audit.generate_v1',
    jsonb_build_object(
      'auditGenerationRunId', v_run.id,
      'auditOrderId', v_run.audit_order_id,
      'brandBrainVersion', v_run.brand_brain_version,
      'recoveryCount', v_next_recovery
    ),
    v_key,
    30,
    v_run.max_attempts,
    v_run.id::text,
    v_run.id::text
  )
  returning * into v_job;

  update public.audit_generation_runs
  set status = 'QUEUED',
      stage = 'QUEUED',
      attempt_count = 0,
      recovery_count = v_next_recovery,
      current_queue_job_id = v_job.id,
      quality_outcome = null,
      quality_score = null,
      confidence_band = null,
      failure_code = null,
      failure_message_safe = null,
      review_required_at = null,
      stage_updated_at = now(),
      updated_at = now()
  where id = v_run.id;

  insert into public.platform_admin_events (
    target_user_id,
    actor_user_id,
    actor_type,
    action,
    metadata
  )
  values (
    v_order.user_id,
    p_actor_user_id,
    'staff_user',
    'retry_automatic_audit_generation',
    jsonb_build_object(
      'audit_order_id', v_order.id,
      'tenant_id', v_order.tenant_id,
      'audit_generation_run_id', v_run.id,
      'recovery_count', v_next_recovery,
      'queue_job_id', v_job.id,
      'staff_role', v_staff.role,
      'recovered_from_stalled_running', v_stalled_running
    )
  );

  return jsonb_build_object(
    'success', true,
    'run_id', v_run.id,
    'queue_job_id', v_job.id,
    'recovery_count', v_next_recovery
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.retry_automatic_audit_generation_v1(uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_automatic_audit_generation_v1(uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
