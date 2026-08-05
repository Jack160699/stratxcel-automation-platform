-- Migration: Canonical Entitlements, Pending Date Fixes, Audit Completion Lifecycle, and Transactional RPCs v3

-- ============================================================
-- 1. CANONICAL ENTITLEMENTS — Deduplicate and Add Unique Constraint
-- ============================================================

-- Repair duplicates by keeping the row with highest limit_amount and current_usage per (tenant_id, metric)
delete from usage_entitlements a
using usage_entitlements b
where a.tenant_id = b.tenant_id
  and a.metric = b.metric
  and (
    a.limit_amount < b.limit_amount
    or (a.limit_amount = b.limit_amount and a.current_usage < b.current_usage)
    or (a.limit_amount = b.limit_amount and a.current_usage = b.current_usage and a.id < b.id)
  );

-- Add strict unique constraint on (tenant_id, metric)
alter table usage_entitlements drop constraint if exists usage_entitlements_tenant_metric_key;
alter table usage_entitlements add constraint usage_entitlements_tenant_metric_key unique (tenant_id, metric);

-- ============================================================
-- 2. SUBSCRIPTIONS — Pending Dates and Paid Months Fix
-- ============================================================

alter table subscriptions
  alter column current_period_start drop not null,
  alter column current_period_start set default null,
  alter column current_period_end drop not null,
  alter column current_period_end set default null,
  alter column paid_months_count set default 0;

-- Reset unpaid pending subscriptions to null dates & 0 paid months
update subscriptions
set current_period_start = null,
    current_period_end = null,
    paid_months_count = 0,
    activated_at = null,
    entitlements_granted_at = null
where status = 'pending_payment';

-- ============================================================
-- 3. AUDIT ORDERS — Completion & Delivery Lifecycle Columns
-- ============================================================

alter table audit_orders
  add column if not exists audit_completed_at timestamptz,
  add column if not exists audit_delivered_at timestamptz,
  add column if not exists credit_eligible_from timestamptz;

alter table audit_orders
  alter column credit_expires_at drop default,
  alter column credit_expires_at drop not null;

-- Function: Complete audit & issue subscription credit (starts 7-day credit window ONLY upon audit completion)
create or replace function public.complete_audit_and_issue_subscription_credit(
  p_audit_order_id uuid,
  p_admin_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit record;
begin
  select * into v_audit
  from audit_orders
  where id = p_audit_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'audit_order_not_found');
  end if;

  if v_audit.status <> 'paid' and v_audit.status <> 'in_review' then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_status', 'status', v_audit.status);
  end if;

  -- Idempotent check
  if v_audit.audit_completed_at is not null and v_audit.credit_expires_at is not null then
    return jsonb_build_object(
      'success', true,
      'already_completed', true,
      'credit_expires_at', v_audit.credit_expires_at,
      'credit_amount_cents', v_audit.audit_fee_cents
    );
  end if;

  update audit_orders
  set status = 'completed',
      audit_completed_at = coalesce(audit_completed_at, now()),
      audit_delivered_at = coalesce(audit_delivered_at, now()),
      credit_eligible_from = coalesce(credit_eligible_from, now()),
      credit_expires_at = coalesce(credit_expires_at, now() + interval '7 days'),
      updated_at = now()
  where id = p_audit_order_id;

  return jsonb_build_object(
    'success', true,
    'already_completed', false,
    'credit_expires_at', now() + interval '7 days',
    'credit_amount_cents', v_audit.audit_fee_cents
  );
end;
$$;

grant execute on function complete_audit_and_issue_subscription_credit to authenticated;
grant execute on function complete_audit_and_issue_subscription_credit to service_role;

-- ============================================================
-- 4. PAYMENT ORDERS — Provider Actual Data Columns
-- ============================================================

alter table payment_orders
  add column if not exists provider_amount_cents bigint,
  add column if not exists provider_currency text,
  add column if not exists provider_status text,
  add column if not exists provider_captured_at timestamptz,
  add column if not exists provider_event_id text;

-- ============================================================
-- 5. ATOMIC SUBSCRIPTION FULFILMENT V3 (Exact Price Revalidation)
-- ============================================================

create or replace function public.fulfill_subscription_payment_v3(
  p_payment_link_id text,
  p_provider_payment_id text,
  p_tenant_id uuid,
  p_actual_amount_cents bigint,
  p_actual_currency text,
  p_provider_status text,
  p_captured boolean,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_sub record;
  v_audit record;
  v_base_price bigint;
  v_credit_amount bigint := 0;
  v_expected_price bigint;
  v_credit_valid boolean := false;
  v_plan_tier text;
  v_metrics text[] := array['social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance'];
  v_limits_launch int[] := array[12, 1, 500, 0];
  v_limits_growth int[] := array[30, 2, 2500, 1];
  v_limits_custom int[] := array[60, 4, 10000, 1];
  v_limits int[];
  v_metric text;
  v_limit_val int;
  v_i int;
begin
  -- Validate provider status & captured flag
  if not p_captured or (lower(p_provider_status) <> 'captured' and lower(p_provider_status) <> 'paid') then
    return jsonb_build_object('fulfilled', false, 'reason', 'provider_payment_not_captured', 'status', p_provider_status);
  end if;

  -- Lock payment link
  select * into v_link from payment_links where id = p_payment_link_id for update;
  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found');
  end if;

  if v_link.tenant_id <> p_tenant_id then
    return jsonb_build_object('fulfilled', false, 'reason', 'tenant_mismatch');
  end if;

  if v_link.payment_purpose <> 'subscription_payment' then
    return jsonb_build_object('fulfilled', false, 'reason', 'purpose_mismatch');
  end if;

  -- Update link status & provider payment ID
  update payment_links
  set status = 'paid',
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      updated_at = now()
  where id = p_payment_link_id and status <> 'paid';

  -- Lock subscription
  select * into v_sub from subscriptions where payment_link_id = p_payment_link_id for update;
  if not found then
    select * into v_sub from subscriptions where id::text = v_link.reference_id for update;
  end if;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_found');
  end if;

  -- Idempotent check
  if v_sub.status = 'active' and v_sub.fulfilment_status = 'fulfilled' then
    return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'subscription_id', v_sub.id);
  end if;

  v_plan_tier := v_sub.plan_tier;

  -- Base plan prices (cents)
  if v_plan_tier = 'launch' then v_base_price := 949900; v_limits := v_limits_launch;
  elsif v_plan_tier = 'growth' then v_base_price := 1899900; v_limits := v_limits_growth;
  elsif v_plan_tier = 'custom_growth' then v_base_price := 2399900; v_limits := v_limits_custom;
  else
    return jsonb_build_object('fulfilled', false, 'reason', 'unknown_plan_tier', 'plan_tier', v_plan_tier);
  end if;

  -- Recheck audit credit inside transaction
  if v_sub.audit_order_id is not null then
    select * into v_audit from audit_orders where id = v_sub.audit_order_id for update;
    if found then
      if v_audit.status = 'paid' or v_audit.status = 'completed' then
        if v_audit.audit_completed_at is not null and v_audit.credit_expires_at > now() and v_audit.credit_consumed_at is null then
          v_credit_valid := true;
          v_credit_amount := coalesce(v_audit.audit_fee_cents, 99900);
        end if;
      end if;
    end if;
  end if;

  v_expected_price := greatest(0::bigint, v_base_price - v_credit_amount);

  -- STRICT PRICE & CURRENCY MATCH AGAINST ACTUAL PROVIDER DATA
  if p_actual_amount_cents <> v_expected_price or upper(p_actual_currency) <> upper(v_link.currency) then
    -- Record durable reconciliation issue
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, link_id, order_id, tenant_id, purpose,
      expected_amount_cents, received_amount_cents, expected_currency, received_currency,
      failure_reason, resolution_status
    )
    values (
      p_provider_event_id, p_provider_payment_id, p_payment_link_id, null, p_tenant_id, 'subscription_payment',
      v_expected_price, p_actual_amount_cents, upper(v_link.currency), upper(p_actual_currency),
      case when p_actual_amount_cents < v_expected_price then 'amount_mismatch_underpaid' else 'amount_mismatch_overpaid' end,
      'open'
    );

    update subscriptions
    set status = 'reconciliation_required',
        fulfilment_status = 'reconciliation_required',
        updated_at = now()
    where id = v_sub.id;

    return jsonb_build_object(
      'fulfilled', false,
      'reason', 'amount_or_currency_mismatch',
      'expected_amount_cents', v_expected_price,
      'received_amount_cents', p_actual_amount_cents,
      'credit_valid', v_credit_valid
    );
  end if;

  -- ACTIVATE SUBSCRIPTION
  update subscriptions
  set status = 'active',
      activated_at = now(),
      current_period_start = now(),
      current_period_end = now() + interval '30 days',
      paid_months_count = coalesce(paid_months_count, 0) + 1,
      fulfilment_status = 'fulfilled',
      entitlements_granted_at = now(),
      updated_at = now()
  where id = v_sub.id;

  -- Consume valid audit credit
  if v_credit_valid and v_sub.audit_order_id is not null then
    update audit_orders
    set credit_consumed_at = now(),
        credit_consumed_subscription_id = v_sub.id,
        credited_towards_subscription_id = v_sub.id,
        updated_at = now()
    where id = v_sub.audit_order_id;
  end if;

  -- Grant usage entitlements into canonical unique (tenant_id, metric) row
  for v_i in 1..array_length(v_metrics, 1) loop
    v_metric := v_metrics[v_i];
    v_limit_val := v_limits[v_i];

    if v_limit_val > 0 then
      insert into usage_entitlements (tenant_id, subscription_id, metric, limit_amount, current_usage)
      values (p_tenant_id, v_sub.id, v_metric, v_limit_val, 0)
      on conflict (tenant_id, metric)
      do update set
        limit_amount = excluded.limit_amount,
        subscription_id = excluded.subscription_id,
        is_paused = false,
        notification_sent_100 = false,
        updated_at = now();

      insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
      values (p_tenant_id, v_sub.id, v_metric, v_limit_val, 'subscription_activation', 'subscription', v_sub.id::text)
      on conflict (tenant_id, reference_type, reference_id, metric)
        where reference_type is not null and reference_id is not null
        do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'fulfilled', true,
    'already_fulfilled', false,
    'subscription_id', v_sub.id,
    'tenant_id', v_sub.tenant_id,
    'plan_tier', v_plan_tier,
    'credit_consumed', v_credit_valid
  );
end;
$$;

grant execute on function fulfill_subscription_payment_v3 to service_role;

-- ============================================================
-- 6. ATOMIC CONTINUATION PACK FULFILMENT V3
-- ============================================================

create or replace function public.fulfill_continuation_pack_payment_v3(
  p_payment_link_id text,
  p_tenant_id uuid,
  p_actual_amount_cents bigint,
  p_actual_currency text,
  p_captured boolean,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_pack record;
begin
  if not p_captured then
    return jsonb_build_object('fulfilled', false, 'reason', 'provider_payment_not_captured');
  end if;

  select * into v_link from payment_links where id = p_payment_link_id for update;
  if not found then return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found'); end if;

  if v_link.tenant_id <> p_tenant_id then return jsonb_build_object('fulfilled', false, 'reason', 'tenant_mismatch'); end if;
  if v_link.payment_purpose <> 'continuation_pack' then return jsonb_build_object('fulfilled', false, 'reason', 'purpose_mismatch'); end if;

  if v_link.amount_cents <> p_actual_amount_cents or upper(v_link.currency) <> upper(p_actual_currency) then
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, link_id, tenant_id, purpose, expected_amount_cents, received_amount_cents, failure_reason
    ) values (
      p_provider_event_id, null, p_payment_link_id, p_tenant_id, 'continuation_pack', v_link.amount_cents, p_actual_amount_cents, 'amount_mismatch'
    );
    return jsonb_build_object('fulfilled', false, 'reason', 'amount_or_currency_mismatch');
  end if;

  select * into v_pack from continuation_packs where payment_link_id = p_payment_link_id for update;
  if not found then select * into v_pack from continuation_packs where id::text = v_link.reference_id for update; end if;
  if not found then return jsonb_build_object('fulfilled', false, 'reason', 'continuation_pack_not_found'); end if;

  if v_pack.status = 'applied' then
    return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'pack_id', v_pack.id);
  end if;

  -- Grant extra units into canonical entitlement row
  insert into usage_entitlements (tenant_id, subscription_id, metric, limit_amount, current_usage)
  values (p_tenant_id, v_pack.subscription_id, v_pack.metric, v_pack.extra_units, 0)
  on conflict (tenant_id, metric)
  do update set
    limit_amount = usage_entitlements.limit_amount + excluded.limit_amount,
    is_paused = false,
    notification_sent_100 = false,
    updated_at = now();

  update continuation_packs set status = 'applied', updated_at = now() where id = v_pack.id;

  insert into entitlement_ledger_entries (tenant_id, subscription_id, continuation_pack_id, metric, delta_units, reason, reference_type, reference_id)
  values (p_tenant_id, v_pack.subscription_id, v_pack.id, v_pack.metric, v_pack.extra_units, 'continuation_pack', 'continuation_pack', v_pack.id::text)
  on conflict (tenant_id, reference_type, reference_id, metric)
    where reference_type is not null and reference_id is not null
    do nothing;

  return jsonb_build_object('fulfilled', true, 'already_fulfilled', false, 'pack_id', v_pack.id, 'units_granted', v_pack.extra_units);
end;
$$;

grant execute on function fulfill_continuation_pack_payment_v3 to service_role;

-- ============================================================
-- 7. ATOMIC AUDIT PAYMENT V3
-- ============================================================

create or replace function public.fulfill_audit_payment_v3(
  p_payment_link_id text,
  p_tenant_id uuid,
  p_actual_amount_cents bigint,
  p_actual_currency text,
  p_captured boolean,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_audit record;
begin
  if not p_captured then return jsonb_build_object('fulfilled', false, 'reason', 'provider_payment_not_captured'); end if;

  select * into v_link from payment_links where id = p_payment_link_id for update;
  if not found then return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found'); end if;

  if v_link.tenant_id <> p_tenant_id or v_link.payment_purpose <> 'audit_fee' then
    return jsonb_build_object('fulfilled', false, 'reason', 'tenant_or_purpose_mismatch');
  end if;

  if v_link.amount_cents <> p_actual_amount_cents or upper(v_link.currency) <> upper(p_actual_currency) then
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, link_id, tenant_id, purpose, expected_amount_cents, received_amount_cents, failure_reason
    ) values (
      p_provider_event_id, null, p_payment_link_id, p_tenant_id, 'audit_fee', v_link.amount_cents, p_actual_amount_cents, 'amount_mismatch'
    );
    return jsonb_build_object('fulfilled', false, 'reason', 'amount_or_currency_mismatch');
  end if;

  select * into v_audit from audit_orders where payment_link_id = p_payment_link_id for update;
  if not found then select * into v_audit from audit_orders where id::text = v_link.reference_id for update; end if;
  if not found then return jsonb_build_object('fulfilled', false, 'reason', 'audit_order_not_found'); end if;

  if v_audit.status in ('paid', 'in_review', 'completed') then
    return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'audit_order_id', v_audit.id);
  end if;

  update audit_orders set status = 'paid', updated_at = now() where id = v_audit.id;

  return jsonb_build_object('fulfilled', true, 'already_fulfilled', false, 'audit_order_id', v_audit.id, 'status', 'paid');
end;
$$;

grant execute on function fulfill_audit_payment_v3 to service_role;

-- ============================================================
-- 8. ATOMIC DOMAIN PAYMENT V3
-- ============================================================

create or replace function public.record_domain_payment_v3(
  p_payment_link_id text,
  p_tenant_id uuid,
  p_actual_amount_cents bigint,
  p_actual_currency text,
  p_captured boolean,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_domain record;
  v_target_status text;
begin
  if not p_captured then return jsonb_build_object('fulfilled', false, 'reason', 'provider_payment_not_captured'); end if;

  select * into v_link from payment_links where id = p_payment_link_id for update;
  if not found then return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found'); end if;

  if v_link.tenant_id <> p_tenant_id then return jsonb_build_object('fulfilled', false, 'reason', 'tenant_mismatch'); end if;
  if v_link.payment_purpose <> 'domain_purchase' and v_link.payment_purpose <> 'domain_renewal' then
    return jsonb_build_object('fulfilled', false, 'reason', 'purpose_mismatch');
  end if;

  if v_link.amount_cents <> p_actual_amount_cents or upper(v_link.currency) <> upper(p_actual_currency) then
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, link_id, tenant_id, purpose, expected_amount_cents, received_amount_cents, failure_reason
    ) values (
      p_provider_event_id, null, p_payment_link_id, p_tenant_id, v_link.payment_purpose, v_link.amount_cents, p_actual_amount_cents, 'amount_mismatch'
    );
    return jsonb_build_object('fulfilled', false, 'reason', 'amount_or_currency_mismatch');
  end if;

  select * into v_domain from domains where payment_link_id = p_payment_link_id for update;
  if not found then select * into v_domain from domains where id::text = v_link.reference_id for update; end if;
  if not found then return jsonb_build_object('fulfilled', false, 'reason', 'domain_record_not_found'); end if;

  v_target_status := case when v_link.payment_purpose = 'domain_purchase' then 'paid_pending_registration' else 'renewal_paid_pending_provider' end;

  if v_domain.status = v_target_status then
    return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'domain_id', v_domain.id);
  end if;

  update domains set status = v_target_status, updated_at = now() where id = v_domain.id;

  return jsonb_build_object('fulfilled', true, 'already_fulfilled', false, 'domain_id', v_domain.id, 'status', v_target_status);
end;
$$;

grant execute on function record_domain_payment_v3 to service_role;

-- ============================================================
-- 9. TRANSACTIONAL PURPOSE-SPECIFIC REFUND RPC V3
-- ============================================================

create or replace function public.process_refund_atomic_v3(
  p_refund_id uuid,
  p_payment_order_id uuid,
  p_provider_refund_id text,
  p_amount_cents bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_refund record;
  v_purpose text;
  v_sub record;
  v_pack record;
  v_domain record;
  v_entitlement record;
  v_total_refunded bigint;
  v_link_id text;
  v_action_taken text := 'refund_processed';
  v_manual_review boolean := false;
  v_manual_reason text;
begin
  select * into v_refund from payment_refunds where id = p_refund_id for update;
  if not found then return jsonb_build_object('success', false, 'reason', 'refund_record_not_found'); end if;

  select * into v_order from payment_orders where id = p_payment_order_id for update;
  if not found then return jsonb_build_object('success', false, 'reason', 'payment_order_not_found'); end if;

  v_purpose := v_order.payment_purpose;
  v_link_id := (v_order.metadata->>'link_id');

  -- Calculate cumulative refunds
  select coalesce(sum(amount_cents), 0) into v_total_refunded
  from payment_refunds
  where payment_order_id = p_payment_order_id and status = 'PROCESSED';

  v_total_refunded := v_total_refunded + p_amount_cents;

  -- Route product reversal by purpose
  if v_purpose = 'wallet_topup' then
    -- ONLY wallet_topup reverses wallet balance
    perform append_wallet_ledger_entry_atomic(
      v_order.tenant_id,
      'adjustment',
      -abs(p_amount_cents),
      'payment_refund',
      p_refund_id::text,
      jsonb_build_object('payment_order_id', p_payment_order_id, 'reason', 'razorpay_refund_reversal')
    );
    v_action_taken := 'wallet_reversed';

  elsif v_purpose = 'subscription_payment' then
    if v_total_refunded >= v_order.amount_cents then
      -- FULL REFUND: Cancel subscription & revoke future entitlements
      select * into v_sub from subscriptions where payment_link_id::text = v_link_id or id::text = v_order.reference_id for update;
      if found then
        update subscriptions
        set status = 'refunded',
            fulfilment_status = 'refunded',
            refunded_at = now(),
            cancelled_at = coalesce(cancelled_at, now()),
            updated_at = now()
        where id = v_sub.id;

        -- Revoke future entitlements: clamp limit_amount to current_usage
        for v_entitlement in select * from usage_entitlements where tenant_id = v_order.tenant_id loop
          update usage_entitlements
          set limit_amount = current_usage,
              is_paused = true,
              updated_at = now()
          where id = v_entitlement.id;

          insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
          values (v_order.tenant_id, v_sub.id, v_entitlement.metric, -(v_entitlement.limit_amount - v_entitlement.current_usage), 'subscription_refund_revocation', 'payment_refund', p_refund_id::text)
          on conflict (tenant_id, reference_type, reference_id, metric) do nothing;
        end loop;
      end if;
      v_action_taken := 'subscription_full_refund_revoked';
    else
      -- PARTIAL REFUND: Requires MANUAL_REVIEW
      v_manual_review := true;
      v_manual_reason := 'partial_subscription_refund_requires_manual_review';
    end if;

  elsif v_purpose = 'audit_fee' then
    if v_total_refunded >= v_order.amount_cents then
      update audit_orders set status = 'pending_payment', updated_at = now()
      where (payment_link_id::text = v_link_id or id::text = v_order.reference_id) and credit_consumed_at is null;
      v_action_taken := 'audit_credit_revoked';
    else
      v_manual_review := true;
      v_manual_reason := 'partial_audit_refund_requires_manual_review';
    end if;

  elsif v_purpose = 'continuation_pack' then
    select * into v_pack from continuation_packs where payment_link_id::text = v_link_id or id::text = v_order.reference_id for update;
    if found and v_pack.status = 'applied' then
      select * into v_entitlement from usage_entitlements where tenant_id = v_order.tenant_id and metric = v_pack.metric for update;
      if found then
        -- Decrease limit_amount by extra_units (not below current_usage)
        update usage_entitlements
        set limit_amount = greatest(current_usage, limit_amount - v_pack.extra_units),
            updated_at = now()
        where id = v_entitlement.id;

        insert into entitlement_ledger_entries (tenant_id, subscription_id, continuation_pack_id, metric, delta_units, reason, reference_type, reference_id)
        values (v_order.tenant_id, v_pack.subscription_id, v_pack.id, v_pack.metric, -v_pack.extra_units, 'continuation_pack_refund_revocation', 'payment_refund', p_refund_id::text)
        on conflict (tenant_id, reference_type, reference_id, metric) do nothing;
      end if;
      update continuation_packs set status = 'refunded', updated_at = now() where id = v_pack.id;
      v_action_taken := 'continuation_pack_revoked';
    else
      v_manual_review := true;
      v_manual_reason := 'continuation_pack_consumed_or_not_applied';
    end if;

  elsif v_purpose = 'domain_purchase' or v_purpose = 'domain_renewal' then
    select * into v_domain from domains where payment_link_id::text = v_link_id or id::text = v_order.reference_id for update;
    if found and (v_domain.status = 'pending_payment' or v_domain.status = 'paid_pending_registration' or v_domain.status = 'renewal_pending_payment') then
      update domains set status = 'cancelled', updated_at = now() where id = v_domain.id;
      v_action_taken := 'domain_request_cancelled';
    else
      v_manual_review := true;
      v_manual_reason := 'active_domain_refund_requires_manual_review';
    end if;

  else
    v_manual_review := true;
    v_manual_reason := 'unknown_payment_purpose_refund';
  end if;

  if v_manual_review then
    update payment_refunds set status = 'FAILED', reason = v_manual_reason where id = p_refund_id;
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, link_id, order_id, tenant_id, purpose,
      expected_amount_cents, received_amount_cents, failure_reason, resolution_status
    ) values (
      null, p_provider_refund_id, v_link_id, p_payment_order_id::text, v_order.tenant_id, v_purpose,
      v_order.amount_cents, p_amount_cents, v_manual_reason, 'manual_review'
    );

    return jsonb_build_object('success', false, 'status', 'MANUAL_REVIEW', 'reason', v_manual_reason);
  end if;

  -- Mark refund PROCESSED
  update payment_refunds set status = 'PROCESSED', processed_at = now() where id = p_refund_id;

  -- Transition order state
  if v_total_refunded >= v_order.amount_cents then
    update payment_orders set state = 'REFUNDED', updated_at = now() where id = p_payment_order_id;
  else
    update payment_orders set state = 'PARTIALLY_REFUNDED', updated_at = now() where id = p_payment_order_id;
  end if;

  return jsonb_build_object('success', true, 'status', 'PROCESSED', 'action_taken', v_action_taken);
end;
$$;

grant execute on function process_refund_atomic_v3 to service_role;
