-- Additive Razorpay recurring (AutoPay) support on the existing subscriptions table.
-- Does NOT create a duplicate subscriptions table.
-- Does NOT modify reconcile_and_fulfill_razorpay_payment_v4 (Payment-Link path stays intact).
-- subscription.charged fulfilment is a separate RPC keyed by provider_subscription_id + provider_payment_id.

-- ============================================================
-- 1. Provider-managed subscription columns on existing table
-- ============================================================

alter table public.subscriptions
  add column if not exists billing_provider text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_plan_id text,
  add column if not exists provider_status text,
  add column if not exists provider_short_url text,
  add column if not exists provider_customer_id text,
  add column if not exists next_charge_at timestamptz,
  add column if not exists last_charged_at timestamptz,
  add column if not exists last_provider_payment_id text;

alter table public.subscriptions drop constraint if exists subscriptions_billing_provider_check;
alter table public.subscriptions add constraint subscriptions_billing_provider_check
  check (billing_provider is null or billing_provider in ('razorpay_payment_link', 'razorpay_subscription'));

create unique index if not exists subscriptions_provider_subscription_uidx
  on public.subscriptions (billing_provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists subscriptions_provider_status_idx
  on public.subscriptions (billing_provider, provider_status)
  where billing_provider = 'razorpay_subscription';

-- Idempotent charge capture: one payment_order per Razorpay payment id
create unique index if not exists payment_orders_provider_payment_uidx
  on public.payment_orders (provider, provider_payment_id)
  where provider_payment_id is not null;

-- Allow v1 self-service plan-change targets (additive constraint replace)
alter table public.subscriptions drop constraint if exists subscriptions_pending_plan_tier_check;
alter table public.subscriptions add constraint subscriptions_pending_plan_tier_check
  check (
    pending_plan_tier is null
    or pending_plan_tier in ('launch', 'growth', 'custom_growth', 'starter', 'business')
  );

-- ============================================================
-- 2. Plan-change RPC: allow starter/growth/business self-service targets
-- ============================================================

create or replace function public.schedule_subscription_plan_change(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_target_plan_tier text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
begin
  if p_target_plan_tier not in ('starter', 'growth', 'business') then
    return jsonb_build_object('success', false, 'reason', 'target_plan_not_self_service');
  end if;

  select * into v_sub from subscriptions where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_found');
  end if;

  if v_sub.tenant_id <> p_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  if v_sub.status <> 'active' then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_active');
  end if;

  if v_sub.plan_tier = p_target_plan_tier then
    return jsonb_build_object('success', false, 'reason', 'already_on_target_plan');
  end if;

  update subscriptions
  set pending_plan_tier = p_target_plan_tier,
      plan_change_requested_at = now(),
      updated_at = now()
  where id = p_subscription_id;

  return jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'current_plan_tier', v_sub.plan_tier,
    'pending_plan_tier', p_target_plan_tier,
    'effective_at', v_sub.current_period_end,
    'billing_provider', v_sub.billing_provider
  );
end;
$$;

grant execute on function public.schedule_subscription_plan_change(uuid, uuid, text) to service_role;

-- ============================================================
-- 3. Lifecycle status sync from provider webhooks (no entitlements here)
-- ============================================================

create or replace function public.apply_razorpay_subscription_lifecycle_event(
  p_provider_subscription_id text,
  p_provider_status text,
  p_provider_event_id text default null,
  p_next_charge_at timestamptz default null,
  p_short_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_new_status text;
begin
  if p_provider_subscription_id is null or trim(p_provider_subscription_id) = '' then
    return jsonb_build_object('success', false, 'reason', 'missing_provider_subscription_id');
  end if;

  select * into v_sub
  from subscriptions
  where billing_provider = 'razorpay_subscription'
    and provider_subscription_id = p_provider_subscription_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_found');
  end if;

  v_new_status := v_sub.status;

  if p_provider_status in ('created', 'authenticated', 'pending') then
    if v_sub.status in ('pending_payment', 'payment_failed') then
      v_new_status := 'pending_payment';
    end if;
  elsif p_provider_status in ('active', 'resumed') then
    -- Charge RPC owns activation/entitlements; lifecycle only mirrors provider state when already active/past_due/paused.
    if v_sub.status in ('paused', 'past_due', 'active') then
      v_new_status := 'active';
    end if;
  elsif p_provider_status in ('halted') then
    if v_sub.status in ('active', 'past_due', 'paused', 'pending_payment') then
      v_new_status := 'past_due';
    end if;
  elsif p_provider_status in ('paused') then
    if v_sub.status in ('active', 'past_due') then
      v_new_status := 'paused';
    end if;
  elsif p_provider_status in ('cancelled', 'completed', 'expired') then
    if v_sub.status not in ('refunded') then
      v_new_status := 'cancelled';
    end if;
  end if;

  update subscriptions
  set status = v_new_status,
      provider_status = p_provider_status,
      provider_short_url = coalesce(p_short_url, provider_short_url),
      next_charge_at = coalesce(p_next_charge_at, next_charge_at),
      cancelled_at = case when v_new_status = 'cancelled' and cancelled_at is null then now() else cancelled_at end,
      past_due_since = case
        when v_new_status = 'past_due' and (past_due_since is null or status <> 'past_due') then now()
        when v_new_status <> 'past_due' then null
        else past_due_since
      end,
      grace_period_end = case
        when v_new_status = 'past_due' and (grace_period_end is null or status <> 'past_due') then now() + interval '7 days'
        when v_new_status <> 'past_due' then null
        else grace_period_end
      end,
      updated_at = now()
  where id = v_sub.id;

  return jsonb_build_object(
    'success', true,
    'subscription_id', v_sub.id,
    'tenant_id', v_sub.tenant_id,
    'previous_status', v_sub.status,
    'status', v_new_status,
    'provider_status', p_provider_status,
    'provider_event_id', p_provider_event_id
  );
end;
$$;

revoke execute on function public.apply_razorpay_subscription_lifecycle_event(text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_razorpay_subscription_lifecycle_event(text, text, text, timestamptz, text) to service_role;

-- ============================================================
-- 4. subscription.charged reconciliation (NOT Payment-Link v4)
-- ============================================================

create or replace function public.reconcile_and_fulfill_razorpay_subscription_charge(
  p_provider_event_id text,
  p_provider_payment_id text,
  p_provider_subscription_id text,
  p_provider_order_id text default null,
  p_actual_amount_cents bigint default null,
  p_actual_currency text default null,
  p_provider_status text default null,
  p_captured boolean default false,
  p_event_type text default 'subscription.charged'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_order record;
  v_audit record;
  v_expected_cents bigint;
  v_metrics text[] := array['social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance'];
  v_limits int[];
  v_limits_starter int[] := array[12, 1, 100, 0];
  v_limits_growth int[] := array[25, 1, 500, 1];
  v_limits_business int[] := array[50, 3, 1500, 1];
  v_i int;
  v_metric text;
  v_new_base_val int;
  v_old_base_val int;
  v_old_bonus_val int;
  v_delta int;
  v_credit_valid boolean := false;
  v_is_first_charge boolean := false;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_effective_plan text;
  v_order_exists boolean := false;
begin
  if p_provider_payment_id is null or trim(p_provider_payment_id) = '' then
    return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_payment_id');
  end if;
  if p_provider_subscription_id is null or trim(p_provider_subscription_id) = '' then
    return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_subscription_id');
  end if;
  if p_actual_amount_cents is null or p_actual_amount_cents <= 0 then
    return jsonb_build_object('fulfilled', false, 'reason', 'invalid_amount');
  end if;
  if p_actual_currency is null or upper(p_actual_currency) <> 'INR' then
    return jsonb_build_object('fulfilled', false, 'reason', 'invalid_currency');
  end if;
  if not coalesce(p_captured, false) then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_not_captured');
  end if;

  -- Idempotency: already fulfilled this provider payment
  select * into v_order
  from payment_orders
  where provider = 'razorpay' and provider_payment_id = p_provider_payment_id
  for update;

  if found then
    v_order_exists := true;
    if v_order.state = 'CAPTURED' and v_order.payment_purpose = 'subscription_payment' then
      return jsonb_build_object(
        'fulfilled', true,
        'already_fulfilled', true,
        'order_id', v_order.id,
        'purpose', 'subscription_payment',
        'subscription_id', v_order.reference_id
      );
    end if;
  end if;

  select * into v_sub
  from subscriptions
  where billing_provider = 'razorpay_subscription'
    and provider_subscription_id = p_provider_subscription_id
  for update;

  if not found then
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, tenant_id, purpose,
      expected_amount_cents, received_amount_cents, expected_currency, received_currency,
      failure_reason, resolution_status
    ) values (
      p_provider_event_id, p_provider_payment_id, null, 'subscription_payment',
      null, p_actual_amount_cents, 'INR', p_actual_currency,
      'subscription_not_found_for_provider_id', 'open'
    );
    return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_found');
  end if;

  if v_sub.status not in ('pending_payment', 'payment_failed', 'past_due', 'active', 'paused') then
    return jsonb_build_object(
      'fulfilled', false,
      'reason', 'subscription_not_chargeable_in_current_state',
      'subscription_status', v_sub.status
    );
  end if;

  v_is_first_charge := coalesce(v_sub.paid_months_count, 0) = 0 or v_sub.status in ('pending_payment', 'payment_failed');

  -- Apply scheduled plan change on renewal charges only
  v_effective_plan := v_sub.plan_tier;
  if not v_is_first_charge and v_sub.pending_plan_tier in ('starter', 'growth', 'business') then
    v_effective_plan := v_sub.pending_plan_tier;
  end if;

  if v_effective_plan = 'starter' then
    v_expected_cents := 499900;
    v_limits := v_limits_starter;
  elsif v_effective_plan = 'growth' then
    v_expected_cents := 999900;
    v_limits := v_limits_growth;
  elsif v_effective_plan = 'business' then
    v_expected_cents := 1999900;
    v_limits := v_limits_business;
  else
    return jsonb_build_object('fulfilled', false, 'reason', 'legacy_plan_not_payable', 'plan_tier', v_effective_plan);
  end if;

  -- First-charge may include provisional audit credit already baked into price_cents
  if v_is_first_charge then
    v_expected_cents := v_sub.price_cents;
  end if;

  if p_actual_amount_cents <> v_expected_cents then
    insert into payment_reconciliation_issues (
      provider_event_id, payment_id, tenant_id, purpose,
      expected_amount_cents, received_amount_cents, expected_currency, received_currency,
      failure_reason, resolution_status
    ) values (
      p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment',
      v_expected_cents, p_actual_amount_cents, 'INR', p_actual_currency,
      'subscription_charge_amount_mismatch', 'open'
    );
    return jsonb_build_object(
      'fulfilled', false,
      'reason', 'amount_mismatch',
      'expected_amount_cents', v_expected_cents,
      'received_amount_cents', p_actual_amount_cents
    );
  end if;

  -- Optional audit credit validation on first activation
  if v_is_first_charge and v_sub.audit_order_id is not null then
    select * into v_audit from audit_orders where id = v_sub.audit_order_id for update;
    if found
       and v_audit.tenant_id = v_sub.tenant_id
       and v_audit.credit_consumed_at is null
       and coalesce(v_sub.audit_credit_applied_cents, 0) > 0 then
      v_credit_valid := true;
    end if;
  end if;

  if v_order_exists then
    update payment_orders
    set state = 'CAPTURED',
        provider_order_id = coalesce(p_provider_order_id, provider_order_id),
        amount_cents = p_actual_amount_cents,
        currency = p_actual_currency,
        payment_purpose = 'subscription_payment',
        reference_type = 'razorpay_subscription',
        reference_id = v_sub.id::text,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'provider_subscription_id', p_provider_subscription_id,
          'provider_event_id', p_provider_event_id,
          'event_type', p_event_type
        ),
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
  else
    begin
      insert into payment_orders (
        tenant_id, provider, provider_payment_id, provider_order_id,
        amount_cents, currency, state, payment_purpose, mode,
        reference_type, reference_id, metadata
      ) values (
        v_sub.tenant_id, 'razorpay', p_provider_payment_id, p_provider_order_id,
        p_actual_amount_cents, p_actual_currency, 'CAPTURED', 'subscription_payment', 'live',
        'razorpay_subscription', v_sub.id::text,
        jsonb_build_object(
          'provider_subscription_id', p_provider_subscription_id,
          'provider_event_id', p_provider_event_id,
          'event_type', p_event_type
        )
      )
      returning * into v_order;
    exception when unique_violation then
      select * into v_order
      from payment_orders
      where provider = 'razorpay' and provider_payment_id = p_provider_payment_id
      for update;
      if v_order.state = 'CAPTURED' and v_order.payment_purpose = 'subscription_payment' then
        return jsonb_build_object(
          'fulfilled', true,
          'already_fulfilled', true,
          'order_id', v_order.id,
          'purpose', 'subscription_payment',
          'subscription_id', v_order.reference_id
        );
      end if;
      raise;
    end;
  end if;

  v_period_start := now();
  v_period_end := now() + interval '30 days';

  update subscriptions
  set status = 'active',
      plan_tier = v_effective_plan,
      price_cents = case when v_is_first_charge then price_cents else v_expected_cents end,
      pending_plan_tier = case when not v_is_first_charge then null else pending_plan_tier end,
      plan_change_requested_at = case when not v_is_first_charge then null else plan_change_requested_at end,
      activated_at = coalesce(activated_at, now()),
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      paid_months_count = coalesce(paid_months_count, 0) + 1,
      fulfilment_status = 'fulfilled',
      entitlements_granted_at = coalesce(entitlements_granted_at, now()),
      payment_order_id = v_order.id,
      provider_status = coalesce(p_provider_status, provider_status, 'active'),
      last_charged_at = now(),
      last_provider_payment_id = p_provider_payment_id,
      next_charge_at = v_period_end,
      past_due_since = null,
      grace_period_end = null,
      cancel_at_period_end = case when cancel_at_period_end then cancel_at_period_end else false end,
      updated_at = now()
  where id = v_sub.id;

  if v_credit_valid and v_sub.audit_order_id is not null then
    update audit_orders
    set credit_consumed_at = now(),
        credit_consumed_subscription_id = v_sub.id,
        updated_at = now()
    where id = v_sub.audit_order_id
      and credit_consumed_at is null;
  end if;

  for v_i in 1..array_length(v_metrics, 1) loop
    v_metric := v_metrics[v_i];
    v_new_base_val := v_limits[v_i];

    select base_limit_amount, bonus_limit_amount into v_old_base_val, v_old_bonus_val
    from usage_entitlements
    where tenant_id = v_sub.tenant_id and metric = v_metric;

    if not found then
      v_old_base_val := 0;
      v_old_bonus_val := 0;
    end if;

    v_delta := v_new_base_val - coalesce(v_old_base_val, 0);

    insert into usage_entitlements (
      tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage
    ) values (
      v_sub.tenant_id, v_sub.id, v_metric, v_new_base_val, 0, v_new_base_val,
      case when v_is_first_charge then 0 else 0 end
    )
    on conflict (tenant_id, metric)
    do update set
      base_limit_amount = excluded.base_limit_amount,
      limit_amount = excluded.base_limit_amount + usage_entitlements.bonus_limit_amount,
      subscription_id = excluded.subscription_id,
      current_usage = 0,
      is_paused = false,
      notification_sent_80 = false,
      notification_sent_90 = false,
      notification_sent_100 = false,
      updated_at = now();

    if v_delta <> 0 or v_is_first_charge then
      insert into entitlement_ledger_entries (
        tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id
      ) values (
        v_sub.tenant_id,
        v_sub.id,
        v_metric,
        case when v_delta = 0 then v_new_base_val else v_delta end,
        case when v_is_first_charge then 'subscription_activation' else 'subscription_renewal' end,
        'payment_order',
        v_order.id::text
      )
      on conflict (tenant_id, reference_type, reference_id, metric)
        where reference_type is not null and reference_id is not null
        do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'fulfilled', true,
    'already_fulfilled', false,
    'order_id', v_order.id,
    'purpose', 'subscription_payment',
    'subscription_id', v_sub.id,
    'tenant_id', v_sub.tenant_id,
    'is_first_charge', v_is_first_charge,
    'plan_tier', v_effective_plan
  );
end;
$$;

revoke execute on function public.reconcile_and_fulfill_razorpay_subscription_charge(text, text, text, text, bigint, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.reconcile_and_fulfill_razorpay_subscription_charge(text, text, text, text, bigint, text, text, boolean, text) to service_role;
