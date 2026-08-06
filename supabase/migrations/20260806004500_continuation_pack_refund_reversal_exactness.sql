-- Additive migration: process_refund_atomic_v8
-- Enforces exact continuation-pack refund reversal exactness and provable unit availability.
-- Requires pack relationship, applied status, full refund amount match, and provably unused bonus units (usage <= base_limit_amount).
-- On success: subtracts exact extra_units from bonus_limit_amount and limit_amount, marks pack refunded, inserts negative entitlement ledger entry (-extra_units), and marks refund PROCESSED.
-- On rejection: returns MANUAL_REVIEW with zero mutations to pack, entitlements, or ledger.
-- Revokes execution of process_refund_atomic_v7 and restricts v8 execution strictly to service_role.

create or replace function public.process_refund_atomic_v8(
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

  -- 13. EXPLICIT FAIL-CLOSED REFUND PURPOSE ROUTING
  if v_purpose = 'audit_fee' then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'audit_fee_refund_manual_review' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'audit_fee_refund_manual_review', 'status', 'MANUAL_REVIEW');

  elsif v_purpose = 'domain_renewal' then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'domain_renewal_refund_manual_review' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'domain_renewal_refund_manual_review', 'status', 'MANUAL_REVIEW');

  elsif v_purpose is null or trim(v_purpose) = '' or v_purpose not in ('wallet_topup', 'subscription_payment', 'continuation_pack', 'domain_purchase') then
    update payment_refunds set status = 'MANUAL_REVIEW', reason = 'unsupported_refund_purpose' where id = v_refund.id;
    return jsonb_build_object('success', false, 'reason', 'unsupported_refund_purpose', 'status', 'MANUAL_REVIEW', 'payment_purpose', v_purpose);
  end if;

  -- 14. PRODUCT REVERSAL MUTATION BY PURPOSE
  if v_purpose = 'wallet_topup' then
    select * into v_wallet from wallet_accounts where tenant_id = v_order.tenant_id for update;
    if not found then
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'wallet_account_not_found_for_refund' where id = v_refund.id;
      return jsonb_build_object('success', false, 'reason', 'wallet_account_not_found_for_refund', 'status', 'MANUAL_REVIEW');
    end if;

    if v_wallet.balance_cents < p_actual_refund_amount_cents then
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'wallet_balance_insufficient_for_refund' where id = v_refund.id;
      return jsonb_build_object(
        'success', false,
        'reason', 'wallet_balance_insufficient_for_refund',
        'status', 'MANUAL_REVIEW',
        'available_balance_cents', v_wallet.balance_cents,
        'required_refund_cents', p_actual_refund_amount_cents
      );
    end if;

    update wallet_accounts
    set balance_cents = balance_cents - p_actual_refund_amount_cents,
        updated_at = now()
    where tenant_id = v_order.tenant_id;

    insert into wallet_ledger_entries (
      tenant_id, entry_type, amount_cents, reference_type, reference_id, metadata
    ) values (
      v_order.tenant_id, 'refund', -p_actual_refund_amount_cents,
      'payment_refund', p_refund_id::text, jsonb_build_object('refund_id', p_refund_id)
    ) on conflict (tenant_id, reference_type, reference_id, entry_type)
      where reference_type is not null and reference_id is not null
      do nothing;

  elsif v_purpose = 'subscription_payment' then
    if p_actual_refund_amount_cents < v_order.amount_cents then
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'partial_subscription_refund_manual_review' where id = p_refund_id;
      return jsonb_build_object('success', false, 'reason', 'partial_subscription_refund_manual_review', 'status', 'MANUAL_REVIEW');
    end if;

    select * into v_sub from subscriptions where payment_link_id in (select id from payment_links where reference_id = v_order.reference_id) for update;
    if found then
      update subscriptions set status = 'refunded', updated_at = now() where id = v_sub.id;
      update usage_entitlements set base_limit_amount = 0, limit_amount = bonus_limit_amount, updated_at = now() where subscription_id = v_sub.id;
    end if;

  elsif v_purpose = 'continuation_pack' then
    -- Partial refund check
    if p_actual_refund_amount_cents < v_order.amount_cents then
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'partial_continuation_pack_refund_manual_review' where id = p_refund_id;
      return jsonb_build_object('success', false, 'reason', 'partial_continuation_pack_refund_manual_review', 'status', 'MANUAL_REVIEW');
    end if;

    -- Continuation Pack lookup
    select * into v_pack from continuation_packs where id::text = v_order.reference_id for update;
    if not found then
      select * into v_pack from continuation_packs where payment_link_id::text = v_order.reference_id for update;
    end if;
    if not found then
      select * into v_pack from continuation_packs
      where payment_link_id in (select id from payment_links where id::text = v_order.reference_id or reference_id = v_order.reference_id)
      for update;
    end if;

    if not found then
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'continuation_pack_not_found_for_refund' where id = p_refund_id;
      return jsonb_build_object('success', false, 'reason', 'continuation_pack_not_found_for_refund', 'status', 'MANUAL_REVIEW');
    end if;

    -- Tenant / Relationship check
    if v_pack.tenant_id <> v_order.tenant_id then
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'continuation_pack_refund_relationship_mismatch' where id = p_refund_id;
      return jsonb_build_object('success', false, 'reason', 'continuation_pack_refund_relationship_mismatch', 'status', 'MANUAL_REVIEW');
    end if;

    -- Pack Status check (MUST be 'applied')
    if v_pack.status <> 'applied' then
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'continuation_pack_state_not_refundable' where id = p_refund_id;
      return jsonb_build_object('success', false, 'reason', 'continuation_pack_state_not_refundable', 'status', 'MANUAL_REVIEW', 'pack_status', v_pack.status);
    end if;

    -- Load usage entitlement and verify provably unused bonus units
    select * into v_ent from usage_entitlements where tenant_id = v_order.tenant_id and metric = v_pack.metric for update;
    if not found
       or v_ent.bonus_limit_amount < v_pack.extra_units
       or v_ent.current_usage > v_ent.base_limit_amount
       or (v_ent.limit_amount - v_ent.current_usage) < v_pack.extra_units then
      update payment_refunds set status = 'MANUAL_REVIEW', reason = 'consumed_or_unverifiable_bonus_units_manual_review' where id = p_refund_id;
      return jsonb_build_object('success', false, 'reason', 'consumed_or_unverifiable_bonus_units_manual_review', 'status', 'MANUAL_REVIEW');
    end if;

    -- Execute reversal (exact subtraction, no greatest/clamping)
    update usage_entitlements
    set bonus_limit_amount = bonus_limit_amount - v_pack.extra_units,
        limit_amount = limit_amount - v_pack.extra_units,
        updated_at = now()
    where id = v_ent.id;

    update continuation_packs
    set status = 'refunded',
        updated_at = now()
    where id = v_pack.id;

    insert into entitlement_ledger_entries (
      tenant_id, subscription_id, continuation_pack_id, metric, delta_units, reason, reference_type, reference_id
    ) values (
      v_order.tenant_id, v_pack.subscription_id, v_pack.id, v_pack.metric, -v_pack.extra_units,
      'continuation_pack_refund', 'payment_refund', p_refund_id::text
    ) on conflict (tenant_id, reference_type, reference_id, metric)
      where reference_type is not null and reference_id is not null
      do nothing;

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

  -- 15. Mark refund PROCESSED
  update payment_refunds
  set status = 'PROCESSED',
      provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
      processed_at = now()
  where id = p_refund_id;

  return jsonb_build_object('success', true, 'already_processed', false, 'refund_id', p_refund_id, 'status', 'PROCESSED');
end;
$$;

-- Revoke execution of process_refund_atomic_v7 from all roles
revoke execute on function public.process_refund_atomic_v7(uuid, uuid, text, text, bigint, text, text) from public, anon, authenticated, service_role;

-- Grant execution of process_refund_atomic_v8 only to service_role
revoke execute on function public.process_refund_atomic_v8(uuid, uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.process_refund_atomic_v8(uuid, uuid, text, text, bigint, text, text) to service_role;
