-- Additive Audit V1 experience: archive pointer, free-eligibility ledger,
-- discovery snapshots, share tokens, delivery events, and promo/product-grant
-- fulfilment for automatic generation. Never deletes financial history.

create table if not exists public.audit_reset_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  reason text not null,
  audit_orders jsonb not null,
  generation_runs jsonb not null,
  promo_redemptions jsonb not null,
  payment_links jsonb not null
);

comment on table public.audit_reset_snapshots is
  'Timestamped JSON snapshots taken before a product-level Audit eligibility reset. Financial rows are copied, never deleted.';

alter table public.audit_reset_snapshots enable row level security;
grant select, insert on public.audit_reset_snapshots to service_role;
revoke all on public.audit_reset_snapshots from public, anon, authenticated;

create table if not exists public.tenant_current_audits (
  tenant_id uuid primary key references public.tenants(id) on delete restrict,
  current_audit_order_id uuid references public.audit_orders(id) on delete restrict,
  previous_audit_order_id uuid references public.audit_orders(id) on delete restrict,
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.tenant_current_audits enable row level security;
grant select, insert, update on public.tenant_current_audits to service_role;
revoke all on public.tenant_current_audits from public, anon, authenticated;

create table if not exists public.audit_free_eligibility_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  event_type text not null check (event_type in ('grant', 'consume', 'reset')),
  grant_id uuid,
  actor_user_id uuid,
  reason text,
  audit_order_id uuid references public.audit_orders(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists audit_free_eligibility_events_tenant_created_idx
  on public.audit_free_eligibility_events (tenant_id, created_at desc);

alter table public.audit_free_eligibility_events enable row level security;
grant select, insert on public.audit_free_eligibility_events to service_role;
revoke all on public.audit_free_eligibility_events from public, anon, authenticated;

create table if not exists public.audit_discovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  audit_order_id uuid not null references public.audit_orders(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  website_url text not null,
  packet jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_discovery_snapshots_order_idx
  on public.audit_discovery_snapshots (audit_order_id, created_at desc);

alter table public.audit_discovery_snapshots enable row level security;
grant select, insert on public.audit_discovery_snapshots to service_role;
revoke all on public.audit_discovery_snapshots from public, anon, authenticated;

create table if not exists public.audit_share_tokens (
  id uuid primary key default gen_random_uuid(),
  audit_order_id uuid not null references public.audit_orders(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid,
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.audit_share_tokens enable row level security;
grant select, insert, update on public.audit_share_tokens to service_role;
revoke all on public.audit_share_tokens from public, anon, authenticated;

create table if not exists public.audit_delivery_events (
  id uuid primary key default gen_random_uuid(),
  audit_order_id uuid not null references public.audit_orders(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  channel text not null check (channel in ('in_app', 'email', 'share', 'pdf', 'whatsapp')),
  status text not null check (status in ('queued', 'sent', 'skipped', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);

alter table public.audit_delivery_events enable row level security;
grant select, insert on public.audit_delivery_events to service_role;
revoke all on public.audit_delivery_events from public, anon, authenticated;

alter table public.audit_orders drop constraint if exists audit_orders_fulfilment_source_check;
alter table public.audit_orders
  add constraint audit_orders_fulfilment_source_check
  check (fulfilment_source is null or fulfilment_source in ('razorpay', 'promo', 'product_grant'));

create or replace function public.enforce_promo_audit_no_subscription_credit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.fulfilment_source in ('promo', 'product_grant') then
    new.credit_eligible_from := null;
    new.credit_expires_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.audit_has_verified_fulfilment(p_order public.audit_orders)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select
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
    );
$$;

revoke all on function public.audit_has_verified_fulfilment(public.audit_orders)
  from public, anon, authenticated;
grant execute on function public.audit_has_verified_fulfilment(public.audit_orders)
  to service_role;

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
  if v_order.audit_fee_cents <> 99900 then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_price');
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

create or replace function public.complete_automatic_audit_generation_v1(
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
  if v_order.audit_fee_cents <> 99900 then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_price');
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


revoke all on function public.complete_automatic_audit_generation_v1(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric
) from public, anon, authenticated;
grant execute on function public.complete_automatic_audit_generation_v1(
  uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb, numeric
) to service_role;

create or replace function public.tenant_has_fresh_audit_grant(p_tenant_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  with latest as (
    select event_type
    from public.audit_free_eligibility_events
    where tenant_id = p_tenant_id
    order by created_at desc, id desc
    limit 1
  )
  select coalesce((select event_type in ('grant', 'reset') from latest), false);
$$;

create or replace function public.reset_audit_product_eligibility_v1(
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff public.platform_staff_users;
  v_snapshot_id uuid;
  v_tenant uuid;
  v_granted integer := 0;
begin
  select * into v_staff
  from public.platform_staff_users
  where user_id = p_actor_user_id
    and is_active = true
    and role in ('platform_owner', 'platform_admin');
  if not found then
    return jsonb_build_object('success', false, 'reason', 'platform_owner_or_admin_required');
  end if;

  insert into public.audit_reset_snapshots (
    actor_user_id,
    reason,
    audit_orders,
    generation_runs,
    promo_redemptions,
    payment_links
  )
  values (
    p_actor_user_id,
    coalesce(nullif(trim(p_reason), ''), 'product_reset'),
    coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from public.audit_orders o), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.audit_generation_runs r), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'tenant_id', p.tenant_id,
      'audit_order_id', p.audit_order_id,
      'customer_email', p.customer_email,
      'redeemed_at', p.redeemed_at
    ) order by p.redeemed_at) from public.promo_redemptions p), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'tenant_id', l.tenant_id,
      'status', l.status,
      'payment_purpose', l.payment_purpose,
      'amount_cents', l.amount_cents,
      'created_at', l.created_at
    ) order by l.created_at) from public.payment_links l where l.payment_purpose = 'audit_fee'), '[]'::jsonb)
  )
  returning id into v_snapshot_id;

  for v_tenant in
    select distinct tenant_id from public.tenant_members
    union
    select distinct tenant_id from public.audit_orders
  loop
    insert into public.tenant_current_audits (tenant_id, current_audit_order_id, previous_audit_order_id, archived_at, updated_at)
    values (v_tenant, null, (select current_audit_order_id from public.tenant_current_audits where tenant_id = v_tenant), now(), now())
    on conflict (tenant_id) do update
      set previous_audit_order_id = coalesce(public.tenant_current_audits.current_audit_order_id, public.tenant_current_audits.previous_audit_order_id),
          current_audit_order_id = null,
          archived_at = now(),
          updated_at = now();

    insert into public.audit_free_eligibility_events (tenant_id, event_type, actor_user_id, reason)
    values (v_tenant, 'reset', p_actor_user_id, coalesce(nullif(trim(p_reason), ''), 'product_reset'));
    v_granted := v_granted + 1;
  end loop;

  insert into public.platform_admin_events (target_user_id, actor_user_id, actor_type, action, metadata)
  values (
    p_actor_user_id,
    p_actor_user_id,
    'staff',
    'reset_audit_product_eligibility',
    jsonb_build_object('snapshot_id', v_snapshot_id, 'tenants_granted', v_granted)
  );

  return jsonb_build_object('success', true, 'snapshot_id', v_snapshot_id, 'tenants_granted', v_granted);
end;
$$;

revoke all on function public.reset_audit_product_eligibility_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_audit_product_eligibility_v1(uuid, text) to service_role;

create or replace function public.claim_fresh_product_grant_audit_v1(
  p_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member boolean;
  v_order public.audit_orders;
  v_grant_id uuid;
begin
  if p_tenant_id is null or p_actor_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_tenant_or_actor');
  end if;
  select exists (
    select 1 from public.tenant_members
    where tenant_id = p_tenant_id and user_id = p_actor_user_id
  ) into v_member;
  if not v_member then
    return jsonb_build_object('success', false, 'reason', 'tenant_membership_required');
  end if;

  select * into v_order
  from public.audit_orders
  where id = (
    select current_audit_order_id
    from public.tenant_current_audits
    where tenant_id = p_tenant_id
  )
    and status in ('paid', 'in_review')
    and fulfilment_source in ('product_grant', 'promo')
  for update;
  if found then
    return jsonb_build_object('success', true, 'audit_order_id', v_order.id, 'reused', true);
  end if;

  if not public.tenant_has_fresh_audit_grant(p_tenant_id) then
    return jsonb_build_object('success', false, 'reason', 'fresh_audit_grant_required');
  end if;

  insert into public.audit_orders (
    tenant_id,
    user_id,
    business_name,
    audit_fee_cents,
    status,
    fulfilment_source,
    list_price_cents,
    discount_cents,
    actual_paid_cents,
    deep_dive_answers
  ) values (
    p_tenant_id,
    p_actor_user_id,
    'Pending — completed in intake',
    99900,
    'paid',
    'product_grant',
    99900,
    99900,
    0,
    jsonb_build_object('intakeMeta', jsonb_build_object('questionnaireVersion', 'connect_discover_v1'))
  )
  returning * into v_order;

  insert into public.audit_free_eligibility_events (tenant_id, event_type, actor_user_id, reason, audit_order_id)
  values (p_tenant_id, 'consume', p_actor_user_id, 'fresh_product_grant', v_order.id)
  returning id into v_grant_id;

  insert into public.tenant_current_audits (tenant_id, current_audit_order_id, updated_at)
  values (p_tenant_id, v_order.id, now())
  on conflict (tenant_id) do update
    set previous_audit_order_id = coalesce(public.tenant_current_audits.current_audit_order_id, public.tenant_current_audits.previous_audit_order_id),
        current_audit_order_id = excluded.current_audit_order_id,
        updated_at = now();

  return jsonb_build_object('success', true, 'audit_order_id', v_order.id, 'reused', false, 'eligibility_event_id', v_grant_id);
end;
$$;

revoke all on function public.claim_fresh_product_grant_audit_v1(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_fresh_product_grant_audit_v1(uuid, uuid) to service_role;
revoke all on function public.tenant_has_fresh_audit_grant(uuid) from public, anon, authenticated;
grant execute on function public.tenant_has_fresh_audit_grant(uuid) to service_role;
