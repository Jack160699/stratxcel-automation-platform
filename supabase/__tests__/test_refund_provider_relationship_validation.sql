DO $$
DECLARE
  v_tenant uuid;
  v_order_id uuid;
  v_order_id_other uuid;
  v_refund_id uuid;
  v_refund_id_dup uuid;
  v_wallet_acc uuid;
  v_res jsonb;
  v_refund_status text;
  v_refund_reason text;
  v_wallet_bal bigint;
  v_ledger_count int;
BEGIN
  -- Setup isolated Tenant
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Refund V5 Validation', 'test-tenant-ref-v5-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- Create wallet account
  INSERT INTO wallet_accounts (tenant_id, balance_cents) VALUES (v_tenant, 10000);

  -- Setup Captured Payment Order 1
  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_valid_100', 'order_valid_100', 10000, 'INR', 'CAPTURED', 'wallet_topup', 'live', 'payment_link', 'pl_ref_ref1')
  RETURNING id INTO v_order_id;

  -- Setup Captured Payment Order 2 (Same Tenant)
  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_valid_200', 'order_valid_200', 10000, 'INR', 'CAPTURED', 'wallet_topup', 'live', 'payment_link', 'pl_ref_ref2')
  RETURNING id INTO v_order_id_other;

  -- Setup Primary Refund Record (linked to v_order_id)
  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_id, 10000, 'PENDING')
  RETURNING id INTO v_refund_id;

  -- ------------------------------------------------------------
  -- Case 1: refund linked to another same-tenant order is rejected
  -- ------------------------------------------------------------
  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id_other, -- MISMATCHED order ID
    p_provider_refund_id => 'rfnd_case1',
    p_provider_payment_id => 'pay_valid_200',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason INTO v_refund_status, v_refund_reason FROM payment_refunds WHERE id = v_refund_id;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant AND reference_type = 'payment_refund';

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'payment_order_relationship_mismatch'
     OR v_refund_status <> 'MANUAL_REVIEW'
     OR v_wallet_bal <> 10000
     OR v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Case 1 Failed: relationship mismatch was not rejected properly. Res=%, ref_status=%, wallet=%, ledger=%', v_res, v_refund_status, v_wallet_bal, v_ledger_count;
  END IF;

  -- Reset refund to PENDING
  UPDATE payment_refunds SET status = 'PENDING', reason = null WHERE id = v_refund_id;

  -- ------------------------------------------------------------
  -- Case 2: provider payment ID mismatch is rejected
  -- ------------------------------------------------------------
  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => 'rfnd_case2',
    p_provider_payment_id => 'pay_WRONG_999', -- MISMATCHED provider payment ID
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason INTO v_refund_status, v_refund_reason FROM payment_refunds WHERE id = v_refund_id;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'provider_payment_id_mismatch'
     OR v_refund_status <> 'MANUAL_REVIEW'
     OR v_wallet_bal <> 10000 THEN
    RAISE EXCEPTION 'Case 2 Failed: provider payment ID mismatch was not rejected properly. Res=%, ref_status=%', v_res, v_refund_status;
  END IF;

  UPDATE payment_refunds SET status = 'PENDING', reason = null WHERE id = v_refund_id;

  -- ------------------------------------------------------------
  -- Case 3: missing provider refund ID is rejected
  -- ------------------------------------------------------------
  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => '', -- MISSING provider refund ID
    p_provider_payment_id => 'pay_valid_100',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason INTO v_refund_status, v_refund_reason FROM payment_refunds WHERE id = v_refund_id;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'missing_provider_refund_id'
     OR v_refund_status <> 'MANUAL_REVIEW'
     OR v_wallet_bal <> 10000 THEN
    RAISE EXCEPTION 'Case 3 Failed: missing provider refund ID was not rejected properly. Res=%, ref_status=%', v_res, v_refund_status;
  END IF;

  UPDATE payment_refunds SET status = 'PENDING', reason = null WHERE id = v_refund_id;

  -- ------------------------------------------------------------
  -- Case 4: duplicate provider refund ID is rejected
  -- ------------------------------------------------------------
  -- Create another refund with provider_refund_id 'rfnd_already_used'
  INSERT INTO payment_refunds (tenant_id, payment_order_id, provider_refund_id, amount_cents, status)
  VALUES (v_tenant, v_order_id_other, 'rfnd_already_used', 10000, 'PROCESSED')
  RETURNING id INTO v_refund_id_dup;

  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => 'rfnd_already_used', -- DUPLICATE provider refund ID
    p_provider_payment_id => 'pay_valid_100',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason INTO v_refund_status, v_refund_reason FROM payment_refunds WHERE id = v_refund_id;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'duplicate_provider_refund_id'
     OR v_refund_status <> 'MANUAL_REVIEW'
     OR v_wallet_bal <> 10000 THEN
    RAISE EXCEPTION 'Case 4 Failed: duplicate provider refund ID was not rejected properly. Res=%, ref_status=%', v_res, v_refund_status;
  END IF;

  UPDATE payment_refunds SET status = 'PENDING', reason = null WHERE id = v_refund_id;

  -- ------------------------------------------------------------
  -- Case 5: zero amount is rejected
  -- ------------------------------------------------------------
  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => 'rfnd_case5',
    p_provider_payment_id => 'pay_valid_100',
    p_actual_refund_amount_cents => 0, -- ZERO amount
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason INTO v_refund_status, v_refund_reason FROM payment_refunds WHERE id = v_refund_id;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'invalid_refund_amount'
     OR v_refund_status <> 'MANUAL_REVIEW' THEN
    RAISE EXCEPTION 'Case 5 Failed: zero refund amount was not rejected properly. Res=%, ref_status=%', v_res, v_refund_status;
  END IF;

  UPDATE payment_refunds SET status = 'PENDING', reason = null WHERE id = v_refund_id;

  -- ------------------------------------------------------------
  -- Case 6: negative amount is rejected
  -- ------------------------------------------------------------
  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => 'rfnd_case6',
    p_provider_payment_id => 'pay_valid_100',
    p_actual_refund_amount_cents => -5000, -- NEGATIVE amount
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason INTO v_refund_status, v_refund_reason FROM payment_refunds WHERE id = v_refund_id;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'invalid_refund_amount'
     OR v_refund_status <> 'MANUAL_REVIEW' THEN
    RAISE EXCEPTION 'Case 6 Failed: negative refund amount was not rejected properly. Res=%, ref_status=%', v_res, v_refund_status;
  END IF;

  UPDATE payment_refunds SET status = 'PENDING', reason = null WHERE id = v_refund_id;

  -- ------------------------------------------------------------
  -- Case 7: amount differing from refund record is rejected
  -- ------------------------------------------------------------
  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => 'rfnd_case7',
    p_provider_payment_id => 'pay_valid_100',
    p_actual_refund_amount_cents => 5000, -- DIFFERING amount (record is 10000)
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason INTO v_refund_status, v_refund_reason FROM payment_refunds WHERE id = v_refund_id;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'refund_amount_mismatch'
     OR v_refund_status <> 'MANUAL_REVIEW' THEN
    RAISE EXCEPTION 'Case 7 Failed: amount differing from record was not rejected properly. Res=%, ref_status=%', v_res, v_refund_status;
  END IF;

  UPDATE payment_refunds SET status = 'PENDING', reason = null WHERE id = v_refund_id;

  -- ------------------------------------------------------------
  -- Case 8: non-final provider status is rejected without mutation (stays PENDING)
  -- ------------------------------------------------------------
  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => 'rfnd_case8',
    p_provider_payment_id => 'pay_valid_100',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'pending' -- NON-FINAL status
  );

  SELECT status INTO v_refund_status FROM payment_refunds WHERE id = v_refund_id;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'provider_refund_not_processed'
     OR v_refund_status <> 'PENDING' -- Stays PENDING!
     OR v_wallet_bal <> 10000 THEN
    RAISE EXCEPTION 'Case 8 Failed: non-final provider status was not rejected properly. Res=%, ref_status=%, wallet=%', v_res, v_refund_status, v_wallet_bal;
  END IF;

  -- ------------------------------------------------------------
  -- Case 9: non-CAPTURED payment order is rejected
  -- ------------------------------------------------------------
  UPDATE payment_orders SET state = 'CREATED' WHERE id = v_order_id;

  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => 'rfnd_case9',
    p_provider_payment_id => 'pay_valid_100',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason INTO v_refund_status, v_refund_reason FROM payment_refunds WHERE id = v_refund_id;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'payment_order_not_captured'
     OR v_refund_status <> 'MANUAL_REVIEW' THEN
    RAISE EXCEPTION 'Case 9 Failed: non-CAPTURED order was not rejected properly. Res=%, ref_status=%', v_res, v_refund_status;
  END IF;

  -- Restore order state to CAPTURED and reset refund to PENDING
  UPDATE payment_orders SET state = 'CAPTURED' WHERE id = v_order_id;
  UPDATE payment_refunds SET status = 'PENDING', reason = null WHERE id = v_refund_id;

  -- ------------------------------------------------------------
  -- Case 10: correct relationship and provider evidence reaches existing valid reversal path
  -- ------------------------------------------------------------
  v_res := process_refund_atomic_v5(
    p_refund_id => v_refund_id,
    p_payment_order_id => v_order_id,
    p_provider_refund_id => 'rfnd_case10_valid',
    p_provider_payment_id => 'pay_valid_100',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status INTO v_refund_status FROM payment_refunds WHERE id = v_refund_id;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant AND reference_type = 'payment_refund';

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_refund_status <> 'PROCESSED'
     OR v_wallet_bal <> 0 -- Reversed from 10000 to 0
     OR v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Case 10 Failed: valid refund failed to settle. Res=%, ref_status=%, wallet=%, ledger=%', v_res, v_refund_status, v_wallet_bal, v_ledger_count;
  END IF;

  -- Cleanup isolated Tenant data
  DELETE FROM wallet_ledger_entries WHERE tenant_id = v_tenant;
  DELETE FROM payment_refunds WHERE tenant_id = v_tenant;
  DELETE FROM payment_orders WHERE tenant_id = v_tenant;
  DELETE FROM wallet_accounts WHERE tenant_id = v_tenant;
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL PROCESS_REFUND_ATOMIC_V5 POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
