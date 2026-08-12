-- Automatic Audit Engine V1.
--
-- Additive only: audit_orders remains the commercial/payment source of truth,
-- the staff completion RPC v5 is intentionally untouched, and automation gets
-- a separate service-role-only enqueue/completion path.

create table public.audit_generation_runs (
  id uuid primary key default gen_random_uuid(),
  audit_order_id uuid not null references public.audit_orders(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  brand_brain_version integer not null check (brand_brain_version > 0),
  status text not null default 'QUEUED' check (status in (
    'QUEUED', 'RUNNING', 'NEEDS_REVIEW', 'COMPLETED', 'STOPPED', 'FAILED'
  )),
  stage text not null default 'QUEUED' check (stage in (
    'QUEUED', 'RESEARCH', 'ANALYSIS', 'QUALITY_GATE', 'DELIVERY',
    'COMPLETE', 'REVIEW', 'STOPPED'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  recovery_count integer not null default 0 check (recovery_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  current_queue_job_id uuid references public.queue_jobs(id) on delete set null,
  research_data jsonb not null default '{}'::jsonb,
  report_data jsonb,
  evidence_artifact_refs jsonb not null default '[]'::jsonb,
  ai_receipts jsonb not null default '[]'::jsonb,
  quality_outcome text check (quality_outcome in (
    'PASS', 'LOW_CONFIDENCE', 'INSUFFICIENT_EVIDENCE',
    'GENERATION_FAILED', 'RESEARCH_FAILED'
  )),
  quality_score numeric(5,4) check (quality_score is null or (quality_score >= 0 and quality_score <= 1)),
  confidence_band text check (confidence_band in ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN')),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  budget_limit_usd numeric(12,6) not null default 1.500000 check (budget_limit_usd > 0),
  generation_method text not null default 'automatic_audit_v1',
  failure_code text,
  failure_message_safe text,
  started_at timestamptz,
  stage_updated_at timestamptz not null default now(),
  review_required_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_order_id, brand_brain_version)
);

comment on table public.audit_generation_runs is
  'Durable operational state for the automatic Audit engine. audit_orders remains commercial truth.';
comment on column public.audit_generation_runs.evidence_artifact_refs is
  'Bounded provider-neutral evidence/source receipt references; never full fetched pages.';
comment on column public.audit_generation_runs.ai_receipts is
  'Provider/model/usage/selection receipts without prompts, secrets, or chain-of-thought.';

alter table public.audit_generation_runs enable row level security;
revoke all on public.audit_generation_runs from public, anon, authenticated;
grant select, insert, update, delete on public.audit_generation_runs to service_role;

-- Deliberately no authenticated policy or table grant. Draft research,
-- provider receipts, and failed report material are operational data. The
-- authenticated customer route resolves membership first, then returns only
-- a safe status projection through the service-role client.

create index audit_generation_runs_tenant_created_idx
  on public.audit_generation_runs (tenant_id, created_at desc);
create index audit_generation_runs_order_idx
  on public.audit_generation_runs (audit_order_id);
create index audit_generation_runs_queue_job_idx
  on public.audit_generation_runs (current_queue_job_id)
  where current_queue_job_id is not null;
create index audit_generation_runs_review_queue_idx
  on public.audit_generation_runs (stage_updated_at, created_at)
  where status in ('NEEDS_REVIEW', 'FAILED');

-- A paid Audit + Brand Brain version is a permanent logical event. Unlike the
-- queue's active-only default, a redelivery after SUCCEEDED must still resolve
-- to the original job and run.
create unique index queue_jobs_audit_generation_idempotency_idx
  on public.queue_jobs (tenant_id, job_type, idempotency_key)
  where job_type = 'audit.generate_v1'
    and idempotency_key is not null;

create or replace function public.start_automatic_audit_generation_v1(
  p_audit_order_id uuid,
  p_expected_tenant_id uuid,
  p_brand_brain_version integer,
  p_budget_limit_usd numeric default 1.500000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.audit_orders;
  v_run public.audit_generation_runs;
  v_job public.queue_jobs;
  v_key text;
begin
  if p_audit_order_id is null or p_expected_tenant_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_order_or_tenant');
  end if;
  if p_brand_brain_version is null or p_brand_brain_version < 1 then
    return jsonb_build_object('success', false, 'reason', 'invalid_brand_brain_version');
  end if;
  if p_budget_limit_usd is null or p_budget_limit_usd <= 0 or p_budget_limit_usd > 5 then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_budget');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'audit.generate_v1:' || p_audit_order_id::text || ':' || p_brand_brain_version::text,
    0
  ));

  select *
  into v_order
  from public.audit_orders
  where id = p_audit_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'audit_order_not_found');
  end if;
  if v_order.tenant_id <> p_expected_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;
  if v_order.status in ('cancelled', 'refunded') then
    return jsonb_build_object('success', false, 'reason', 'audit_cancelled_or_refunded');
  end if;
  if v_order.status = 'completed' then
    select * into v_run
    from public.audit_generation_runs
    where audit_order_id = p_audit_order_id
      and brand_brain_version = p_brand_brain_version;
    return jsonb_build_object(
      'success', v_run.id is not null,
      'already_completed', true,
      'reason', case when v_run.id is null then 'completed_without_generation_run' else null end,
      'run_id', v_run.id,
      'queue_job_id', v_run.current_queue_job_id
    );
  end if;
  if v_order.status not in ('paid', 'in_review') then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_state', 'status', v_order.status);
  end if;
  if v_order.audit_fee_cents <> 99900 then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_price');
  end if;
  if not exists (
    select 1
    from public.payment_links link
    where link.id = v_order.payment_link_id
      and link.tenant_id = v_order.tenant_id
      and link.payment_purpose = 'audit_fee'
      and link.status = 'paid'
  ) then
    return jsonb_build_object('success', false, 'reason', 'verified_audit_payment_required');
  end if;
  if not exists (
    select 1
    from public.brand_brains head
    join public.brand_brain_versions brain
      on brain.tenant_id = head.tenant_id
     and brain.version = head.current_version
    where head.tenant_id = v_order.tenant_id
      and head.current_version = p_brand_brain_version
  ) then
    return jsonb_build_object('success', false, 'reason', 'current_brand_brain_version_required');
  end if;

  insert into public.audit_generation_runs (
    audit_order_id,
    tenant_id,
    brand_brain_version,
    budget_limit_usd
  )
  values (
    p_audit_order_id,
    p_expected_tenant_id,
    p_brand_brain_version,
    p_budget_limit_usd
  )
  on conflict (audit_order_id, brand_brain_version) do nothing;

  select *
  into v_run
  from public.audit_generation_runs
  where audit_order_id = p_audit_order_id
    and brand_brain_version = p_brand_brain_version
  for update;

  v_key := 'audit.generate_v1:' || p_audit_order_id::text || ':' || p_brand_brain_version::text;

  select *
  into v_job
  from public.queue_jobs
  where tenant_id = p_expected_tenant_id
    and job_type = 'audit.generate_v1'
    and idempotency_key = v_key
  limit 1;

  if v_job.id is null then
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
      p_expected_tenant_id,
      'audit.generate_v1',
      jsonb_build_object(
        'auditGenerationRunId', v_run.id,
        'auditOrderId', p_audit_order_id,
        'brandBrainVersion', p_brand_brain_version
      ),
      v_key,
      40,
      v_run.max_attempts,
      v_run.id::text,
      v_run.id::text
    )
    returning * into v_job;
  end if;

  update public.audit_generation_runs
  set current_queue_job_id = v_job.id,
      updated_at = now()
  where id = v_run.id;

  update public.audit_orders
  set status = 'in_review',
      updated_at = now()
  where id = p_audit_order_id
    and status = 'paid';

  return jsonb_build_object(
    'success', true,
    'run_id', v_run.id,
    'queue_job_id', v_job.id,
    'reused', v_run.created_at < statement_timestamp()
  );
end;
$$;

revoke all on function public.start_automatic_audit_generation_v1(uuid, uuid, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.start_automatic_audit_generation_v1(uuid, uuid, integer, numeric)
  to service_role;

create or replace function public.complete_automatic_audit_generation_v1(
  p_run_id uuid,
  p_expected_tenant_id uuid,
  p_report_data jsonb,
  p_research_data jsonb,
  p_evidence_artifact_refs jsonb,
  p_ai_receipts jsonb,
  p_quality_score numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.audit_generation_runs;
  v_order public.audit_orders;
begin
  select *
  into v_run
  from public.audit_generation_runs
  where id = p_run_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'generation_run_not_found');
  end if;
  if v_run.tenant_id <> p_expected_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  select *
  into v_order
  from public.audit_orders
  where id = v_run.audit_order_id
  for update;

  if not found or v_order.tenant_id <> p_expected_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'audit_order_not_found_or_tenant_mismatch');
  end if;
  if v_run.status = 'COMPLETED' and v_order.status = 'completed' then
    return jsonb_build_object(
      'success', true,
      'already_completed', true,
      'audit_order_id', v_order.id,
      'run_id', v_run.id,
      'credit_expires_at', v_order.credit_expires_at,
      'credit_amount_cents', v_order.audit_fee_cents
    );
  end if;
  if v_order.status in ('cancelled', 'refunded') then
    return jsonb_build_object('success', false, 'reason', 'audit_cancelled_or_refunded');
  end if;
  if v_order.status <> 'in_review' then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_state', 'status', v_order.status);
  end if;
  if v_order.audit_fee_cents <> 99900 then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_price');
  end if;
  if not exists (
    select 1
    from public.payment_links link
    where link.id = v_order.payment_link_id
      and link.tenant_id = v_order.tenant_id
      and link.payment_purpose = 'audit_fee'
      and link.status = 'paid'
  ) then
    return jsonb_build_object('success', false, 'reason', 'verified_audit_payment_required');
  end if;
  if not exists (
    select 1
    from public.brand_brain_versions brain
    where brain.tenant_id = v_order.tenant_id
      and brain.version = v_run.brand_brain_version
  ) then
    return jsonb_build_object('success', false, 'reason', 'brand_brain_version_not_found');
  end if;
  if p_report_data is null
    or jsonb_typeof(p_report_data) <> 'object'
    or length(trim(coalesce(p_report_data->>'executiveSummary', ''))) = 0
    or jsonb_typeof(p_report_data->'priorityRisks') <> 'array'
    or jsonb_array_length(p_report_data->'priorityRisks') = 0
    or jsonb_typeof(p_report_data->'actionPlan') <> 'array'
    or jsonb_array_length(p_report_data->'actionPlan') = 0 then
    return jsonb_build_object('success', false, 'reason', 'valid_report_required');
  end if;
  if p_research_data is null or jsonb_typeof(p_research_data) <> 'object' then
    return jsonb_build_object('success', false, 'reason', 'research_data_required');
  end if;
  if p_evidence_artifact_refs is null
    or jsonb_typeof(p_evidence_artifact_refs) <> 'array'
    or jsonb_array_length(p_evidence_artifact_refs) = 0 then
    return jsonb_build_object('success', false, 'reason', 'evidence_required');
  end if;
  if p_ai_receipts is null or jsonb_typeof(p_ai_receipts) <> 'array' then
    return jsonb_build_object('success', false, 'reason', 'ai_receipts_required');
  end if;
  if p_quality_score is null or p_quality_score < 0.80 or p_quality_score > 1 then
    return jsonb_build_object('success', false, 'reason', 'quality_pass_required');
  end if;

  -- The pre-existing report-delivery trigger is deliberately left in place;
  -- this update must pass it just like staff completion does.
  update public.audit_orders
  set report_data = p_report_data,
      status = 'completed',
      completed_by = null,
      audit_completed_at = coalesce(audit_completed_at, now()),
      delivered_at = coalesce(delivered_at, now()),
      credit_eligible_from = coalesce(credit_eligible_from, now()),
      credit_expires_at = coalesce(credit_expires_at, now() + interval '7 days'),
      updated_at = now()
  where id = v_order.id;

  update public.audit_generation_runs
  set status = 'COMPLETED',
      stage = 'COMPLETE',
      research_data = p_research_data,
      report_data = p_report_data,
      evidence_artifact_refs = p_evidence_artifact_refs,
      ai_receipts = p_ai_receipts,
      quality_outcome = 'PASS',
      quality_score = p_quality_score,
      confidence_band = case when p_quality_score >= 0.90 then 'HIGH' else 'MEDIUM' end,
      delivered_at = coalesce(delivered_at, now()),
      completed_at = coalesce(completed_at, now()),
      stage_updated_at = now(),
      failure_code = null,
      failure_message_safe = null,
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
    null,
    'system',
    'complete_audit_automatic',
    jsonb_build_object(
      'audit_order_id', v_order.id,
      'tenant_id', v_order.tenant_id,
      'audit_generation_run_id', v_run.id,
      'brand_brain_version', v_run.brand_brain_version,
      'generation_method', v_run.generation_method,
      'quality_outcome', 'PASS',
      'quality_score', p_quality_score,
      'fee_cents', v_order.audit_fee_cents
    )
  );

  return jsonb_build_object(
    'success', true,
    'already_completed', false,
    'audit_order_id', v_order.id,
    'run_id', v_run.id,
    'completed_by', null,
    'credit_expires_at', coalesce(v_order.credit_expires_at, now() + interval '7 days'),
    'credit_amount_cents', v_order.audit_fee_cents
  );
end;
$$;

revoke all on function public.complete_automatic_audit_generation_v1(
  uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric
) from public, anon, authenticated;
grant execute on function public.complete_automatic_audit_generation_v1(
  uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric
) to service_role;

create or replace function public.retry_automatic_audit_generation_v1(
  p_run_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.platform_staff_users;
  v_run public.audit_generation_runs;
  v_order public.audit_orders;
  v_job public.queue_jobs;
  v_next_recovery integer;
  v_key text;
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
  if v_run.status not in ('NEEDS_REVIEW', 'FAILED') then
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
      'staff_role', v_staff.role
    )
  );

  return jsonb_build_object(
    'success', true,
    'run_id', v_run.id,
    'queue_job_id', v_job.id,
    'recovery_count', v_next_recovery
  );
end;
$$;

revoke all on function public.retry_automatic_audit_generation_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.retry_automatic_audit_generation_v1(uuid, uuid)
  to service_role;
