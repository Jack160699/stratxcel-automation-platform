DO $$
DECLARE
  v_tenant_exact uuid;
  v_tenant_exceed uuid;
  v_tenant_below uuid;
  v_tenant_missing uuid;
  v_order_id_exact uuid;
  v_order_id_exceed uuid;
  v_order_id_below uuid;
  v_order_id_missing uuid;
  v_refund_id_exact uuid;
  v_refund_id_exceed uuid;
  v_refund_id_below uuid;
  v_refund_id_missing uuid;
  v_res jsonb;
  v_status text;
  v_reason text;
  v_processed_at timestamptz;
  v_bal bigint;
  v_ledger_count int;
  v_ledger_amt bigint;
BEGIN
  -- ------------------------------------------------------------
  -- Case 1: Wallet balance exactly equals refund -> succeeds and becomes zero
  -- ------------------------------------------------------------
  INSERT INTO tenants (name, slug) VALUES ('Tenant Exact Refund', 'tenant-exact-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_exact;
  INSERT INTO wallet_accounts (tenant_id, balance_cents) VALUES (v_tenant_exact, 10000);

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant_exact, 'razorpay', 'pay_exact_1', 'order_exact_1', 10000, 'INR', 'CAPTURED', 'wallet_topup', 'live', 'payment_link', 'pl_exact_1')
  RETURNING id INTO v_order_id_exact;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant_exact, v_order_id_exact, 10000, 'PENDING')
  RETURNING id INTO v_refund_id_exact;

  v_res := process_refund_atomic_v7(
    p_refund_id => v_refund_id_exact,
    p_payment_order_id => v_order_id_exact,
    p_provider_refund_id => 'rfnd_exact_1',
    p_provider_payment_id => 'pay_exact_1',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at INTO v_status, v_processed_at FROM payment_refunds WHERE id = v_refund_id_exact;
  SELECT balance_cents INTO v_bal FROM wallet_accounts WHERE tenant_id = v_tenant_exact;
  SELECT count(*), coalesce(max(amount_cents), 0) INTO v_ledger_count, v_ledger_amt FROM wallet_ledger_entries WHERE tenant_id = v_tenant_exact AND reference_type = 'payment_refund';

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_status <> 'PROCESSED'
     OR v_processed_at IS NULL
     OR v_bal <> 0
     OR v_ledger_count <> 1
     OR v_ledger_amt <> -10000 THEN
    RAISE EXCEPTION 'Case 1 Failed: Exact balance refund failed. Res=%, status=%, bal=%, ledger_count=%, ledger_amt=%', v_res, v_status, v_bal, v_ledger_count, v_ledger_amt;
  END IF;

  -- Test duplicate processing of an already-PROCESSED refund does not deduct twice
  v_res := process_refund_atomic_v7(
    p_refund_id => v_refund_id_exact,
    p_payment_order_id => v_order_id_exact,
    p_provider_refund_id => 'rfnd_exact_1',
    p_provider_payment_id => 'pay_exact_1',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT balance_cents INTO v_bal FROM wallet_accounts WHERE tenant_id = v_tenant_exact;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant_exact AND reference_type = 'payment_refund';

  IF (v_res->>'already_processed')::boolean IS NOT TRUE
     OR v_bal <> 0
     OR v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Case 1 Duplicate Failed: Duplicate processing deducted twice! Res=%, bal=%, ledger_count=%', v_res, v_bal, v_ledger_count;
  END IF;

  -- ------------------------------------------------------------
  -- Case 2: Wallet balance exceeds refund -> succeeds with exact remainder
  -- ------------------------------------------------------------
  INSERT INTO tenants (name, slug) VALUES ('Tenant Exceed Refund', 'tenant-exceed-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_exceed;
  INSERT INTO wallet_accounts (tenant_id, balance_cents) VALUES (v_tenant_exceed, 15000);

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant_exceed, 'razorpay', 'pay_exceed_1', 'order_exceed_1', 10000, 'INR', 'CAPTURED', 'wallet_topup', 'live', 'payment_link', 'pl_exceed_1')
  RETURNING id INTO v_order_id_exceed;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant_exceed, v_order_id_exceed, 10000, 'PENDING')
  RETURNING id INTO v_refund_id_exceed;

  v_res := process_refund_atomic_v7(
    p_refund_id => v_refund_id_exceed,
    p_payment_order_id => v_order_id_exceed,
    p_provider_refund_id => 'rfnd_exceed_1',
    p_provider_payment_id => 'pay_exceed_1',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at INTO v_status, v_processed_at FROM payment_refunds WHERE id = v_refund_id_exceed;
  SELECT balance_cents INTO v_bal FROM wallet_accounts WHERE tenant_id = v_tenant_exceed;
  SELECT count(*), coalesce(max(amount_cents), 0) INTO v_ledger_count, v_ledger_amt FROM wallet_ledger_entries WHERE tenant_id = v_tenant_exceed AND reference_type = 'payment_refund';

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_status <> 'PROCESSED'
     OR v_processed_at IS NULL
     OR v_bal <> 5000
     OR v_ledger_count <> 1
     OR v_ledger_amt <> -10000 THEN
    RAISE EXCEPTION 'Case 2 Failed: Exceed balance refund failed. Res=%, status=%, bal=%, ledger_count=%, ledger_amt=%', v_res, v_status, v_bal, v_ledger_count, v_ledger_amt;
  END IF;

  -- ------------------------------------------------------------
  -- Case 3: Wallet balance below refund -> MANUAL_REVIEW with no mutation
  -- ------------------------------------------------------------
  INSERT INTO tenants (name, slug) VALUES ('Tenant Below Refund', 'tenant-below-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_below;
  INSERT INTO wallet_accounts (tenant_id, balance_cents) VALUES (v_tenant_below, 4000); -- only 4000 available for 10000 refund

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant_below, 'razorpay', 'pay_below_1', 'order_below_1', 10000, 'INR', 'CAPTURED', 'wallet_topup', 'live', 'payment_link', 'pl_below_1')
  RETURNING id INTO v_order_id_below;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant_below, v_order_id_below, 10000, 'PENDING')
  RETURNING id INTO v_refund_id_below;

  v_res := process_refund_atomic_v7(
    p_refund_id => v_refund_id_below,
    p_payment_order_id => v_order_id_below,
    p_provider_refund_id => 'rfnd_below_1',
    p_provider_payment_id => 'pay_below_1',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_id_below;
  SELECT balance_cents INTO v_bal FROM wallet_accounts WHERE tenant_id = v_tenant_below;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant_below;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'wallet_balance_insufficient_for_refund'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_bal <> 4000
     OR v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Case 3 Failed: Insufficient wallet balance was not rejected to MANUAL_REVIEW. Res=%, status=%, bal=%, ledger_count=%', v_res, v_status, v_bal, v_ledger_count;
  END IF;

  -- ------------------------------------------------------------
  -- Case 4: Missing wallet account -> MANUAL_REVIEW with no ledger entry
  -- ------------------------------------------------------------
  INSERT INTO tenants (name, slug) VALUES ('Tenant Missing Wallet', 'tenant-missing-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_missing;
  -- Intentionally DO NOT create wallet_accounts row for v_tenant_missing!

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant_missing, 'razorpay', 'pay_missing_1', 'order_missing_1', 10000, 'INR', 'CAPTURED', 'wallet_topup', 'live', 'payment_link', 'pl_missing_1')
  RETURNING id INTO v_order_id_missing;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant_missing, v_order_id_missing, 10000, 'PENDING')
  RETURNING id INTO v_refund_id_missing;

  v_res := process_refund_atomic_v7(
    p_refund_id => v_refund_id_missing,
    p_payment_order_id => v_order_id_missing,
    p_provider_refund_id => 'rfnd_missing_1',
    p_provider_payment_id => 'pay_missing_1',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_status, v_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_id_missing;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant_missing;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'wallet_account_not_found_for_refund'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Case 4 Failed: Missing wallet account was not rejected to MANUAL_REVIEW. Res=%, status=%, ledger_count=%', v_res, v_status, v_ledger_count;
  END IF;

  -- Cleanup test tenants
  DELETE FROM wallet_ledger_entries WHERE tenant_id IN (v_tenant_exact, v_tenant_exceed, v_tenant_below, v_tenant_missing);
  DELETE FROM payment_refunds WHERE tenant_id IN (v_tenant_exact, v_tenant_exceed, v_tenant_below, v_tenant_missing);
  DELETE FROM payment_orders WHERE tenant_id IN (v_tenant_exact, v_tenant_exceed, v_tenant_below, v_tenant_missing);
  DELETE FROM wallet_accounts WHERE tenant_id IN (v_tenant_exact, v_tenant_exceed, v_tenant_below, v_tenant_missing);
  DELETE FROM tenants WHERE id IN (v_tenant_exact, v_tenant_exceed, v_tenant_below, v_tenant_missing);

  RAISE NOTICE 'ALL PROCESS_REFUND_ATOMIC_V7 POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
