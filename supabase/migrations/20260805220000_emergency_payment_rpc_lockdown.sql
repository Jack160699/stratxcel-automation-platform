-- Migration: Emergency Payment RPC Lockdown, Status Constraint Widen, and Base/Bonus Entitlement Model

-- ============================================================
-- 1. EMERGENCY RPC PRIVILEGE LOCKDOWN
-- Explicitly revoke execution from PUBLIC, anon, and authenticated
-- for all financial SECURITY DEFINER functions. Grant ONLY to service_role.
-- ============================================================

-- complete_audit_and_issue_subscription_credit
revoke execute on function public.complete_audit_and_issue_subscription_credit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_audit_and_issue_subscription_credit(uuid, uuid) to service_role;

-- fulfill_subscription_payment_v3
revoke execute on function public.fulfill_subscription_payment_v3(text, text, uuid, bigint, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fulfill_subscription_payment_v3(text, text, uuid, bigint, text, text, boolean, text) to service_role;

-- fulfill_continuation_pack_payment_v3
revoke execute on function public.fulfill_continuation_pack_payment_v3(text, uuid, bigint, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fulfill_continuation_pack_payment_v3(text, uuid, bigint, text, boolean, text) to service_role;

-- fulfill_audit_payment_v3
revoke execute on function public.fulfill_audit_payment_v3(text, uuid, bigint, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fulfill_audit_payment_v3(text, uuid, bigint, text, boolean, text) to service_role;

-- record_domain_payment_v3
revoke execute on function public.record_domain_payment_v3(text, uuid, bigint, text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_domain_payment_v3(text, uuid, bigint, text, boolean, text) to service_role;

-- process_refund_atomic_v3
revoke execute on function public.process_refund_atomic_v3(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.process_refund_atomic_v3(uuid, uuid, text, bigint) to service_role;

-- fulfill_subscription_payment_atomic (v2)
revoke execute on function public.fulfill_subscription_payment_atomic(text, text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.fulfill_subscription_payment_atomic(text, text, uuid, integer, text) to service_role;

-- fulfill_continuation_pack_payment_atomic (v2)
revoke execute on function public.fulfill_continuation_pack_payment_atomic(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.fulfill_continuation_pack_payment_atomic(text, uuid, integer, text) to service_role;

-- record_domain_payment_atomic (v2)
revoke execute on function public.record_domain_payment_atomic(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_domain_payment_atomic(text, uuid, integer, text) to service_role;

-- fulfill_audit_payment_atomic (v2)
revoke execute on function public.fulfill_audit_payment_atomic(text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.fulfill_audit_payment_atomic(text, uuid, integer, text) to service_role;

-- append_wallet_ledger_entry_atomic
revoke execute on function public.append_wallet_ledger_entry_atomic(uuid, text, bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_wallet_ledger_entry_atomic(uuid, text, bigint, text, text, jsonb) to service_role;

-- claim_razorpay_webhook_event
revoke execute on function public.claim_razorpay_webhook_event(text, text, jsonb, int) from public, anon, authenticated;
grant execute on function public.claim_razorpay_webhook_event(text, text, jsonb, int) to service_role;

-- complete_razorpay_webhook_event
revoke execute on function public.complete_razorpay_webhook_event(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_razorpay_webhook_event(uuid, text) to service_role;


-- ============================================================
-- 2. WIDEN STATUS CONSTRAINTS
-- ============================================================

-- Subscriptions: Allow paid_pending_reconciliation and reconciliation_required
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in (
    'pending_payment',
    'paid_pending_reconciliation',
    'reconciliation_required',
    'active',
    'payment_failed',
    'expired',
    'cancelled',
    'past_due',
    'paused',
    'refunded'
  ));

-- Payment Refunds: Allow MANUAL_REVIEW
alter table payment_refunds drop constraint if exists payment_refunds_status_check;
alter table payment_refunds add constraint payment_refunds_status_check
  check (status in (
    'PENDING',
    'PROCESSED',
    'FAILED',
    'MANUAL_REVIEW'
  ));


-- ============================================================
-- 3. ENTITLEMENT BASE & BONUS MODEL
-- ============================================================

alter table usage_entitlements
  add column if not exists base_limit_amount integer not null default 0,
  add column if not exists bonus_limit_amount integer not null default 0;

-- Backfill base_limit_amount from existing limit_amount if base_limit_amount is 0
update usage_entitlements
set base_limit_amount = limit_amount
where base_limit_amount = 0 and limit_amount > 0;

-- Unique index for payment_reconciliation_issues to prevent duplicates
create unique index if not exists reconciliation_issues_identity_idx
  on payment_reconciliation_issues (
    coalesce(provider_event_id, ''),
    coalesce(payment_id, ''),
    coalesce(link_id, ''),
    failure_reason
  );


-- ============================================================
-- 4. UPDATE fulfill_subscription_payment_v3 to use Base/Bonus Entitlement Model
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
  v_base_limit_val int;
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
    )
    on conflict do nothing;

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

  -- Update payment link status
  update payment_links
  set status = 'paid',
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      updated_at = now()
  where id = p_payment_link_id and status <> 'paid';

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

  -- Grant usage entitlements using base_limit_amount and bonus_limit_amount
  for v_i in 1..array_length(v_metrics, 1) loop
    v_metric := v_metrics[v_i];
    v_base_limit_val := v_limits[v_i];

    if v_base_limit_val > 0 then
      insert into usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
      values (p_tenant_id, v_sub.id, v_metric, v_base_limit_val, 0, v_base_limit_val, 0)
      on conflict (tenant_id, metric)
      do update set
        base_limit_amount = excluded.base_limit_amount,
        limit_amount = excluded.base_limit_amount + usage_entitlements.bonus_limit_amount,
        subscription_id = excluded.subscription_id,
        is_paused = false,
        notification_sent_100 = false,
        updated_at = now();

      insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
      values (p_tenant_id, v_sub.id, v_metric, v_base_limit_val, 'subscription_activation', 'subscription', v_sub.id::text)
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

revoke execute on function public.fulfill_subscription_payment_v3(text, text, uuid, bigint, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fulfill_subscription_payment_v3(text, text, uuid, bigint, text, text, boolean, text) to service_role;


-- ============================================================
-- 5. UPDATE fulfill_continuation_pack_payment_v3 for Base/Bonus Model
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

  if v_link.tenant_id <> p_tenant_id or v_link.payment_purpose <> 'continuation_pack' then
    return jsonb_build_object('fulfilled', false, 'reason', 'purpose_mismatch');
  end if;

  if v_link.amount_cents <> p_actual_amount_cents or upper(v_link.currency) <> upper(p_actual_currency) then
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, link_id, tenant_id, purpose, expected_amount_cents, received_amount_cents, failure_reason
    ) values (
      p_provider_event_id, null, p_payment_link_id, p_tenant_id, 'continuation_pack', v_link.amount_cents, p_actual_amount_cents, 'amount_mismatch'
    ) on conflict do nothing;
    return jsonb_build_object('fulfilled', false, 'reason', 'amount_or_currency_mismatch');
  end if;

  select * into v_pack from continuation_packs where payment_link_id = p_payment_link_id for update;
  if not found then select * into v_pack from continuation_packs where id::text = v_link.reference_id for update; end if;
  if not found then return jsonb_build_object('fulfilled', false, 'reason', 'continuation_pack_not_found'); end if;

  if v_pack.status = 'applied' then
    return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'pack_id', v_pack.id);
  end if;

  -- Grant extra units into bonus_limit_amount and recalculate limit_amount
  insert into usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
  values (p_tenant_id, v_pack.subscription_id, v_pack.metric, 0, v_pack.extra_units, v_pack.extra_units, 0)
  on conflict (tenant_id, metric)
  do update set
    bonus_limit_amount = usage_entitlements.bonus_limit_amount + excluded.bonus_limit_amount,
    limit_amount = usage_entitlements.base_limit_amount + usage_entitlements.bonus_limit_amount + excluded.bonus_limit_amount,
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

revoke execute on function public.fulfill_continuation_pack_payment_v3(text, uuid, bigint, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fulfill_continuation_pack_payment_v3(text, uuid, bigint, text, boolean, text) to service_role;
