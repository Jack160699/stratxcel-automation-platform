DO $$
DECLARE
  v_tenant uuid;
  v_order_id_audit uuid;
  v_order_id_renew uuid;
  v_order_id_unknown uuid;
  v_order_id_wallet uuid;
  v_refund_id_audit uuid;
  v_refund_id_renew uuid;
  v_refund_id_unknown uuid;
  v_refund_id_wallet uuid;
  v_wallet_acc uuid;
  v_res jsonb;
  v_refund_status text;
  v_refund_reason text;
  v_processed_at timestamptz;
  v_wallet_bal bigint;
  v_ledger_count int;
BEGIN
  -- Setup isolated Tenant
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Refund Purpose Fail Closed', 'test-tenant-ref-purpose-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- Create wallet account
  INSERT INTO wallet_accounts (tenant_id, balance_cents) VALUES (v_tenant, 10000);

  -- ------------------------------------------------------------
  -- Case 1: audit_fee -> MANUAL_REVIEW without mutation
  -- ------------------------------------------------------------
  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_audit_100', 'order_audit_100', 99900, 'INR', 'CAPTURED', 'audit_fee', 'live', 'payment_link', 'pl_audit_ref1')
  RETURNING id INTO v_order_id_audit;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_id_audit, 99900, 'PENDING')
  RETURNING id INTO v_refund_id_audit;

  v_res := process_refund_atomic_v6(
    p_refund_id => v_refund_id_audit,
    p_payment_order_id => v_order_id_audit,
    p_provider_refund_id => 'rfnd_audit_100',
    p_provider_payment_id => 'pay_audit_100',
    p_actual_refund_amount_cents => 99900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_refund_status, v_refund_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_id_audit;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'audit_fee_refund_manual_review'
     OR v_refund_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_wallet_bal <> 10000
     OR v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Case 1 Failed: audit_fee was not routed to MANUAL_REVIEW cleanly. Res=%, status=%, proc_at=%', v_res, v_refund_status, v_processed_at;
  END IF;

  -- ------------------------------------------------------------
  -- Case 2: domain_renewal -> MANUAL_REVIEW without mutation
  -- ------------------------------------------------------------
  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_renew_100', 'order_renew_100', 120000, 'INR', 'CAPTURED', 'domain_renewal', 'live', 'payment_link', 'pl_renew_ref1')
  RETURNING id INTO v_order_id_renew;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_id_renew, 120000, 'PENDING')
  RETURNING id INTO v_refund_id_renew;

  v_res := process_refund_atomic_v6(
    p_refund_id => v_refund_id_renew,
    p_payment_order_id => v_order_id_renew,
    p_provider_refund_id => 'rfnd_renew_100',
    p_provider_payment_id => 'pay_renew_100',
    p_actual_refund_amount_cents => 120000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_refund_status, v_refund_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_id_renew;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'domain_renewal_refund_manual_review'
     OR v_refund_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_wallet_bal <> 10000
     OR v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Case 2 Failed: domain_renewal was not routed to MANUAL_REVIEW cleanly. Res=%, status=%, proc_at=%', v_res, v_refund_status, v_processed_at;
  END IF;

  -- ------------------------------------------------------------
  -- Case 3: unknown/unhandled purpose (project_fee) -> MANUAL_REVIEW without mutation
  -- ------------------------------------------------------------
  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_unk_100', 'order_unk_100', 5000, 'INR', 'CAPTURED', 'project_fee', 'live', 'payment_link', 'pl_unk_ref1')
  RETURNING id INTO v_order_id_unknown;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_id_unknown, 5000, 'PENDING')
  RETURNING id INTO v_refund_id_unknown;

  v_res := process_refund_atomic_v6(
    p_refund_id => v_refund_id_unknown,
    p_payment_order_id => v_order_id_unknown,
    p_provider_refund_id => 'rfnd_unk_100',
    p_provider_payment_id => 'pay_unk_100',
    p_actual_refund_amount_cents => 5000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason, processed_at INTO v_refund_status, v_refund_reason, v_processed_at FROM payment_refunds WHERE id = v_refund_id_unknown;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'unsupported_refund_purpose'
     OR v_refund_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_wallet_bal <> 10000
     OR v_ledger_count <> 0 THEN
    RAISE EXCEPTION 'Case 3 Failed: unknown purpose was not routed to MANUAL_REVIEW cleanly. Res=%, status=%, proc_at=%', v_res, v_refund_status, v_processed_at;
  END IF;

  -- ------------------------------------------------------------
  -- Case 4: supported wallet_topup -> SUCCEEDS (status = PROCESSED, wallet reversed to 0, 1 ledger entry)
  -- ------------------------------------------------------------
  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_wallet_100', 'order_wallet_100', 10000, 'INR', 'CAPTURED', 'wallet_topup', 'live', 'payment_link', 'pl_wallet_ref1')
  RETURNING id INTO v_order_id_wallet;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_id_wallet, 10000, 'PENDING')
  RETURNING id INTO v_refund_id_wallet;

  v_res := process_refund_atomic_v6(
    p_refund_id => v_refund_id_wallet,
    p_payment_order_id => v_order_id_wallet,
    p_provider_refund_id => 'rfnd_wallet_100',
    p_provider_payment_id => 'pay_wallet_100',
    p_actual_refund_amount_cents => 10000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at INTO v_refund_status, v_processed_at FROM payment_refunds WHERE id = v_refund_id_wallet;
  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant AND reference_type = 'payment_refund';

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_refund_status <> 'PROCESSED'
     OR v_processed_at IS NULL
     OR v_wallet_bal <> 0
     OR v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Case 4 Failed: wallet_topup refund failed to settle cleanly. Res=%, status=%, wallet=%, ledger=%', v_res, v_refund_status, v_wallet_bal, v_ledger_count;
  END IF;

  -- Cleanup isolated Tenant data
  DELETE FROM wallet_ledger_entries WHERE tenant_id = v_tenant;
  DELETE FROM payment_refunds WHERE tenant_id = v_tenant;
  DELETE FROM payment_orders WHERE tenant_id = v_tenant;
  DELETE FROM wallet_accounts WHERE tenant_id = v_tenant;
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL PROCESS_REFUND_ATOMIC_V6 POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
