-- Migration: True Platform Staff Model, Atomic Fulfilment v4, Refund v4, and Strict Privilege Lockdown

-- ============================================================
-- 1. PLATFORM STAFF USERS TABLE
-- ============================================================

create table if not exists public.platform_staff_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null,
  role text not null check (role in ('platform_owner', 'platform_admin', 'audit_reviewer', 'finance_reviewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.platform_staff_users enable row level security;
revoke all on public.platform_staff_users from public, anon, authenticated;
grant select, insert, update, delete on public.platform_staff_users to service_role;


-- ============================================================
-- 2. COMPLETE AUDIT AND ISSUE SUBSCRIPTION CREDIT V4 RPC
-- ============================================================

create or replace function public.complete_audit_and_issue_subscription_credit_v4(
  p_audit_order_id uuid,
  p_expected_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit record;
begin
  -- Lock audit order for update
  select * into v_audit from audit_orders where id = p_audit_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'audit_order_not_found');
  end if;

  -- Verify tenant match inside PostgreSQL
  if v_audit.tenant_id <> p_expected_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  -- Allowed state check
  if v_audit.status <> 'paid' and v_audit.status <> 'completed' then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_state', 'status', v_audit.status);
  end if;

  -- Update audit completion state
  update audit_orders
  set status = 'completed',
      audit_completed_at = coalesce(audit_completed_at, now()),
      credit_eligible_from = coalesce(credit_eligible_from, now()),
      credit_expires_at = coalesce(credit_expires_at, now() + interval '7 days'),
      updated_at = now()
  where id = p_audit_order_id;

  return jsonb_build_object(
    'success', true,
    'audit_order_id', p_audit_order_id,
    'tenant_id', v_audit.tenant_id,
    'credit_expires_at', coalesce(v_audit.credit_expires_at, now() + interval '7 days'),
    'credit_amount_cents', coalesce(v_audit.audit_fee_cents, 99900)
  );
end;
$$;

revoke execute on function public.complete_audit_and_issue_subscription_credit_v4(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_audit_and_issue_subscription_credit_v4(uuid, uuid, uuid) to service_role;


-- ============================================================
-- 3. RECONCILE AND FULFILL RAZORPAY PAYMENT V4 RPC (SINGLE ATOMIC TRANSACTION)
-- ============================================================

create or replace function public.reconcile_and_fulfill_razorpay_payment_v4(
  p_provider_event_id text,
  p_provider_payment_id text,
  p_provider_link_id text,
  p_provider_order_id text,
  p_reference_id text,
  p_actual_amount_cents bigint,
  p_actual_currency text,
  p_provider_status text,
  p_captured boolean,
  p_event_type text default 'payment_link.paid',
  p_provider_captured_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_order record;
  v_sub record;
  v_audit record;
  v_pack record;
  v_wallet record;
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
  v_new_base_val int;
  v_old_base_val int;
  v_old_bonus_val int;
  v_delta int;
  v_i int;
  v_purpose text;
begin
  -- 1. Validate Provider Captured Status
  if not p_captured or (lower(p_provider_status) <> 'captured' and lower(p_provider_status) <> 'paid') then
    return jsonb_build_object('fulfilled', false, 'reason', 'provider_payment_not_captured', 'status', p_provider_status);
  end if;

  -- 2. Lock Payment Link for Update
  if p_provider_link_id is not null and p_provider_link_id <> '' then
    select * into v_link from payment_links where provider_link_id = p_provider_link_id for update;
  end if;

  if not found and p_reference_id is not null and p_reference_id <> '' then
    select * into v_link from payment_links where reference_id = p_reference_id for update;
  end if;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found');
  end if;

  v_purpose := v_link.payment_purpose;

  -- 3. Idempotent check: If already paid and order captured
  if v_link.status = 'paid' then
    select * into v_order from payment_orders where reference_type = 'payment_link' and reference_id = v_link.reference_id;
    if found and v_order.state = 'CAPTURED' then
      return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'purpose', v_purpose, 'order_id', v_order.id);
    end if;
  end if;

  -- 4. Amount and Currency Reconciliation Check
  if p_actual_amount_cents <> v_link.amount_cents or upper(p_actual_currency) <> upper(v_link.currency) then
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, link_id, tenant_id, purpose,
      expected_amount_cents, received_amount_cents, expected_currency, received_currency,
      failure_reason, resolution_status
    )
    values (
      p_provider_event_id, p_provider_payment_id, v_link.id, v_link.tenant_id, v_purpose,
      v_link.amount_cents, p_actual_amount_cents, upper(v_link.currency), upper(p_actual_currency),
      'amount_or_currency_mismatch', 'open'
    )
    on conflict do nothing;

    update payment_links set status = 'reconciliation_required', updated_at = now() where id = v_link.id;

    return jsonb_build_object(
      'fulfilled', false,
      'reason', 'amount_or_currency_mismatch',
      'expected_amount', v_link.amount_cents,
      'received_amount', p_actual_amount_cents
    );
  end if;

  -- 5. Lock or Create Payment Order
  select * into v_order from payment_orders
  where tenant_id = v_link.tenant_id
    and provider = 'razorpay'
    and reference_type = 'payment_link'
    and reference_id = v_link.reference_id
  for update;

  if not found then
    insert into payment_orders (
      tenant_id, provider, provider_payment_id, provider_order_id,
      amount_cents, currency, state, payment_purpose, mode,
      reference_type, reference_id, metadata
    ) values (
      v_link.tenant_id, 'razorpay', p_provider_payment_id, p_provider_order_id,
      p_actual_amount_cents, p_actual_currency, 'CAPTURED', v_purpose, v_link.mode,
      'payment_link', v_link.reference_id, jsonb_build_object('link_id', v_link.id, 'purpose', v_purpose)
    )
    returning * into v_order;
  else
    update payment_orders
    set state = 'CAPTURED',
        provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
        provider_order_id = coalesce(p_provider_order_id, provider_order_id),
        updated_at = now()
    where id = v_order.id;
  end if;

  -- 6. Route Fulfilment by Purpose
  if v_purpose = 'wallet_topup' then
    -- Lock wallet account
    select * into v_wallet from wallet_accounts where tenant_id = v_link.tenant_id for update;
    if not found then
      insert into wallet_accounts (tenant_id, balance_cents) values (v_link.tenant_id, 0)
      returning * into v_wallet;
    end if;

    -- Append wallet ledger entry idempotently
    insert into wallet_ledger_entries (
      tenant_id, entry_type, amount_cents, balance_after_cents, description, reference_type, reference_id, metadata
    ) values (
      v_link.tenant_id, 'credit_purchase', p_actual_amount_cents, v_wallet.balance_cents + p_actual_amount_cents,
      'Razorpay wallet topup', 'payment_order', v_order.id::text, jsonb_build_object('payment_id', p_provider_payment_id)
    )
    on conflict (tenant_id, reference_type, reference_id, entry_type)
      where reference_type is not null and reference_id is not null
      do nothing;

    -- Increase balance
    update wallet_accounts
    set balance_cents = balance_cents + p_actual_amount_cents, updated_at = now()
    where tenant_id = v_link.tenant_id;

  elsif v_purpose = 'subscription_payment' then
    select * into v_sub from subscriptions where payment_link_id = v_link.id for update;
    if not found then select * into v_sub from subscriptions where id::text = v_link.reference_id for update; end if;

    if not found then return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_found'); end if;

    v_plan_tier := v_sub.plan_tier;
    if v_plan_tier = 'launch' then v_base_price := 949900; v_limits := v_limits_launch;
    elsif v_plan_tier = 'growth' then v_base_price := 1899900; v_limits := v_limits_growth;
    elsif v_plan_tier = 'custom_growth' then v_base_price := 2399900; v_limits := v_limits_custom;
    else return jsonb_build_object('fulfilled', false, 'reason', 'unknown_plan_tier');
    end if;

    -- Verify audit credit tenant match inside RPC
    if v_sub.audit_order_id is not null then
      select * into v_audit from audit_orders where id = v_sub.audit_order_id and tenant_id = v_link.tenant_id for update;
      if found and (v_audit.status = 'paid' or v_audit.status = 'completed') then
        if v_audit.audit_completed_at is not null and v_audit.credit_expires_at > now() and v_audit.credit_consumed_at is null then
          v_credit_valid := true;
          v_credit_amount := coalesce(v_audit.audit_fee_cents, 99900);
        end if;
      end if;
    end if;

    v_expected_price := greatest(0::bigint, v_base_price - v_credit_amount);

    -- Activate subscription
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

    if v_credit_valid and v_sub.audit_order_id is not null then
      update audit_orders
      set credit_consumed_at = now(), credit_consumed_subscription_id = v_sub.id, updated_at = now()
      where id = v_sub.audit_order_id;
    end if;

    -- Entitlement Delta Accounting
    for v_i in 1..array_length(v_metrics, 1) loop
      v_metric := v_metrics[v_i];
      v_new_base_val := v_limits[v_i];

      if v_new_base_val > 0 then
        -- Load existing entitlement
        select base_limit_amount, bonus_limit_amount into v_old_base_val, v_old_bonus_val
        from usage_entitlements
        where tenant_id = v_link.tenant_id and metric = v_metric;

        if not found then
          v_old_base_val := 0;
          v_old_bonus_val := 0;
        end if;

        v_delta := v_new_base_val - coalesce(v_old_base_val, 0);

        insert into usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
        values (v_link.tenant_id, v_sub.id, v_metric, v_new_base_val, 0, v_new_base_val, 0)
        on conflict (tenant_id, metric)
        do update set
          base_limit_amount = excluded.base_limit_amount,
          limit_amount = excluded.base_limit_amount + usage_entitlements.bonus_limit_amount,
          subscription_id = excluded.subscription_id,
          is_paused = false,
          notification_sent_100 = false,
          updated_at = now();

        -- Record exact delta in ledger
        if v_delta <> 0 then
          insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
          values (v_link.tenant_id, v_sub.id, v_metric, v_delta, 'subscription_activation', 'subscription', v_sub.id::text)
          on conflict (tenant_id, reference_type, reference_id, metric)
            where reference_type is not null and reference_id is not null
            do nothing;
        end if;
      end if;
    end loop;

  elsif v_purpose = 'audit_fee' then
    select * into v_audit from audit_orders where payment_link_id = v_link.id for update;
    if not found then select * into v_audit from audit_orders where id::text = v_link.reference_id for update; end if;

    if found then
      update audit_orders set status = 'paid', updated_at = now() where id = v_audit.id;
    end if;

  elsif v_purpose = 'continuation_pack' then
    select * into v_pack from continuation_packs where payment_link_id = v_link.id for update;
    if not found then select * into v_pack from continuation_packs where id::text = v_link.reference_id for update; end if;

    if found and v_pack.status <> 'applied' then
      insert into usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
      values (v_link.tenant_id, v_pack.subscription_id, v_pack.metric, 0, v_pack.extra_units, v_pack.extra_units, 0)
      on conflict (tenant_id, metric)
      do update set
        bonus_limit_amount = usage_entitlements.bonus_limit_amount + excluded.bonus_limit_amount,
        limit_amount = usage_entitlements.base_limit_amount + usage_entitlements.bonus_limit_amount + excluded.bonus_limit_amount,
        is_paused = false,
        notification_sent_100 = false,
        updated_at = now();

      update continuation_packs set status = 'applied', updated_at = now() where id = v_pack.id;

      insert into entitlement_ledger_entries (tenant_id, subscription_id, continuation_pack_id, metric, delta_units, reason, reference_type, reference_id)
      values (v_link.tenant_id, v_pack.subscription_id, v_pack.id, v_pack.metric, v_pack.extra_units, 'continuation_pack', 'continuation_pack', v_pack.id::text)
      on conflict (tenant_id, reference_type, reference_id, metric)
        where reference_type is not null and reference_id is not null
        do nothing;
    end if;

  elsif v_purpose = 'domain_purchase' or v_purpose = 'domain_renewal' then
    update domains set status = 'paid_pending_registration', updated_at = now() where payment_link_id = v_link.id or id::text = v_link.reference_id;
  end if;

  -- 7. Update Payment Link Status to Paid
  update payment_links
  set status = 'paid',
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      updated_at = now()
  where id = v_link.id;

  return jsonb_build_object(
    'fulfilled', true,
    'already_fulfilled', false,
    'purpose', v_purpose,
    'order_id', v_order.id,
    'tenant_id', v_link.tenant_id
  );
end;
$$;

revoke execute on function public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz) to service_role;


-- ============================================================
-- 4. PROCESS REFUND ATOMIC V4 RPC
-- ============================================================

create or replace function public.process_refund_atomic_v4(
  p_refund_id uuid,
  p_payment_order_id uuid,
  p_provider_refund_id text,
  p_provider_payment_id text,
  p_actual_refund_amount_cents bigint,
  p_provider_refund_status text,
  p_provider_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund record;
  v_order record;
  v_sub record;
  v_pack record;
  v_audit record;
  v_domain record;
  v_ent record;
  v_wallet record;
  v_cumulative_refund bigint := 0;
  v_purpose text;
begin
  -- Lock refund record
  select * into v_refund from payment_refunds where id = p_refund_id for update;
  if not found then return jsonb_build_object('success', false, 'reason', 'refund_not_found'); end if;

  -- Lock payment order
  select * into v_order from payment_orders where id = p_payment_order_id for update;
  if not found then return jsonb_build_object('success', false, 'reason', 'payment_order_not_found'); end if;

  if v_refund.tenant_id <> v_order.tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  -- Idempotency check
  if v_refund.status = 'PROCESSED' then
    return jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_id);
  end if;

  v_purpose := v_order.payment_purpose;

  -- Validate cumulative refund limits
  select coalesce(sum(amount_cents), 0) into v_cumulative_refund
  from payment_refunds
  where payment_order_id = p_payment_order_id and status = 'PROCESSED' and id <> p_refund_id;

  if (v_cumulative_refund + p_actual_refund_amount_cents) > v_order.amount_cents then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'cumulative_refund_exceeds_captured', updated_at = now() where id = p_refund_id;
    return jsonb_build_object('success', false, 'reason', 'cumulative_refund_exceeds_captured', 'status', 'MANUAL_REVIEW');
  end if;

  -- PRODUCT REVERSAL BY PURPOSE
  if v_purpose = 'wallet_topup' then
    select * into v_wallet from wallet_accounts where tenant_id = v_order.tenant_id for update;
    if found then
      update wallet_accounts set balance_cents = greatest(0::bigint, balance_cents - p_actual_refund_amount_cents), updated_at = now() where tenant_id = v_order.tenant_id;
      insert into wallet_ledger_entries (
        tenant_id, entry_type, amount_cents, balance_after_cents, description, reference_type, reference_id
      ) values (
        v_order.tenant_id, 'refund_reversal', -p_actual_refund_amount_cents, greatest(0::bigint, v_wallet.balance_cents - p_actual_refund_amount_cents),
        'Wallet topup refund', 'payment_refund', p_refund_id::text
      ) on conflict (tenant_id, reference_type, reference_id, entry_type)
        where reference_type is not null and reference_id is not null
        do nothing;
    end if;

  elsif v_purpose = 'subscription_payment' then
    if p_actual_refund_amount_cents < v_order.amount_cents then
      -- Partial subscription refund requires MANUAL_REVIEW
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'partial_subscription_refund_manual_review', updated_at = now() where id = p_refund_id;
      return jsonb_build_object('success', false, 'reason', 'partial_subscription_refund_manual_review', 'status', 'MANUAL_REVIEW');
    end if;

    select * into v_sub from subscriptions where payment_link_id in (select id from payment_links where reference_id = v_order.reference_id) for update;
    if found then
      update subscriptions set status = 'refunded', updated_at = now() where id = v_sub.id;
      -- Revoke base entitlement for this subscription
      update usage_entitlements set base_limit_amount = 0, limit_amount = bonus_limit_amount, updated_at = now() where subscription_id = v_sub.id;
    end if;

  elsif v_purpose = 'continuation_pack' then
    select * into v_pack from continuation_packs where id::text = v_order.reference_id for update;
    if found then
      select * into v_ent from usage_entitlements where tenant_id = v_order.tenant_id and metric = v_pack.metric for update;
      if found and (v_ent.limit_amount - v_ent.current_usage) >= v_pack.extra_units then
        -- Unused bonus units -> reverse bonus
        update usage_entitlements
        set bonus_limit_amount = greatest(0, bonus_limit_amount - v_pack.extra_units),
            limit_amount = greatest(0, limit_amount - v_pack.extra_units),
            updated_at = now()
        where tenant_id = v_order.tenant_id and metric = v_pack.metric;

        update continuation_packs set status = 'refunded', updated_at = now() where id = v_pack.id;
      else
        -- Bonus units consumed -> MANUAL_REVIEW
        update payment_refunds set status = 'MANUAL_REVIEW', reason = 'consumed_bonus_units_manual_review', updated_at = now() where id = p_refund_id;
        return jsonb_build_object('success', false, 'reason', 'consumed_bonus_units_manual_review', 'status', 'MANUAL_REVIEW');
      end if;
    end if;

  elsif v_purpose = 'domain_purchase' then
    select * into v_domain from domains where payment_link_id in (select id from payment_links where reference_id = v_order.reference_id) for update;
    if found then
      if v_domain.status = 'paid_pending_registration' then
        update domains set status = 'cancelled', updated_at = now() where id = v_domain.id;
      else
        update payment_refunds set status = 'MANUAL_REVIEW', reason = 'registered_domain_refund_manual_review', updated_at = now() where id = p_refund_id;
        return jsonb_build_object('success', false, 'reason', 'registered_domain_refund_manual_review', 'status', 'MANUAL_REVIEW');
      end if;
    end if;
  end if;

  -- Mark refund PROCESSED
  update payment_refunds
  set status = 'PROCESSED',
      provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
      processed_at = now(),
      updated_at = now()
  where id = p_refund_id;

  return jsonb_build_object('success', true, 'already_processed', false, 'refund_id', p_refund_id, 'status', 'PROCESSED');
end;
$$;

revoke execute on function public.process_refund_atomic_v4(uuid, uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.process_refund_atomic_v4(uuid, uuid, text, text, bigint, text, text) to service_role;
