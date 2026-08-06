DO $$
DECLARE
  v_tenant uuid;
  v_pack_valid uuid;
  v_pack_non_applied uuid;
  v_pack_consumed uuid;
  v_order_valid uuid;
  v_order_partial uuid;
  v_order_missing uuid;
  v_order_non_applied uuid;
  v_order_consumed uuid;
  v_refund_valid uuid;
  v_refund_partial uuid;
  v_refund_missing uuid;
  v_refund_non_applied uuid;
  v_refund_consumed uuid;
  v_res jsonb;
  v_status text;
  v_reason text;
  v_processed_at timestamptz;
  v_pack_status text;
  v_bonus_limit int;
  v_limit_amt int;
  v_ledger_count int;
  v_ledger_units int;
BEGIN
  -- Setup isolated tenant
  INSERT INTO tenants (name, slug) VALUES ('Tenant Pack Refund Test', 'tenant-pack-ref-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- Create entitlement with base_limit_amount = 100, bonus_limit_amount = 50, limit_amount = 150, current_usage = 10 (usage strictly within base_limit!)
  INSERT INTO usage_entitlements (tenant_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
  VALUES (v_tenant, 'social_posts', 100, 50, 150, 10);

  -- ------------------------------------------------------------
  -- Case 1: Full refund with provably unused units -> SUCCEEDS
  -- ------------------------------------------------------------
  INSERT INTO continuation_packs (tenant_id, metric, extra_units, price_cents, status)
  VALUES (v_tenant, 'social_posts', 50, 49900, 'applied')
  RETURNING id INTO v_pack_valid;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_pack_val1', 'order_pack_val1', 49900, 'INR', 'CAPTURED', 'continuation_pack', 'live', 'continuation_pack', v_pack_valid::text)
  RETURNING id INTO v_order_valid;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_valid, 49900, 'PENDING')
  RETURNING id INTO v_refund_valid;

  v_res := process_refund_atomic_v8(
    p_refund_id => v_refund_valid,
    p_payment_order_id => v_order_valid,
    p_provider_refund_id => 'rfnd_pack_val1',
    p_provider_payment_id => 'pay_pack_val1',
    p_actual_refund_amount_cents => 49900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at INTO v_status, v_processed_at FROM payment_refunds WHERE id = v_refund_valid;
  SELECT status INTO v_pack_status FROM continuation_packs WHERE id = v_pack_valid;
  SELECT bonus_limit_amount, limit_amount INTO v_bonus_limit, v_limit_amt FROM usage_entitlements WHERE tenant_id = v_tenant AND metric = 'social_posts';
  SELECT count(*), coalesce(max(delta_units), 0) INTO v_ledger_count, v_ledger_units FROM entitlement_ledger_entries WHERE tenant_id = v_tenant AND continuation_pack_id = v_pack_valid;

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_status <> 'PROCESSED'
     OR v_processed_at IS NULL
     OR v_pack_status <> 'refunded'
     OR v_bonus_limit <> 0
     OR v_limit_amt <> 100
     OR v_ledger_count <> 1
     OR v_ledger_units <> -50 THEN
    RAISE EXCEPTION 'Case 1 Failed: Full valid pack refund failed. Res=%, status=%, pack_status=%, bonus=%, limit=%, ledger_count=%, ledger_units=%', v_res, v_status, v_pack_status, v_bonus_limit, v_limit_amt, v_ledger_count, v_ledger_units;
  END IF;

  -- Test duplicate processing of an already-PROCESSED refund does not subtract units twice
  v_res := process_refund_atomic_v8(
    p_refund_id => v_refund_valid,
    p_payment_order_id => v_order_valid,
    p_provider_refund_id => 'rfnd_pack_val1',
    p_provider_payment_id => 'pay_pack_val1',
    p_actual_refund_amount_cents => 49900,
    p_provider_refund_status => 'processed'
  );

  SELECT bonus_limit_amount, limit_amount INTO v_bonus_limit, v_limit_amt FROM usage_entitlements WHERE tenant_id = v_tenant AND metric = 'social_posts';
  SELECT count(*) INTO v_ledger_count FROM entitlement_ledger_entries WHERE tenant_id = v_tenant AND continuation_pack_id = v_pack_valid;

  IF (v_res->>'already_processed')::boolean IS NOT TRUE
     OR v_bonus_limit <> 0
     OR v_limit_amt <> 100
     OR v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Case 1 Duplicate Failed: Duplicate processing subtracted units twice! Res=%, bonus=%, limit=%, ledger_count=%', v_res, v_bonus_limit, v_limit_amt, v_ledger_count;
  END IF;

  -- ------------------------------------------------------------
  -- Case 2: Partial refund -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO continuation_packs (tenant_id, metric, extra_units, price_cents, status)
  VALUES (v_tenant, 'social_posts', 50, 49900, 'applied')
  RETURNING id INTO v_pack_valid; -- create second pack for partial test

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_pack_part1', 'order_pack_part1', 49900, 'INR', 'CAPTURED', 'continuation_pack', 'live', 'continuation_pack', v_pack_valid::text)
  RETURNING id INTO v_order_partial;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_partial, 20000, 'PENDING') -- partial 20000 < 49900
  RETURNING id INTO v_refund_partial;

  v_res := process_refund_atomic_v8(
    p_refund_id => v_refund_partial,
    p_payment_order_id => v_order_partial,
    p_provider_refund_id => 'rfnd_pack_part1',
    p_provider_payment_id => 'pay_pack_part1',
    p_actual_refund_amount_cents => 20000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_partial;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'partial_continuation_pack_refund_manual_review'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Case 2 Failed: Partial refund was not rejected to MANUAL_REVIEW. Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 3: Missing pack -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_pack_miss1', 'order_pack_miss1', 49900, 'INR', 'CAPTURED', 'continuation_pack', 'live', 'continuation_pack', gen_random_uuid()::text)
  RETURNING id INTO v_order_missing;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_missing, 49900, 'PENDING')
  RETURNING id INTO v_refund_missing;

  v_res := process_refund_atomic_v8(
    p_refund_id => v_refund_missing,
    p_payment_order_id => v_order_missing,
    p_provider_refund_id => 'rfnd_pack_miss1',
    p_provider_payment_id => 'pay_pack_miss1',
    p_actual_refund_amount_cents => 49900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_missing;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'continuation_pack_not_found_for_refund'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Case 3 Failed: Missing pack was not rejected to MANUAL_REVIEW. Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 4: Non-applied pack -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO continuation_packs (tenant_id, metric, extra_units, price_cents, status)
  VALUES (v_tenant, 'social_posts', 50, 49900, 'pending')
  RETURNING id INTO v_pack_non_applied;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_pack_nonapp1', 'order_pack_nonapp1', 49900, 'INR', 'CAPTURED', 'continuation_pack', 'live', 'continuation_pack', v_pack_non_applied::text)
  RETURNING id INTO v_order_non_applied;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_non_applied, 49900, 'PENDING')
  RETURNING id INTO v_refund_non_applied;

  v_res := process_refund_atomic_v8(
    p_refund_id => v_refund_non_applied,
    p_payment_order_id => v_order_non_applied,
    p_provider_refund_id => 'rfnd_pack_nonapp1',
    p_provider_payment_id => 'pay_pack_nonapp1',
    p_actual_refund_amount_cents => 49900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_non_applied;
  SELECT status INTO v_pack_status FROM continuation_packs WHERE id = v_pack_non_applied;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'continuation_pack_state_not_refundable'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_pack_status <> 'pending' THEN
    RAISE EXCEPTION 'Case 4 Failed: Non-applied pack was not rejected to MANUAL_REVIEW. Res=%, status=%, pack_status=%', v_res, v_status, v_pack_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 5: Consumed or unverifiable units -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  -- Set current_usage = 120 (usage > base_limit_amount 100, so bonus units have been consumed!)
  UPDATE usage_entitlements SET current_usage = 120, bonus_limit_amount = 50, limit_amount = 150 WHERE tenant_id = v_tenant AND metric = 'social_posts';

  INSERT INTO continuation_packs (tenant_id, metric, extra_units, price_cents, status)
  VALUES (v_tenant, 'social_posts', 50, 49900, 'applied')
  RETURNING id INTO v_pack_consumed;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_pack_cons1', 'order_pack_cons1', 49900, 'INR', 'CAPTURED', 'continuation_pack', 'live', 'continuation_pack', v_pack_consumed::text)
  RETURNING id INTO v_order_consumed;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_consumed, 49900, 'PENDING')
  RETURNING id INTO v_refund_consumed;

  v_res := process_refund_atomic_v8(
    p_refund_id => v_refund_consumed,
    p_payment_order_id => v_order_consumed,
    p_provider_refund_id => 'rfnd_pack_cons1',
    p_provider_payment_id => 'pay_pack_cons1',
    p_actual_refund_amount_cents => 49900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_consumed;
  SELECT status INTO v_pack_status FROM continuation_packs WHERE id = v_pack_consumed;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'consumed_or_unverifiable_bonus_units_manual_review'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_pack_status <> 'applied' THEN
    RAISE EXCEPTION 'Case 5 Failed: Consumed bonus units pack was not rejected to MANUAL_REVIEW. Res=%, status=%, pack_status=%', v_res, v_status, v_pack_status;
  END IF;

  -- Cleanup test tenant
  DELETE FROM entitlement_ledger_entries WHERE tenant_id = v_tenant;
  DELETE FROM payment_refunds WHERE tenant_id = v_tenant;
  DELETE FROM payment_orders WHERE tenant_id = v_tenant;
  DELETE FROM continuation_packs WHERE tenant_id = v_tenant;
  DELETE FROM usage_entitlements WHERE tenant_id = v_tenant;
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL PROCESS_REFUND_ATOMIC_V8 POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
