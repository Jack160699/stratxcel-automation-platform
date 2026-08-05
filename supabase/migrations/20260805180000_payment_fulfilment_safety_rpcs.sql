-- Migration: Payment Fulfilment Safety RPCs
-- Provides atomic transactional RPCs for subscription activation, continuation pack entitlement grants, audit credit consumption, and domain payment recording.

-- 1. Atomic Subscription Payment Fulfilment
create or replace function public.fulfill_subscription_payment_atomic(
  p_payment_link_id text,
  p_provider_payment_id text,
  p_tenant_id uuid,
  p_amount_cents integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_sub record;
  v_already_fulfilled boolean := false;
begin
  -- Lock & verify payment link
  select * into v_link
  from payment_links
  where id = p_payment_link_id
  for update;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found');
  end if;

  if v_link.tenant_id <> p_tenant_id then
    return jsonb_build_object('fulfilled', false, 'reason', 'tenant_mismatch');
  end if;

  if v_link.payment_purpose <> 'subscription_payment' then
    return jsonb_build_object('fulfilled', false, 'reason', 'purpose_mismatch');
  end if;

  if v_link.amount_cents <> p_amount_cents or upper(v_link.currency) <> upper(p_currency) then
    return jsonb_build_object('fulfilled', false, 'reason', 'amount_or_currency_mismatch');
  end if;

  -- Update payment link status to paid if not already
  update payment_links
  set status = 'paid',
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      updated_at = now()
  where id = p_payment_link_id;

  -- Lock & verify subscription
  select * into v_sub
  from subscriptions
  where payment_link_id = p_payment_link_id
     or id::text = v_link.reference_id
  for update;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_found');
  end if;

  if v_sub.status = 'active' then
    return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'subscription_id', v_sub.id);
  end if;

  if v_sub.status <> 'pending_payment' and v_sub.status <> 'past_due' then
    return jsonb_build_object('fulfilled', false, 'reason', 'invalid_subscription_status', 'status', v_sub.status);
  end if;

  -- Activate subscription atomically
  update subscriptions
  set status = 'active',
      started_at = coalesce(started_at, now()),
      current_period_end = now() + interval '30 days',
      updated_at = now()
  where id = v_sub.id;

  -- Consume audit credit atomically if linked and not consumed
  if v_sub.audit_order_id is not null then
    update audit_orders
    set credit_consumed_at = coalesce(credit_consumed_at, now()),
        credit_consumed_subscription_id = coalesce(credit_consumed_subscription_id, v_sub.id),
        updated_at = now()
    where id = v_sub.audit_order_id
      and credit_consumed_at is null;
  end if;

  return jsonb_build_object(
    'fulfilled', true,
    'already_fulfilled', false,
    'subscription_id', v_sub.id,
    'tenant_id', v_sub.tenant_id,
    'plan_tier', v_sub.plan_tier
  );
end;
$$;

-- 2. Atomic Continuation Pack Fulfilment
create or replace function public.fulfill_continuation_pack_payment_atomic(
  p_payment_link_id text,
  p_tenant_id uuid,
  p_amount_cents integer,
  p_currency text
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
  select * into v_link
  from payment_links
  where id = p_payment_link_id
  for update;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found');
  end if;

  if v_link.payment_purpose <> 'continuation_pack' then
    return jsonb_build_object('fulfilled', false, 'reason', 'purpose_mismatch');
  end if;

  if v_link.tenant_id <> p_tenant_id then
    return jsonb_build_object('fulfilled', false, 'reason', 'tenant_mismatch');
  end if;

  select * into v_pack
  from continuation_packs
  where payment_link_id = p_payment_link_id
     or id::text = v_link.reference_id
  for update;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'continuation_pack_not_found');
  end if;

  if v_pack.status = 'paid' then
    return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'pack_id', v_pack.id);
  end if;

  update continuation_packs
  set status = 'paid',
      updated_at = now()
  where id = v_pack.id;

  return jsonb_build_object(
    'fulfilled', true,
    'already_fulfilled', false,
    'pack_id', v_pack.id,
    'units_granted', v_pack.unit_count
  );
end;
$$;

-- 3. Atomic Domain Payment Recording (Moves to paid_pending_registration, NOT active)
create or replace function public.record_domain_payment_atomic(
  p_payment_link_id text,
  p_tenant_id uuid,
  p_amount_cents integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_domain record;
begin
  select * into v_link
  from payment_links
  where id = p_payment_link_id
  for update;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found');
  end if;

  if v_link.payment_purpose <> 'domain_purchase' and v_link.payment_purpose <> 'domain_renewal' then
    return jsonb_build_object('fulfilled', false, 'reason', 'purpose_mismatch');
  end if;

  select * into v_domain
  from domains
  where payment_link_id = p_payment_link_id
     or id::text = v_link.reference_id
  for update;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'domain_record_not_found');
  end if;

  if v_domain.status = 'paid_pending_registration' or v_domain.status = 'active' then
    return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'domain_id', v_domain.id, 'status', v_domain.status);
  end if;

  update domains
  set status = 'paid_pending_registration',
      updated_at = now()
  where id = v_domain.id;

  return jsonb_build_object(
    'fulfilled', true,
    'already_fulfilled', false,
    'domain_id', v_domain.id,
    'status', 'paid_pending_registration'
  );
end;
$$;
