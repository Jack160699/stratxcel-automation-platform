-- Surgical PR #24 follow-up: authoritative Razorpay billing periods on charge;
-- lifecycle can converge cancel_at_period_end. Does NOT touch payment-v4.

drop function if exists public.apply_razorpay_subscription_lifecycle_event(text, text, text, timestamptz, text, text, timestamptz, timestamptz, text, text);

create or replace function public.apply_razorpay_subscription_lifecycle_event(
  p_provider_subscription_id text,
  p_provider_status text,
  p_provider_event_id text default null,
  p_next_charge_at timestamptz default null,
  p_short_url text default null,
  p_provider_plan_id text default null,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_pending_plan_tier text default null,
  p_event_type text default null,
  p_cancel_at_cycle_end boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_new_status text;
  v_is_updated boolean := coalesce(p_event_type, '') = 'subscription.updated';
begin
  if p_provider_subscription_id is null or trim(p_provider_subscription_id) = '' then
    return jsonb_build_object('success', false, 'reason', 'missing_provider_subscription_id');
  end if;

  select * into v_sub from subscriptions
  where billing_provider = 'razorpay_subscription' and provider_subscription_id = p_provider_subscription_id
  for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_found');
  end if;

  v_new_status := v_sub.status;
  if not v_is_updated then
    if p_provider_status in ('created', 'authenticated', 'pending') and v_sub.status in ('pending_payment', 'payment_failed') then
      v_new_status := 'pending_payment';
    elsif p_provider_status in ('active', 'resumed') and v_sub.status in ('paused', 'past_due', 'active') then
      v_new_status := 'active';
    elsif p_provider_status = 'halted' and v_sub.status in ('active', 'past_due', 'paused', 'pending_payment') then
      v_new_status := 'past_due';
    elsif p_provider_status = 'paused' and v_sub.status in ('active', 'past_due') then
      v_new_status := 'paused';
    elsif p_provider_status in ('cancelled', 'completed', 'expired') and v_sub.status <> 'refunded' then
      v_new_status := 'cancelled';
    end if;
  end if;

  update subscriptions set
    status = v_new_status,
    provider_status = coalesce(nullif(trim(p_provider_status), ''), provider_status),
    provider_plan_id = coalesce(nullif(trim(p_provider_plan_id), ''), provider_plan_id),
    provider_short_url = coalesce(p_short_url, provider_short_url),
    next_charge_at = coalesce(p_next_charge_at, next_charge_at),
    current_period_start = coalesce(p_current_period_start, current_period_start),
    current_period_end = coalesce(p_current_period_end, current_period_end),
    pending_plan_tier = case
      when p_pending_plan_tier in ('starter', 'growth', 'business') then p_pending_plan_tier
      when v_is_updated and p_pending_plan_tier is null then pending_plan_tier
      else pending_plan_tier
    end,
    cancel_at_period_end = case
      when p_cancel_at_cycle_end is not null then p_cancel_at_cycle_end
      when v_new_status = 'cancelled' then true
      else cancel_at_period_end
    end,
    cancel_requested_at = case
      when p_cancel_at_cycle_end is true and cancel_requested_at is null then now()
      when p_cancel_at_cycle_end is false then null
      when v_new_status = 'cancelled' and cancel_requested_at is null then coalesce(cancel_requested_at, now())
      else cancel_requested_at
    end,
    cancelled_at = case when v_new_status = 'cancelled' and cancelled_at is null then now() else cancelled_at end,
    fulfilment_status = case
      when fulfilment_status = 'reconciliation_required' and (
        (p_cancel_at_cycle_end is not null) or (p_pending_plan_tier in ('starter', 'growth', 'business')) or v_new_status = 'cancelled'
      ) then 'fulfilled'
      else fulfilment_status
    end,
    past_due_since = case
      when v_new_status = 'past_due' and (past_due_since is null or status <> 'past_due') then now()
      when v_new_status <> 'past_due' then null else past_due_since end,
    grace_period_end = case
      when v_new_status = 'past_due' and (grace_period_end is null or status <> 'past_due') then now() + interval '7 days'
      when v_new_status <> 'past_due' then null else grace_period_end end,
    updated_at = now()
  where id = v_sub.id;

  return jsonb_build_object(
    'success', true, 'subscription_id', v_sub.id, 'tenant_id', v_sub.tenant_id,
    'previous_status', v_sub.status, 'status', v_new_status,
    'provider_status', coalesce(nullif(trim(p_provider_status), ''), v_sub.provider_status),
    'provider_event_id', p_provider_event_id, 'event_type', p_event_type, 'entitlements_changed', false
  );
end;
$$;

revoke execute on function public.apply_razorpay_subscription_lifecycle_event(text, text, text, timestamptz, text, text, timestamptz, timestamptz, text, text, boolean) from public, anon, authenticated;
grant execute on function public.apply_razorpay_subscription_lifecycle_event(text, text, text, timestamptz, text, text, timestamptz, timestamptz, text, text, boolean) to service_role;

drop function if exists public.reconcile_and_fulfill_razorpay_subscription_charge(text, text, text, text, bigint, text, text, boolean, text, text, text, text, text);

create or replace function public.reconcile_and_fulfill_razorpay_subscription_charge(
  p_provider_event_id text,
  p_provider_payment_id text,
  p_provider_subscription_id text,
  p_provider_order_id text default null,
  p_actual_amount_cents bigint default null,
  p_actual_currency text default null,
  p_provider_status text default null,
  p_captured boolean default false,
  p_event_type text default 'subscription.charged',
  p_mode text default null,
  p_provider_plan_id text default null,
  p_notes_tenant_id text default null,
  p_notes_subscription_id text default null,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_next_charge_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record; v_order record; v_audit record; v_wallet record;
  v_expected_cents bigint; v_catalog_cents bigint; v_mode text;
  v_metrics text[] := array['social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance'];
  v_limits int[]; v_limits_starter int[] := array[12,1,100,0]; v_limits_growth int[] := array[25,1,500,1]; v_limits_business int[] := array[50,3,1500,1];
  v_i int; v_metric text; v_new_base_val int; v_old_base_val int; v_old_bonus_val int; v_delta int;
  v_credit_valid boolean := false; v_deferred_valid boolean := false; v_deferred_cents bigint := 0;
  v_is_first_charge boolean := false; v_period_start timestamptz; v_period_end timestamptz; v_next_charge timestamptz;
  v_effective_plan text; v_order_exists boolean := false; v_ledger_rows int := 0;
begin
  if coalesce(trim(p_provider_payment_id), '') = '' then return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_payment_id'); end if;
  if coalesce(trim(p_provider_subscription_id), '') = '' then return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_subscription_id'); end if;
  if coalesce(trim(p_provider_plan_id), '') = '' then return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_plan_id'); end if;
  if p_actual_amount_cents is null or p_actual_amount_cents <= 0 then return jsonb_build_object('fulfilled', false, 'reason', 'invalid_amount'); end if;
  if p_actual_currency is null or upper(p_actual_currency) <> 'INR' then return jsonb_build_object('fulfilled', false, 'reason', 'invalid_currency'); end if;
  if not coalesce(p_captured, false) then return jsonb_build_object('fulfilled', false, 'reason', 'payment_not_captured'); end if;

  -- Authoritative provider period required — never invent a 30-day window.
  if p_current_period_start is null or p_current_period_end is null then
    return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_billing_period');
  end if;
  if p_current_period_end <= p_current_period_start then
    return jsonb_build_object('fulfilled', false, 'reason', 'invalid_provider_billing_period');
  end if;
  if p_current_period_end > p_current_period_start + interval '45 days' then
    return jsonb_build_object('fulfilled', false, 'reason', 'provider_billing_period_implausible');
  end if;

  v_period_start := p_current_period_start;
  v_period_end := p_current_period_end;
  v_next_charge := coalesce(p_next_charge_at, p_current_period_end);

  v_mode := lower(coalesce(nullif(trim(p_mode), ''), 'test'));
  if v_mode not in ('test', 'live') then v_mode := 'test'; end if;

  select * into v_order from payment_orders where provider = 'razorpay' and provider_payment_id = p_provider_payment_id for update;
  if found then
    v_order_exists := true;
    if v_order.state = 'CAPTURED' and v_order.payment_purpose = 'subscription_payment' then
      return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'order_id', v_order.id, 'purpose', 'subscription_payment', 'subscription_id', v_order.reference_id);
    end if;
  end if;

  select * into v_sub from subscriptions
  where billing_provider = 'razorpay_subscription' and provider_subscription_id = p_provider_subscription_id for update;
  if not found then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, purpose, received_amount_cents, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, 'subscription_payment', p_actual_amount_cents, p_actual_currency, 'subscription_not_found_for_provider_id', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_found');
  end if;

  if coalesce(trim(p_notes_tenant_id), '') <> '' and p_notes_tenant_id <> v_sub.tenant_id::text then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, tenant_id, purpose, received_amount_cents, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment', p_actual_amount_cents, p_actual_currency, 'subscription_notes_tenant_mismatch', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'notes_tenant_mismatch');
  end if;
  if coalesce(trim(p_notes_subscription_id), '') <> '' and p_notes_subscription_id <> v_sub.id::text then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, tenant_id, purpose, received_amount_cents, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment', p_actual_amount_cents, p_actual_currency, 'subscription_notes_id_mismatch', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'notes_subscription_mismatch');
  end if;

  if coalesce(trim(v_sub.provider_plan_id), '') <> '' and trim(p_provider_plan_id) <> trim(v_sub.provider_plan_id)
     and not (coalesce(v_sub.paid_months_count,0) > 0 and v_sub.status = 'active' and v_sub.pending_plan_tier in ('starter','growth','business')) then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, tenant_id, purpose, received_amount_cents, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment', p_actual_amount_cents, p_actual_currency, 'subscription_provider_plan_mismatch', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'provider_plan_mismatch');
  end if;

  if v_sub.status not in ('pending_payment', 'payment_failed', 'past_due', 'active', 'paused') then
    return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_chargeable_in_current_state', 'subscription_status', v_sub.status);
  end if;

  v_is_first_charge := coalesce(v_sub.paid_months_count, 0) = 0 or v_sub.status in ('pending_payment', 'payment_failed');
  v_effective_plan := v_sub.plan_tier;
  if not v_is_first_charge and v_sub.pending_plan_tier in ('starter', 'growth', 'business') then
    v_effective_plan := v_sub.pending_plan_tier;
  end if;

  if v_effective_plan = 'starter' then v_catalog_cents := 499900; v_limits := v_limits_starter;
  elsif v_effective_plan = 'growth' then v_catalog_cents := 999900; v_limits := v_limits_growth;
  elsif v_effective_plan = 'business' then v_catalog_cents := 1999900; v_limits := v_limits_business;
  else return jsonb_build_object('fulfilled', false, 'reason', 'legacy_plan_not_payable', 'plan_tier', v_effective_plan);
  end if;

  v_expected_cents := case when v_is_first_charge then v_sub.price_cents else v_catalog_cents end;
  if p_actual_amount_cents <> v_expected_cents then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, tenant_id, purpose, expected_amount_cents, received_amount_cents, expected_currency, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment', v_expected_cents, p_actual_amount_cents, 'INR', p_actual_currency, 'subscription_charge_amount_mismatch', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'amount_mismatch');
  end if;

  if v_is_first_charge and v_sub.audit_order_id is not null then
    select * into v_audit from audit_orders where id = v_sub.audit_order_id for update;
    if found and v_audit.tenant_id = v_sub.tenant_id and v_audit.credit_consumed_at is null then
      if coalesce(v_sub.audit_credit_applied_cents, 0) > 0 then v_credit_valid := true;
      elsif coalesce(v_sub.audit_credit_deferred_cents, 0) > 0 then
        v_deferred_valid := true; v_deferred_cents := v_sub.audit_credit_deferred_cents;
      end if;
    end if;
  end if;

  if v_order_exists then
    update payment_orders set state = 'CAPTURED', provider_order_id = coalesce(p_provider_order_id, provider_order_id),
      amount_cents = p_actual_amount_cents, currency = p_actual_currency, payment_purpose = 'subscription_payment', mode = v_mode,
      reference_type = 'razorpay_subscription', reference_id = v_sub.id::text,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_subscription_id', p_provider_subscription_id, 'provider_plan_id', p_provider_plan_id,
        'provider_event_id', p_provider_event_id, 'event_type', p_event_type,
        'provider_period_start', v_period_start, 'provider_period_end', v_period_end
      ),
      updated_at = now()
    where id = v_order.id returning * into v_order;
  else
    begin
      insert into payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
      values (v_sub.tenant_id, 'razorpay', p_provider_payment_id, p_provider_order_id, p_actual_amount_cents, p_actual_currency, 'CAPTURED', 'subscription_payment', v_mode, 'razorpay_subscription', v_sub.id::text,
        jsonb_build_object(
          'provider_subscription_id', p_provider_subscription_id, 'provider_plan_id', p_provider_plan_id,
          'provider_event_id', p_provider_event_id, 'event_type', p_event_type,
          'provider_period_start', v_period_start, 'provider_period_end', v_period_end
        ))
      returning * into v_order;
    exception when unique_violation then
      select * into v_order from payment_orders where provider = 'razorpay' and provider_payment_id = p_provider_payment_id for update;
      if v_order.state = 'CAPTURED' and v_order.payment_purpose = 'subscription_payment' then
        return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'order_id', v_order.id, 'purpose', 'subscription_payment', 'subscription_id', v_order.reference_id);
      end if;
      raise;
    end;
  end if;

  update subscriptions set status = 'active', plan_tier = v_effective_plan,
    price_cents = case when v_is_first_charge then price_cents else v_expected_cents end,
    pending_plan_tier = case when not v_is_first_charge then null else pending_plan_tier end,
    plan_change_requested_at = case when not v_is_first_charge then null else plan_change_requested_at end,
    provider_plan_id = coalesce(nullif(trim(p_provider_plan_id), ''), provider_plan_id),
    activated_at = coalesce(activated_at, now()),
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    paid_months_count = coalesce(paid_months_count, 0) + 1, fulfilment_status = 'fulfilled',
    entitlements_granted_at = coalesce(entitlements_granted_at, now()), payment_order_id = v_order.id,
    provider_status = coalesce(p_provider_status, provider_status, 'active'), last_charged_at = now(),
    last_provider_payment_id = p_provider_payment_id, next_charge_at = v_next_charge,
    past_due_since = null, grace_period_end = null, updated_at = now()
  where id = v_sub.id;

  if (v_credit_valid or v_deferred_valid) and v_sub.audit_order_id is not null then
    update audit_orders set credit_consumed_at = now(), credit_consumed_subscription_id = v_sub.id, updated_at = now()
    where id = v_sub.audit_order_id and credit_consumed_at is null;
  end if;

  if v_deferred_valid and v_deferred_cents > 0 then
    update subscriptions set audit_credit_applied_cents = v_deferred_cents, audit_credit_deferred_cents = 0, updated_at = now()
    where id = v_sub.id and coalesce(audit_credit_deferred_cents, 0) = v_deferred_cents;
    if found then
      select * into v_wallet from wallet_accounts where tenant_id = v_sub.tenant_id for update;
      if not found then insert into wallet_accounts (tenant_id, balance_cents) values (v_sub.tenant_id, 0) returning * into v_wallet; end if;
      insert into wallet_ledger_entries (tenant_id, entry_type, amount_cents, reference_type, reference_id, metadata)
      values (v_sub.tenant_id, 'credit_purchase', v_deferred_cents, 'subscription_audit_credit', v_sub.id::text,
        jsonb_build_object('payment_order_id', v_order.id, 'audit_order_id', v_sub.audit_order_id, 'reason', 'deferred_audit_credit_after_autopay'))
      on conflict (tenant_id, reference_type, reference_id, entry_type)
        where reference_type is not null and reference_id is not null do nothing;
      get diagnostics v_ledger_rows = row_count;
      if v_ledger_rows > 0 then
        update wallet_accounts set balance_cents = balance_cents + v_deferred_cents, updated_at = now() where tenant_id = v_sub.tenant_id;
      end if;
    end if;
  end if;

  for v_i in 1..array_length(v_metrics, 1) loop
    v_metric := v_metrics[v_i]; v_new_base_val := v_limits[v_i];
    select base_limit_amount, bonus_limit_amount into v_old_base_val, v_old_bonus_val from usage_entitlements where tenant_id = v_sub.tenant_id and metric = v_metric;
    if not found then v_old_base_val := 0; v_old_bonus_val := 0; end if;
    v_delta := v_new_base_val - coalesce(v_old_base_val, 0);
    insert into usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
    values (v_sub.tenant_id, v_sub.id, v_metric, v_new_base_val, 0, v_new_base_val, 0)
    on conflict (tenant_id, metric) do update set
      base_limit_amount = excluded.base_limit_amount,
      limit_amount = excluded.base_limit_amount + usage_entitlements.bonus_limit_amount,
      subscription_id = excluded.subscription_id, current_usage = 0, is_paused = false,
      notification_sent_80 = false, notification_sent_90 = false, notification_sent_100 = false, updated_at = now();
    if v_delta <> 0 or v_is_first_charge then
      insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
      values (v_sub.tenant_id, v_sub.id, v_metric, case when v_delta = 0 then v_new_base_val else v_delta end,
        case when v_is_first_charge then 'subscription_activation' else 'subscription_renewal' end, 'payment_order', v_order.id::text)
      on conflict (tenant_id, reference_type, reference_id, metric)
        where reference_type is not null and reference_id is not null do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'fulfilled', true, 'already_fulfilled', false, 'order_id', v_order.id, 'purpose', 'subscription_payment',
    'subscription_id', v_sub.id, 'tenant_id', v_sub.tenant_id, 'is_first_charge', v_is_first_charge,
    'plan_tier', v_effective_plan, 'mode', v_mode,
    'current_period_start', v_period_start, 'current_period_end', v_period_end, 'next_charge_at', v_next_charge
  );
end;
$$;

revoke execute on function public.reconcile_and_fulfill_razorpay_subscription_charge(text, text, text, text, bigint, text, text, boolean, text, text, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_and_fulfill_razorpay_subscription_charge(text, text, text, text, bigint, text, text, boolean, text, text, text, text, text, timestamptz, timestamptz, timestamptz) to service_role;
