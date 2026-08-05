-- Additive migration: process_refund_atomic_v5
-- Enforces provider relationship, payment order, amount, duplicate provider_refund_id, and provider status validation.
-- Revokes execution of process_refund_atomic_v4 and restricts v5 execution strictly to service_role.

create or replace function public.process_refund_atomic_v5(
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
  -- 1. Lock refund record
  select * into v_refund from payment_refunds where id = p_refund_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'refund_not_found');
  end if;

  -- 2. Lock payment order
  select * into v_order from payment_orders where id = p_payment_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'payment_order_not_found');
  end if;

  -- 3. Relationship Validation (payment_refunds.payment_order_id MUST match p_payment_order_id AND payment_orders.id)
  if v_refund.payment_order_id <> p_payment_order_id or v_refund.payment_order_id <> v_order.id then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'payment_order_relationship_mismatch' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'payment_order_relationship_mismatch', 'status', 'MANUAL_REVIEW');
  end if;

  -- 4. Tenant Matching
  if v_refund.tenant_id <> v_order.tenant_id then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'tenant_mismatch' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch', 'status', 'MANUAL_REVIEW');
  end if;

  -- 5. Payment Order State Check (MUST be CAPTURED)
  if v_order.state <> 'CAPTURED' then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'payment_order_not_captured' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'payment_order_not_captured', 'status', 'MANUAL_REVIEW');
  end if;

  -- 6. Provider Payment ID Validation
  if p_provider_payment_id is null or trim(p_provider_payment_id) = '' or p_provider_payment_id <> v_order.provider_payment_id then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'provider_payment_id_mismatch' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'provider_payment_id_mismatch', 'status', 'MANUAL_REVIEW');
  end if;

  -- 7. Provider Refund ID Validation (Present)
  if p_provider_refund_id is null or trim(p_provider_refund_id) = '' then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'missing_provider_refund_id' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'missing_provider_refund_id', 'status', 'MANUAL_REVIEW');
  end if;

  -- 8. Duplicate Provider Refund ID Validation (Cannot be attached to two different refund records)
  perform 1 from payment_refunds where provider_refund_id = p_provider_refund_id and id <> v_refund.id;
  if found then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'duplicate_provider_refund_id' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'duplicate_provider_refund_id', 'status', 'MANUAL_REVIEW');
  end if;

  -- 9. Refund Amount Validation (> 0 and equals payment_refunds.amount_cents)
  if p_actual_refund_amount_cents is null or p_actual_refund_amount_cents <= 0 then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'invalid_refund_amount' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'invalid_refund_amount', 'status', 'MANUAL_REVIEW');
  end if;

  if p_actual_refund_amount_cents <> v_refund.amount_cents then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'refund_amount_mismatch' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'refund_amount_mismatch', 'status', 'MANUAL_REVIEW');
  end if;

  -- 10. Provider Refund Status Validation (MUST be 'processed')
  -- For a provider refund that is not yet successfully processed (status <> 'processed'):
  -- Leave refund in PENDING status, return success=false with reason='provider_refund_not_processed'
  if p_provider_refund_status is null or lower(trim(p_provider_refund_status)) <> 'processed' then
    return jsonb_build_object('success', false, 'reason', 'provider_refund_not_processed', 'status', v_refund.status);
  end if;

  -- 11. Cumulative Refund Limit Check
  select coalesce(sum(amount_cents), 0) into v_cumulative_refund
  from payment_refunds
  where payment_order_id = v_order.id and status = 'PROCESSED' and id <> v_refund.id;

  if (v_cumulative_refund + p_actual_refund_amount_cents) > v_order.amount_cents then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'cumulative_refund_exceeds_captured' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'cumulative_refund_exceeds_captured', 'status', 'MANUAL_REVIEW');
  end if;

  -- 12. Idempotency Check
  if v_refund.status = 'PROCESSED' then
    return jsonb_build_object('success', true, 'already_processed', true, 'refund_id', p_refund_id);
  end if;

  v_purpose := v_order.payment_purpose;

  -- 13. PRODUCT REVERSAL MUTATION BY PURPOSE
  if v_purpose = 'wallet_topup' then
    select * into v_wallet from wallet_accounts where tenant_id = v_order.tenant_id for update;
    if found then
      update wallet_accounts set balance_cents = greatest(0::bigint, balance_cents - p_actual_refund_amount_cents), updated_at = now() where tenant_id = v_order.tenant_id;
      insert into wallet_ledger_entries (
        tenant_id, entry_type, amount_cents, reference_type, reference_id, metadata
      ) values (
        v_order.tenant_id, 'refund', -p_actual_refund_amount_cents,
        'payment_refund', p_refund_id::text, jsonb_build_object('refund_id', p_refund_id)
      ) on conflict (tenant_id, reference_type, reference_id, entry_type)
        where reference_type is not null and reference_id is not null
        do nothing;
    end if;

  elsif v_purpose = 'subscription_payment' then
    if p_actual_refund_amount_cents < v_order.amount_cents then
      -- Partial subscription refund requires MANUAL_REVIEW
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'partial_subscription_refund_manual_review' where id = p_refund_id;
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
        update payment_refunds set status = 'MANUAL_REVIEW', reason = 'consumed_bonus_units_manual_review' where id = p_refund_id;
        return jsonb_build_object('success', false, 'reason', 'consumed_bonus_units_manual_review', 'status', 'MANUAL_REVIEW');
      end if;
    end if;

  elsif v_purpose = 'domain_purchase' then
    select * into v_domain from domains where payment_link_id in (select id from payment_links where reference_id = v_order.reference_id) for update;
    if found then
      if v_domain.status = 'paid_pending_registration' then
        update domains set status = 'cancelled', updated_at = now() where id = v_domain.id;
      else
        update payment_refunds set status = 'MANUAL_REVIEW', reason = 'registered_domain_refund_manual_review' where id = p_refund_id;
        return jsonb_build_object('success', false, 'reason', 'registered_domain_refund_manual_review', 'status', 'MANUAL_REVIEW');
      end if;
    end if;
  end if;

  -- 14. Mark refund PROCESSED
  update payment_refunds
  set status = 'PROCESSED',
      provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
      processed_at = now()
  where id = p_refund_id;

  return jsonb_build_object('success', true, 'already_processed', false, 'refund_id', p_refund_id, 'status', 'PROCESSED');
end;
$$;

-- Revoke execution of process_refund_atomic_v4 from all roles
revoke execute on function public.process_refund_atomic_v4(uuid, uuid, text, text, bigint, text, text) from public, anon, authenticated, service_role;

-- Grant execution of process_refund_atomic_v5 only to service_role
revoke execute on function public.process_refund_atomic_v5(uuid, uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.process_refund_atomic_v5(uuid, uuid, text, text, bigint, text, text) to service_role;
