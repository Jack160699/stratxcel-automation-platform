-- Additive hotfix: restore the last hardened payment-v4 implementation after the ACL finalization regression.
-- The only body change from 20260806002500 is alignment with the real wallet_ledger_entries schema.

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
  v_domain record;
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

  -- 4. Amount and Currency Reconciliation Check (For non-subscription purposes)
  if v_purpose <> 'subscription_payment' then
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
  end if;

  -- ============================================================
  -- 5. PRE-MUTATION VALIDATIONS (Product resolution, Plan Tier & State Checks)
  -- MUST happen BEFORE creating/updating payment_orders and setting payment_links.status = 'paid'
  -- ============================================================

  if v_purpose = 'wallet_topup' then
    null;

  elsif v_purpose = 'subscription_payment' then
    select * into v_sub from subscriptions where payment_link_id = v_link.id for update;
    if not found then
      select * into v_sub from subscriptions where id::text = v_link.reference_id for update;
    end if;

    if not found then
      return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_found');
    end if;

    -- Subscription Payment-Eligible State Validation
    -- Only pending_payment, payment_failed, and past_due are payment-eligible.
    -- Rejects active, cancelled, refunded, expired, paused.
    if v_sub.status not in ('pending_payment', 'payment_failed', 'past_due') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'subscription_state_not_payable',
        'subscription_status', v_sub.status
      );
    end if;

    v_plan_tier := v_sub.plan_tier;
    if v_plan_tier = 'launch' then
      v_base_price := 949900;
      v_limits := v_limits_launch;
    elsif v_plan_tier = 'growth' then
      v_base_price := 1899900;
      v_limits := v_limits_growth;
    elsif v_plan_tier = 'custom_growth' then
      v_base_price := 2399900;
      v_limits := v_limits_custom;
    else
      return jsonb_build_object('fulfilled', false, 'reason', 'unknown_plan_tier', 'plan_tier', v_plan_tier);
    end if;

    -- Evaluate Audit Credit & Tenant Matching
    v_credit_valid := false;
    v_credit_amount := 0;

    if v_sub.audit_order_id is not null then
      select * into v_audit from audit_orders where id = v_sub.audit_order_id for update;
      if found then
        -- Strict Cross-Tenant Audit Order Rejection: audit tenant MUST match subscription tenant AND payment link tenant
        if v_audit.tenant_id <> v_sub.tenant_id or v_audit.tenant_id <> v_link.tenant_id then
          insert into payment_reconciliation_issues (
            provider_event_id, payment_id, link_id, tenant_id, purpose,
            expected_amount_cents, received_amount_cents, expected_currency, received_currency,
            failure_reason, resolution_status
          )
          values (
            p_provider_event_id, p_provider_payment_id, v_link.id, v_link.tenant_id, 'subscription_payment',
            v_base_price, p_actual_amount_cents, upper(v_link.currency), upper(p_actual_currency),
            'audit_credit_tenant_mismatch', 'open'
          )
          on conflict do nothing;

          update payment_links set status = 'reconciliation_required', updated_at = now() where id = v_link.id;

          return jsonb_build_object(
            'fulfilled', false,
            'reason', 'audit_credit_tenant_mismatch',
            'expected_tenant_id', v_sub.tenant_id,
            'audit_tenant_id', v_audit.tenant_id
          );
        end if;

        -- Audit credit validity conditions (same tenant)
        if (v_audit.status = 'paid' or v_audit.status = 'completed')
           and v_audit.audit_completed_at is not null
           and v_audit.credit_eligible_from is not null
           and v_audit.credit_eligible_from <= now()
           and v_audit.credit_expires_at > now()
           and v_audit.credit_consumed_at is null then
          v_credit_valid := true;
          v_credit_amount := coalesce(v_audit.audit_fee_cents, 99900);
        end if;
      end if;
    end if;

    v_expected_price := greatest(0::bigint, v_base_price - v_credit_amount);

    -- Strict Price Validation against Calculated Expected Price
    if p_actual_amount_cents <> v_expected_price or upper(p_actual_currency) <> upper(v_link.currency) then
      insert into payment_reconciliation_issues (
        provider_event_id, payment_id, link_id, tenant_id, purpose,
        expected_amount_cents, received_amount_cents, expected_currency, received_currency,
        failure_reason, resolution_status
      )
      values (
        p_provider_event_id, p_provider_payment_id, v_link.id, v_link.tenant_id, 'subscription_payment',
        v_expected_price, p_actual_amount_cents, upper(v_link.currency), upper(p_actual_currency),
        'subscription_expected_amount_mismatch', 'open'
      )
      on conflict do nothing;

      update payment_links set status = 'reconciliation_required', updated_at = now() where id = v_link.id;

      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'subscription_expected_amount_mismatch',
        'expected_amount_cents', v_expected_price,
        'received_amount_cents', p_actual_amount_cents,
        'credit_valid', v_credit_valid
      );
    end if;

  elsif v_purpose = 'audit_fee' then
    select * into v_audit from audit_orders where payment_link_id = v_link.id for update;
    if not found then
      select * into v_audit from audit_orders where id::text = v_link.reference_id for update;
    end if;

    if not found then
      return jsonb_build_object('fulfilled', false, 'reason', 'audit_order_not_found');
    end if;

    -- Audit Fee Payment-Eligible State Validation
    -- Only pending_payment is payment-eligible.
    -- Rejects paid, completed, refunded, cancelled.
    if v_audit.status not in ('pending_payment') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'audit_order_state_not_payable',
        'audit_status', v_audit.status
      );
    end if;

  elsif v_purpose = 'continuation_pack' then
    select * into v_pack from continuation_packs where payment_link_id = v_link.id for update;
    if not found then
      select * into v_pack from continuation_packs where id::text = v_link.reference_id for update;
    end if;

    if not found then
      return jsonb_build_object('fulfilled', false, 'reason', 'continuation_pack_not_found');
    end if;

    -- Continuation Pack Payment-Eligible State Validation
    -- Only pending is payment-eligible.
    -- Rejects applied, paid, refunded, cancelled, expired.
    if v_pack.status not in ('pending') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'continuation_pack_state_not_payable',
        'pack_status', v_pack.status
      );
    end if;

  elsif v_purpose = 'domain_purchase' or v_purpose = 'domain_renewal' then
    select * into v_domain from domains where payment_link_id = v_link.id for update;
    if not found then
      select * into v_domain from domains where id::text = v_link.reference_id for update;
    end if;

    if not found then
      return jsonb_build_object('fulfilled', false, 'reason', 'domain_not_found');
    end if;

    -- Domain Purchase Payment-Eligible State Validation
    -- Only pending_payment is payment-eligible for domain_purchase.
    -- Rejects paid, paid_pending_registration, registered, active, refunded, cancelled, expired.
    if v_purpose = 'domain_purchase' and v_domain.status not in ('pending_payment') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'domain_purchase_state_not_payable',
        'domain_status', v_domain.status
      );
    end if;

    -- Domain Renewal Payment-Eligible State Validation
    -- Only active, registered, expired are renewal-eligible.
    -- Rejects pending_payment, paid_pending_registration, registering, paid_pending_renewal, refunded, cancelled, transferred_out.
    if v_purpose = 'domain_renewal' and v_domain.status not in ('active', 'registered', 'expired') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'domain_renewal_state_not_payable',
        'domain_status', v_domain.status
      );
    end if;

  else
    return jsonb_build_object('fulfilled', false, 'reason', 'unsupported_payment_purpose', 'purpose', v_purpose);
  end if;

  -- ============================================================
  -- 6. ATOMIC MUTATIONS (Executed only after product, purpose, state & price validation passed)
  -- ============================================================

  -- Lock or Create Payment Order
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

  -- Route Fulfilment Mutators by Purpose
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
    -- v_sub & v_audit are locked and validated above
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
    update audit_orders set status = 'paid', updated_at = now() where id = v_audit.id;

  elsif v_purpose = 'continuation_pack' then
    if v_pack.status <> 'applied' then
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

  elsif v_purpose = 'domain_purchase' then
    update domains set status = 'paid_pending_registration', updated_at = now() where id = v_domain.id;

  elsif v_purpose = 'domain_renewal' then
    update domains set status = 'paid_pending_renewal', updated_at = now() where id = v_domain.id;
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


