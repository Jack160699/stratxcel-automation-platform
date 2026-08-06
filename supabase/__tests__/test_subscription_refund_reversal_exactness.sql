DO $$
DECLARE
  v_tenant uuid;
  v_link_valid uuid;
  v_sub_valid uuid;
  v_order_valid uuid;
  v_refund_valid uuid;

  v_link_partial uuid;
  v_sub_partial uuid;
  v_order_partial uuid;
  v_refund_partial uuid;

  v_link_missing uuid;
  v_order_missing uuid;
  v_refund_missing uuid;

  v_link_mismatched uuid;
  v_sub_mismatched uuid;
  v_order_mismatched uuid;
  v_refund_mismatched uuid;

  v_link_non_ref uuid;
  v_sub_non_ref uuid;
  v_order_non_ref uuid;
  v_refund_non_ref uuid;

  v_link_consumed uuid;
  v_sub_consumed uuid;
  v_order_consumed uuid;
  v_refund_consumed uuid;

  v_res jsonb;
  v_status text;
  v_reason text;
  v_processed_at timestamptz;
  v_sub_status text;
  v_base_limit int;
  v_bonus_limit int;
  v_limit_amt int;
  v_ledger_count int;
  v_ledger_units int;
BEGIN
  -- Setup isolated tenant
  INSERT INTO tenants (name, slug) VALUES ('Tenant Sub Refund Test', 'tenant-sub-ref-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- ------------------------------------------------------------
  -- Case 1: Valid full refund with unused base entitlements -> SUCCEEDS
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'ref_sub_link_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_valid;

  INSERT INTO subscriptions (tenant_id, plan_tier, price_cents, payment_link_id, status)
  VALUES (v_tenant, 'growth', 1899900, v_link_valid, 'active')
  RETURNING id INTO v_sub_valid;

  INSERT INTO usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
  VALUES (v_tenant, v_sub_valid, 'social_posts', 100, 20, 120, 10); -- base=100, bonus=20, usage=10 <= 20 bonus limit

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_sub_val1', 'order_sub_val1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_link_valid::text)
  RETURNING id INTO v_order_valid;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_valid, 199000, 'PENDING')
  RETURNING id INTO v_refund_valid;

  v_res := process_refund_atomic_v9(
    p_refund_id => v_refund_valid,
    p_payment_order_id => v_order_valid,
    p_provider_refund_id => 'rfnd_sub_val1',
    p_provider_payment_id => 'pay_sub_val1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at INTO v_status, v_processed_at FROM payment_refunds WHERE id = v_refund_valid;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_valid;
  SELECT base_limit_amount, bonus_limit_amount, limit_amount INTO v_base_limit, v_bonus_limit, v_limit_amt FROM usage_entitlements WHERE id IN (SELECT id FROM usage_entitlements WHERE subscription_id = v_sub_valid);
  SELECT count(*), coalesce(max(delta_units), 0) INTO v_ledger_count, v_ledger_units FROM entitlement_ledger_entries WHERE subscription_id = v_sub_valid;

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_status <> 'PROCESSED'
     OR v_processed_at IS NULL
     OR v_sub_status <> 'refunded'
     OR v_base_limit <> 0
     OR v_bonus_limit <> 20
     OR v_limit_amt <> 20
     OR v_ledger_count <> 1
     OR v_ledger_units <> -100 THEN
    RAISE EXCEPTION 'Case 1 Failed: Full valid sub refund failed. Res=%, status=%, sub_status=%, base=%, bonus=%, limit=%, ledger_count=%, ledger_units=%', v_res, v_status, v_sub_status, v_base_limit, v_bonus_limit, v_limit_amt, v_ledger_count, v_ledger_units;
  END IF;

  -- Test duplicate processing does not reverse twice
  v_res := process_refund_atomic_v9(
    p_refund_id => v_refund_valid,
    p_payment_order_id => v_order_valid,
    p_provider_refund_id => 'rfnd_sub_val1',
    p_provider_payment_id => 'pay_sub_val1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT count(*) INTO v_ledger_count FROM entitlement_ledger_entries WHERE subscription_id = v_sub_valid;

  IF (v_res->>'already_processed')::boolean IS NOT TRUE
     OR v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Case 1 Duplicate Failed: Duplicate processing created duplicate ledger entry! Res=%, ledger_count=%', v_res, v_ledger_count;
  END IF;

  -- ------------------------------------------------------------
  -- Case 2: Partial refund -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'ref_sub_link_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_partial;

  INSERT INTO subscriptions (tenant_id, plan_tier, price_cents, payment_link_id, status)
  VALUES (v_tenant, 'growth', 1899900, v_link_partial, 'active')
  RETURNING id INTO v_sub_partial;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_sub_part1', 'order_sub_part1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_link_partial::text)
  RETURNING id INTO v_order_partial;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_partial, 50000, 'PENDING') -- partial 50000 < 199000
  RETURNING id INTO v_refund_partial;

  v_res := process_refund_atomic_v9(
    p_refund_id => v_refund_partial,
    p_payment_order_id => v_order_partial,
    p_provider_refund_id => 'rfnd_sub_part1',
    p_provider_payment_id => 'pay_sub_part1',
    p_actual_refund_amount_cents => 50000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_partial;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'partial_subscription_refund_manual_review'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Case 2 Failed: Partial refund was not rejected to MANUAL_REVIEW. Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 3: Missing subscription -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'ref_sub_link_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_missing;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_sub_miss1', 'order_sub_miss1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_link_missing::text)
  RETURNING id INTO v_order_missing;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_missing, 199000, 'PENDING')
  RETURNING id INTO v_refund_missing;

  v_res := process_refund_atomic_v9(
    p_refund_id => v_refund_missing,
    p_payment_order_id => v_order_missing,
    p_provider_refund_id => 'rfnd_sub_miss1',
    p_provider_payment_id => 'pay_sub_miss1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_missing;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'subscription_not_found_for_refund'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Case 3 Failed: Missing sub was not rejected to MANUAL_REVIEW. Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 4: Wrong payment link relationship -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'ref_sub_link_' || gen_random_uuid()::text, 199000, 'domain_purchase', 'paid') -- wrong purpose domain_purchase!
  RETURNING id INTO v_link_mismatched;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_sub_mismatch1', 'order_sub_mismatch1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_link_mismatched::text)
  RETURNING id INTO v_order_mismatched;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_mismatched, 199000, 'PENDING')
  RETURNING id INTO v_refund_mismatched;

  v_res := process_refund_atomic_v9(
    p_refund_id => v_refund_mismatched,
    p_payment_order_id => v_order_mismatched,
    p_provider_refund_id => 'rfnd_sub_mismatch1',
    p_provider_payment_id => 'pay_sub_mismatch1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_mismatched;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'subscription_refund_relationship_mismatch'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Case 4 Failed: Wrong payment link relationship was not rejected to MANUAL_REVIEW. Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 5: Non-refundable subscription state -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'ref_sub_link_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_non_ref;

  INSERT INTO subscriptions (tenant_id, plan_tier, price_cents, payment_link_id, status)
  VALUES (v_tenant, 'growth', 1899900, v_link_non_ref, 'pending_payment') -- pending_payment!
  RETURNING id INTO v_sub_non_ref;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_sub_nonref1', 'order_sub_nonref1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_link_non_ref::text)
  RETURNING id INTO v_order_non_ref;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_non_ref, 199000, 'PENDING')
  RETURNING id INTO v_refund_non_ref;

  v_res := process_refund_atomic_v9(
    p_refund_id => v_refund_non_ref,
    p_payment_order_id => v_order_non_ref,
    p_provider_refund_id => 'rfnd_sub_nonref1',
    p_provider_payment_id => 'pay_sub_nonref1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_non_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_non_ref;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'subscription_state_not_refundable'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_sub_status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Case 5 Failed: Non-refundable state sub was not rejected to MANUAL_REVIEW. Res=%, status=%, sub_status=%', v_res, v_status, v_sub_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 6: Consumed or unverifiable entitlement usage -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'ref_sub_link_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_consumed;

  INSERT INTO subscriptions (tenant_id, plan_tier, price_cents, payment_link_id, status)
  VALUES (v_tenant, 'growth', 1899900, v_link_consumed, 'active')
  RETURNING id INTO v_sub_consumed;

  -- base_limit=100, bonus_limit=0, usage=50 (usage > bonus_limit 0, so base units consumed!)
  INSERT INTO usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
  VALUES (v_tenant, v_sub_consumed, 'meta_ad_campaigns', 100, 0, 100, 50);

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_sub_cons1', 'order_sub_cons1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_link_consumed::text)
  RETURNING id INTO v_order_consumed;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_consumed, 199000, 'PENDING')
  RETURNING id INTO v_refund_consumed;

  v_res := process_refund_atomic_v9(
    p_refund_id => v_refund_consumed,
    p_payment_order_id => v_order_consumed,
    p_provider_refund_id => 'rfnd_sub_cons1',
    p_provider_payment_id => 'pay_sub_cons1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_consumed;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_consumed;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'consumed_or_unverifiable_subscription_units_manual_review'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_sub_status <> 'active' THEN
    RAISE EXCEPTION 'Case 6 Failed: Consumed base units sub was not rejected to MANUAL_REVIEW. Res=%, status=%, sub_status=%', v_res, v_status, v_sub_status;
  END IF;

  -- Cleanup test tenant
  DELETE FROM entitlement_ledger_entries WHERE tenant_id = v_tenant;
  DELETE FROM payment_refunds WHERE tenant_id = v_tenant;
  DELETE FROM payment_orders WHERE tenant_id = v_tenant;
  DELETE FROM usage_entitlements WHERE tenant_id = v_tenant;
  DELETE FROM subscriptions WHERE tenant_id = v_tenant;
  DELETE FROM payment_links WHERE tenant_id = v_tenant;
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL PROCESS_REFUND_ATOMIC_V9 POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
