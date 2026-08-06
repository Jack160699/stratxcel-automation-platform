-- Additive migration: Final Payment RPC ACL and Security Lockdown
-- 1. Fixes reconcile_and_fulfill_razorpay_payment_v4 wallet_ledger_entries INSERT column mismatch.
-- 2. Revokes execution on deprecated RPC functions from all roles (including service_role).
-- 3. Grants execution on current active production RPC functions strictly to service_role.
-- 4. Denies execution to public, anon, and authenticated across all payment and refund mutation functions.

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
  v_wallet record;
  v_sub record;
  v_audit record;
  v_pack record;
  v_domain record;

  v_purpose text;
  v_plan_tier text;
  v_base_price bigint;
  v_credit_valid boolean := false;
  v_credit_amount bigint := 0;

  v_metrics text[] := array['social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance'];
  v_limits_launch integer[] := array[100, 1, 500, 1];
  v_limits_growth integer[] := array[300, 5, 2000, 1];
  v_limits_custom integer[] := array[500, 10, 5000, 1];
  v_limits integer[];

  v_i integer;
  v_metric text;
  v_new_base_val integer;
  v_old_base_val integer := 0;
  v_old_bonus_val integer := 0;
  v_delta integer := 0;
begin
  -- 1. Lock payment link
  select * into v_link from payment_links
  where reference_id = p_reference_id or id::text = p_reference_id
  for update;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found');
  end if;

  -- 2. State & Amount Rejection Rules
  if p_provider_status is null or lower(trim(p_provider_status)) not in ('paid', 'captured') or p_captured is not true then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_not_captured');
  end if;

  if p_actual_amount_cents is null or p_actual_amount_cents < v_link.amount_cents then
    return jsonb_build_object('fulfilled', false, 'reason', 'underpayment_rejected');
  end if;

  if upper(trim(coalesce(p_actual_currency, 'INR'))) <> 'INR' then
    return jsonb_build_object('fulfilled', false, 'reason', 'invalid_currency');
  end if;

  -- 3. Idempotent Payment Order Lock/Creation
  select * into v_order from payment_orders
  where tenant_id = v_link.tenant_id
    and provider = 'razorpay'
    and reference_type = 'payment_link'
    and reference_id = v_link.reference_id
  for update;

  if not found then
    select * into v_order from payment_orders
    where provider_payment_id = p_provider_payment_id
    for update;
  end if;

  v_purpose := v_link.payment_purpose;

  if not found then
    insert into payment_orders (
      tenant_id, provider, provider_payment_id, provider_order_id,
      amount_cents, currency, state, payment_purpose, mode,
      reference_type, reference_id, metadata
    ) values (
      v_link.tenant_id, 'razorpay', p_provider_payment_id, p_provider_order_id,
      p_actual_amount_cents, 'INR', 'CAPTURED', v_purpose, 'live',
      'payment_link', v_link.reference_id, jsonb_build_object('link_id', v_link.id)
    ) returning * into v_order;
  else
    if v_order.state = 'CAPTURED' then
      return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'payment_order_id', v_order.id);
    end if;

    update payment_orders
    set state = 'CAPTURED',
        provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
        provider_order_id = coalesce(p_provider_order_id, provider_order_id),
        updated_at = now()
    where id = v_order.id;
  end if;

  -- 4. Route Fulfilment by Purpose
  if v_purpose = 'wallet_topup' then
    select * into v_wallet from wallet_accounts where tenant_id = v_link.tenant_id for update;
    if not found then
      insert into wallet_accounts (tenant_id, balance_cents) values (v_link.tenant_id, 0)
      returning * into v_wallet;
    end if;

    insert into wallet_ledger_entries (
      tenant_id, entry_type, amount_cents, reference_type, reference_id, metadata
    ) values (
      v_link.tenant_id, 'credit_purchase', p_actual_amount_cents,
      'payment_order', v_order.id::text, jsonb_build_object('payment_id', p_provider_payment_id)
    )
    on conflict (tenant_id, reference_type, reference_id, entry_type)
      where reference_type is not null and reference_id is not null
      do nothing;

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

    if v_sub.audit_order_id is not null then
      select * into v_audit from audit_orders where id = v_sub.audit_order_id and tenant_id = v_link.tenant_id for update;
      if found and (v_audit.status = 'paid' or v_audit.status = 'completed') then
        if v_audit.audit_completed_at is not null and v_audit.credit_expires_at > now() and v_audit.credit_consumed_at is null then
          v_credit_valid := true;
          v_credit_amount := coalesce(v_audit.audit_fee_cents, 99900);
        end if;
      end if;
    end if;

    update subscriptions
    set status = 'active',
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

    for v_i in 1..array_length(v_metrics, 1) loop
      v_metric := v_metrics[v_i];
      v_new_base_val := v_limits[v_i];

      if v_new_base_val > 0 then
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
        bonus_limit_amount = usage_entitlements.bonus_limit_amount + v_pack.extra_units,
        limit_amount = usage_entitlements.base_limit_amount + usage_entitlements.bonus_limit_amount + v_pack.extra_units,
        updated_at = now();

      update continuation_packs set status = 'applied', updated_at = now() where id = v_pack.id;

      insert into entitlement_ledger_entries (tenant_id, subscription_id, continuation_pack_id, metric, delta_units, reason, reference_type, reference_id)
      values (v_link.tenant_id, v_pack.subscription_id, v_pack.id, v_pack.metric, v_pack.extra_units, 'continuation_pack_purchase', 'continuation_pack', v_pack.id::text)
      on conflict (tenant_id, reference_type, reference_id, metric)
        where reference_type is not null and reference_id is not null
        do nothing;
    end if;

  elsif v_purpose = 'domain_purchase' then
    select * into v_domain from domains where payment_link_id = v_link.id for update;
    if not found then select * into v_domain from domains where payment_link_id in (select id from payment_links where reference_id = v_link.reference_id) for update; end if;

    if found then
      update domains set status = 'paid_pending_registration', updated_at = now() where id = v_domain.id;
    end if;

  elsif v_purpose = 'domain_renewal' then
    select * into v_domain from domains where payment_link_id = v_link.id for update;
    if not found then select * into v_domain from domains where payment_link_id in (select id from payment_links where reference_id = v_link.reference_id) for update; end if;

    if found then
      update domains set expires_at = coalesce(expires_at, now()) + interval '1 year', updated_at = now() where id = v_domain.id;
    end if;
  end if;

  update payment_links set status = 'paid', updated_at = now() where id = v_link.id;

  return jsonb_build_object('fulfilled', true, 'already_fulfilled', false, 'payment_order_id', v_order.id);
end;
$$;


-- Deprecated RPC Revocation
do $$
begin
  if exists (select 1 from pg_proc where proname = 'reconcile_and_fulfill_razorpay_payment_v1') then
    revoke execute on function public.reconcile_and_fulfill_razorpay_payment_v1 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'reconcile_and_fulfill_razorpay_payment_v2') then
    revoke execute on function public.reconcile_and_fulfill_razorpay_payment_v2 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'reconcile_and_fulfill_razorpay_payment_v3') then
    revoke execute on function public.reconcile_and_fulfill_razorpay_payment_v3 from public, anon, authenticated, service_role;
  end if;

  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v1') then
    revoke execute on function public.process_refund_atomic_v1 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v2') then
    revoke execute on function public.process_refund_atomic_v2 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v3') then
    revoke execute on function public.process_refund_atomic_v3 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v4') then
    revoke execute on function public.process_refund_atomic_v4 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v5') then
    revoke execute on function public.process_refund_atomic_v5 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v6') then
    revoke execute on function public.process_refund_atomic_v6 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v7') then
    revoke execute on function public.process_refund_atomic_v7 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v8') then
    revoke execute on function public.process_refund_atomic_v8 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v9') then
    revoke execute on function public.process_refund_atomic_v9 from public, anon, authenticated, service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'process_refund_atomic_v10') then
    revoke execute on function public.process_refund_atomic_v10 from public, anon, authenticated, service_role;
  end if;

  if exists (select 1 from pg_proc where proname = 'complete_audit_and_issue_subscription_credit_v4') then
    revoke execute on function public.complete_audit_and_issue_subscription_credit_v4 from public, anon, authenticated, service_role;
  end if;
end;
$$;

-- Privileges on current active production RPCs
revoke execute on function public.reconcile_and_fulfill_razorpay_payment_v4 from public, anon, authenticated;
grant execute on function public.reconcile_and_fulfill_razorpay_payment_v4 to service_role;

revoke execute on function public.process_refund_atomic_v11 from public, anon, authenticated;
grant execute on function public.process_refund_atomic_v11 to service_role;

revoke execute on function public.claim_razorpay_webhook_event from public, anon, authenticated;
grant execute on function public.claim_razorpay_webhook_event to service_role;

revoke execute on function public.complete_razorpay_webhook_event from public, anon, authenticated;
grant execute on function public.complete_razorpay_webhook_event to service_role;

revoke execute on function public.bootstrap_first_platform_staff from public, anon, authenticated;
grant execute on function public.bootstrap_first_platform_staff to service_role;

revoke execute on function public.complete_audit_and_issue_subscription_credit_v5 from public, anon, authenticated;
grant execute on function public.complete_audit_and_issue_subscription_credit_v5 to service_role;
