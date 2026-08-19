-- ==============================================================================
-- Migration: 20260819080000_free_audit_price_check_repair.sql
-- Description: Repairs a real, currently-live defect discovered during
-- production audit-engine connector verification: 20260815230000_free_audit_by_default.sql
-- made claim_fresh_product_grant_audit_v1 create genuinely free audit orders
-- (audit_fee_cents = 0, list_price_cents = 0, discount_cents = 0,
-- fulfilment_source = 'product_grant') as the default product model, but never
-- updated the three RPCs that gate audit generation on the OLD ₹999 model --
-- audit_has_verified_fulfilment, start_automatic_audit_generation_v1, and
-- complete_automatic_audit_generation_v1 -- all still hard-required
-- audit_fee_cents = 99900. Every free-by-default order is therefore
-- permanently rejected with 'invalid_audit_price' and can never generate a
-- report. Confirmed live in production (project uccqlgeghkwzujeeymua): every
-- order with audit_fee_cents = 0 is stuck at status = 'in_review' with zero
-- audit_generation_runs rows; every order with audit_fee_cents = 99900
-- successfully reached COMPLETED.
--
-- Fix: audit_has_verified_fulfilment now recognizes two legitimate,
-- independently well-defined fulfilment shapes -- (1) the free-by-default
-- model: a genuinely zero-priced product_grant order with nothing charged,
-- or (2) the legacy formally-priced model: a ₹999 order waived via promo/
-- grant or paid for real through a verified payment link. The two RPCs'
-- redundant standalone `audit_fee_cents <> 99900` checks are removed --
-- audit_has_verified_fulfilment already re-validates the exact same
-- audit_fee_cents value as part of its own condition, so removing the
-- earlier duplicate check loses no validation coverage; it only stops
-- unconditionally rejecting the free-by-default model before that real
-- check is even reached. No RLS/security/tenant-isolation logic touched.
-- ==============================================================================

-- 1. audit_has_verified_fulfilment: accept both models.
CREATE OR REPLACE FUNCTION public.audit_has_verified_fulfilment(p_order public.audit_orders)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  select
    (
      -- Free-by-default model (2026-08-15+): a genuinely zero-priced order,
      -- granted via the tenant's free audit, with nothing actually charged.
      p_order.audit_fee_cents = 0
      and p_order.fulfilment_source = 'product_grant'
      and coalesce(p_order.list_price_cents, 0) = 0
      and coalesce(p_order.discount_cents, 0) = 0
      and coalesce(p_order.actual_paid_cents, 0) = 0
    )
    or
    (
      -- Legacy paid-audit model: a formally-priced order waived via promo/
      -- grant, or paid for real through a verified payment link.
      p_order.audit_fee_cents = 99900
      and (
        (
          p_order.fulfilment_source in ('promo', 'product_grant')
          and coalesce(p_order.actual_paid_cents, 0) = 0
        )
        or exists (
          select 1
          from public.payment_links link
          where link.id = p_order.payment_link_id
            and link.tenant_id = p_order.tenant_id
            and link.payment_purpose = 'audit_fee'
            and link.status = 'paid'
        )
      )
    );
$$;

-- 2. start_automatic_audit_generation_v1: drop the redundant standalone
--    price gate; audit_has_verified_fulfilment (called immediately after)
--    already re-validates audit_fee_cents as part of a real fulfilment check.
CREATE OR REPLACE FUNCTION public.start_automatic_audit_generation_v1(
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

  select * into v_order from public.audit_orders where id = p_audit_order_id for update;
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
  if not public.audit_has_verified_fulfilment(v_order) then
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
    audit_order_id, tenant_id, brand_brain_version, budget_limit_usd
  ) values (
    p_audit_order_id, p_expected_tenant_id, p_brand_brain_version, p_budget_limit_usd
  )
  on conflict (audit_order_id, brand_brain_version) do nothing;

  select * into v_run
  from public.audit_generation_runs
  where audit_order_id = p_audit_order_id
    and brand_brain_version = p_brand_brain_version
  for update;

  v_key := 'audit.generate_v1:' || p_audit_order_id::text || ':' || p_brand_brain_version::text;

  select * into v_job
  from public.queue_jobs
  where tenant_id = p_expected_tenant_id
    and job_type = 'audit.generate_v1'
    and idempotency_key = v_key
  limit 1;

  if v_job.id is null then
    insert into public.queue_jobs (
      tenant_id, job_type, payload, idempotency_key, priority, max_attempts, trace_id, correlation_id
    ) values (
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
  set current_queue_job_id = v_job.id, updated_at = now()
  where id = v_run.id;

  update public.audit_orders
  set status = 'in_review', updated_at = now()
  where id = p_audit_order_id and status = 'paid';

  return jsonb_build_object(
    'success', true,
    'run_id', v_run.id,
    'queue_job_id', v_job.id,
    'reused', v_run.created_at < statement_timestamp()
  );
end;
$$;

-- 3. complete_automatic_audit_generation_v1: same redundant-gate removal.
CREATE OR REPLACE FUNCTION public.complete_automatic_audit_generation_v1(
  p_run_id uuid,
  p_expected_tenant_id uuid,
  p_audit_order_id uuid,
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
  v_source_ids text[] := '{}';
  v_unknown_citation text;
begin
  if p_run_id is null or p_expected_tenant_id is null or p_audit_order_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_run_order_or_tenant');
  end if;

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
  if v_run.audit_order_id <> p_audit_order_id then
    return jsonb_build_object('success', false, 'reason', 'audit_order_mismatch');
  end if;

  select *
  into v_order
  from public.audit_orders
  where id = p_audit_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'audit_order_not_found');
  end if;
  if v_order.tenant_id <> p_expected_tenant_id
    or v_order.tenant_id <> v_run.tenant_id
    or v_order.id <> v_run.audit_order_id then
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
  if not public.audit_has_verified_fulfilment(v_order) then
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
  if v_run.quality_outcome is not null and v_run.quality_outcome <> 'PASS' then
    return jsonb_build_object('success', false, 'reason', 'quality_pass_required');
  end if;
  if p_quality_score is null or p_quality_score < 0.80 or p_quality_score > 1 then
    return jsonb_build_object('success', false, 'reason', 'quality_pass_required');
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
  if jsonb_typeof(p_research_data->'sources') <> 'array' then
    return jsonb_build_object('success', false, 'reason', 'research_sources_required');
  end if;
  if p_evidence_artifact_refs is null or jsonb_typeof(p_evidence_artifact_refs) <> 'array' then
    return jsonb_build_object('success', false, 'reason', 'evidence_required');
  end if;
  if p_ai_receipts is null or jsonb_typeof(p_ai_receipts) <> 'array' then
    return jsonb_build_object('success', false, 'reason', 'ai_receipts_required');
  end if;

  select coalesce(array_agg(distinct src->>'id'), '{}')
  into v_source_ids
  from jsonb_array_elements(p_research_data->'sources') src
  where nullif(trim(coalesce(src->>'id', '')), '') is not null;

  select eid
  into v_unknown_citation
  from (
    select jsonb_array_elements_text(coalesce(finding->'evidenceSourceIds', '[]'::jsonb)) as eid
    from jsonb_array_elements(coalesce(p_report_data->'findings', '[]'::jsonb)) finding
    union all
    select jsonb_array_elements_text(coalesce(opportunity->'evidenceSourceIds', '[]'::jsonb)) as eid
    from jsonb_array_elements(coalesce(p_report_data->'opportunities', '[]'::jsonb)) opportunity
    union all
    select jsonb_array_elements_text(coalesce(category.value->'evidenceSourceIds', '[]'::jsonb)) as eid
    from jsonb_each(coalesce(p_report_data->'categoryScores', '{}'::jsonb)) category
  ) citations
  where nullif(trim(eid), '') is not null
    and not (eid = any (v_source_ids))
  limit 1;

  if v_unknown_citation is not null then
    return jsonb_build_object(
      'success', false,
      'reason', 'unknown_report_citation',
      'citation_id', v_unknown_citation
    );
  end if;

  -- The pre-existing report-delivery trigger is deliberately left in place;
  -- this update must pass it just like staff completion does.
  -- Persist the exact submitted report payload (no rewrite).
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
    'complete_automated_audit',
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

REVOKE ALL ON FUNCTION public.start_automatic_audit_generation_v1(uuid, uuid, integer, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_automatic_audit_generation_v1(uuid, uuid, integer, numeric)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_automatic_audit_generation_v1(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_automatic_audit_generation_v1(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric)
  TO service_role;

REVOKE ALL ON FUNCTION public.audit_has_verified_fulfilment(public.audit_orders)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_has_verified_fulfilment(public.audit_orders)
  TO service_role;

NOTIFY pgrst, 'reload schema';
