DO $$
DECLARE
  -- Variables for ACL checks
  v_sr_has_prod boolean;
  v_auth_has_prod boolean;
  v_anon_has_prod boolean;

  v_sr_has_dep boolean;
  v_auth_has_dep boolean;
  v_anon_has_dep boolean;

  -- Variables for sequential idempotency assertions (real concurrency is in scripts/test-payment-concurrency.ts)
  v_tenant uuid;

  v_link_wallet uuid;
  v_ref_wallet text;
  v_res_w1 jsonb;
  v_res_w2 jsonb;
  v_wallet_bal bigint;
  v_wallet_order_count int;

  v_order_rfnd uuid;
  v_rfnd1 uuid;
  v_rfnd2_dup uuid;
  v_res_r1 jsonb;
  v_res_r2 jsonb;
  v_rfnd1_status text;
  v_rfnd2_status text;
  v_ledger_count int;

  v_rfnd_other_id uuid;
  v_order_other_id uuid;
  v_res_same_prov jsonb;

  v_user_target uuid;
  v_user_target2 uuid;
  v_res_b1 jsonb;
  v_res_b2 jsonb;
BEGIN
  -- ============================================================
  -- PART 1: VERIFY POSTGRESQL RPC ACL PRIVILEGES VIA has_function_privilege
  -- ============================================================

  -- A. Production RPC: process_refund_atomic_v11
  v_sr_has_prod   := has_function_privilege('service_role', 'public.process_refund_atomic_v11(uuid, uuid, text, text, bigint, text, text)', 'execute');
  v_auth_has_prod := has_function_privilege('authenticated', 'public.process_refund_atomic_v11(uuid, uuid, text, text, bigint, text, text)', 'execute');
  v_anon_has_prod := has_function_privilege('anon', 'public.process_refund_atomic_v11(uuid, uuid, text, text, bigint, text, text)', 'execute');

  IF v_sr_has_prod IS NOT TRUE OR v_auth_has_prod IS TRUE OR v_anon_has_prod IS TRUE THEN
    RAISE EXCEPTION 'ACL Check Failed: process_refund_atomic_v11 privileges incorrect. service_role=%, authenticated=%, anon=%', v_sr_has_prod, v_auth_has_prod, v_anon_has_prod;
  END IF;

  -- B. Production RPC: reconcile_and_fulfill_razorpay_payment_v4
  v_sr_has_prod   := has_function_privilege('service_role', 'public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz)', 'execute');
  v_auth_has_prod := has_function_privilege('authenticated', 'public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz)', 'execute');
  v_anon_has_prod := has_function_privilege('anon', 'public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz)', 'execute');

  IF v_sr_has_prod IS NOT TRUE OR v_auth_has_prod IS TRUE OR v_anon_has_prod IS TRUE THEN
    RAISE EXCEPTION 'ACL Check Failed: reconcile_and_fulfill_razorpay_payment_v4 privileges incorrect. service_role=%, authenticated=%, anon=%', v_sr_has_prod, v_auth_has_prod, v_anon_has_prod;
  END IF;

  -- C. Deprecated RPC: process_refund_atomic_v10 (MUST BE REVOKED FROM ALL ROLES!)
  v_sr_has_dep   := has_function_privilege('service_role', 'public.process_refund_atomic_v10(uuid, uuid, text, text, bigint, text, text)', 'execute');
  v_auth_has_dep := has_function_privilege('authenticated', 'public.process_refund_atomic_v10(uuid, uuid, text, text, bigint, text, text)', 'execute');
  v_anon_has_dep := has_function_privilege('anon', 'public.process_refund_atomic_v10(uuid, uuid, text, text, bigint, text, text)', 'execute');

  IF v_sr_has_dep IS TRUE OR v_auth_has_dep IS TRUE OR v_anon_has_dep IS TRUE THEN
    RAISE EXCEPTION 'ACL Check Failed: Deprecated process_refund_atomic_v10 is still executable! service_role=%, authenticated=%, anon=%', v_sr_has_dep, v_auth_has_dep, v_anon_has_dep;
  END IF;

  -- D. Deprecated RPC: complete_audit_and_issue_subscription_credit_v4 (MUST BE REVOKED FROM ALL ROLES!)
  v_sr_has_dep   := has_function_privilege('service_role', 'public.complete_audit_and_issue_subscription_credit_v4(uuid, uuid, uuid)', 'execute');
  v_auth_has_dep := has_function_privilege('authenticated', 'public.complete_audit_and_issue_subscription_credit_v4(uuid, uuid, uuid)', 'execute');
  v_anon_has_dep := has_function_privilege('anon', 'public.complete_audit_and_issue_subscription_credit_v4(uuid, uuid, uuid)', 'execute');

  IF v_sr_has_dep IS TRUE OR v_auth_has_dep IS TRUE OR v_anon_has_dep IS TRUE THEN
    RAISE EXCEPTION 'ACL Check Failed: Deprecated complete_audit_and_issue_subscription_credit_v4 is still executable! service_role=%, authenticated=%, anon=%', v_sr_has_dep, v_auth_has_dep, v_anon_has_dep;
  END IF;

  RAISE NOTICE 'ALL RPC ACL PRIVILEGE ASSERTIONS PASSED CLEANLY!';

  -- ============================================================
  -- PART 2: SEQUENTIAL IDEMPOTENCY / ATOMICITY ASSERTIONS
  -- ============================================================

  -- Setup isolated test tenant
  INSERT INTO tenants (name, slug) VALUES ('ACL Concurrency Tenant', 'acl-concurrency-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;
  INSERT INTO wallet_accounts (tenant_id, balance_cents) VALUES (v_tenant, 0);

  -- ------------------------------------------------------------
  -- Sequential replay 1: two fulfilment calls for the same payment link
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_conc_w1_' || gen_random_uuid()::text, 50000, 'wallet_topup', 'created')
  RETURNING id, reference_id INTO v_link_wallet, v_ref_wallet;

  -- Call 1
  v_res_w1 := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_conc_w1_a',
    p_provider_payment_id => 'pay_conc_w1',
    p_provider_link_id => 'plink_prov_w1',
    p_provider_order_id => 'order_prov_w1',
    p_reference_id => v_ref_wallet,
    p_actual_amount_cents => 50000,
    p_actual_currency => 'INR',
    p_provider_status => 'paid',
    p_captured => true,
    p_event_type => 'payment_link.paid'
  );

  -- Call 2 (simultaneous replay for same payment link)
  v_res_w2 := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_conc_w1_b',
    p_provider_payment_id => 'pay_conc_w1',
    p_provider_link_id => 'plink_prov_w1',
    p_provider_order_id => 'order_prov_w1',
    p_reference_id => v_ref_wallet,
    p_actual_amount_cents => 50000,
    p_actual_currency => 'INR',
    p_provider_status => 'paid',
    p_captured => true,
    p_event_type => 'payment_link.paid'
  );

  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_wallet_order_count FROM payment_orders WHERE tenant_id = v_tenant AND payment_purpose = 'wallet_topup';

  IF (v_res_w1->>'fulfilled')::boolean IS NOT TRUE
     OR (v_res_w2->>'fulfilled')::boolean IS NOT TRUE
     OR v_wallet_bal <> 50000 -- ZERO DOUBLED WALLET BALANCE!
     OR v_wallet_order_count <> 1 THEN -- EXACTLY 1 PAYMENT ORDER!
    RAISE EXCEPTION 'Concurrency Test 1 Failed: Doubled wallet balance or duplicate payment order created. Res1=%, Res2=%, balance=%, orders=%', v_res_w1, v_res_w2, v_wallet_bal, v_wallet_order_count;
  END IF;

  -- ------------------------------------------------------------
  -- Sequential replay 2: two refund calls for the same refund
  -- ------------------------------------------------------------
  SELECT id INTO v_order_rfnd FROM payment_orders WHERE tenant_id = v_tenant LIMIT 1;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_rfnd, 50000, 'PENDING')
  RETURNING id INTO v_rfnd1;

  -- Attempt 1
  v_res_r1 := process_refund_atomic_v11(
    p_refund_id => v_rfnd1,
    p_payment_order_id => v_order_rfnd,
    p_provider_refund_id => 'rfnd_prov_conc1',
    p_provider_payment_id => 'pay_conc_w1',
    p_actual_refund_amount_cents => 50000,
    p_provider_refund_status => 'processed'
  );

  -- Attempt 2 (simultaneous duplicate execution)
  v_res_r2 := process_refund_atomic_v11(
    p_refund_id => v_rfnd1,
    p_payment_order_id => v_order_rfnd,
    p_provider_refund_id => 'rfnd_prov_conc1',
    p_provider_payment_id => 'pay_conc_w1',
    p_actual_refund_amount_cents => 50000,
    p_provider_refund_status => 'processed'
  );

  SELECT balance_cents INTO v_wallet_bal FROM wallet_accounts WHERE tenant_id = v_tenant;
  SELECT count(*) INTO v_ledger_count FROM wallet_ledger_entries WHERE tenant_id = v_tenant AND entry_type = 'refund';

  IF (v_res_r1->>'success')::boolean IS NOT TRUE
     OR (v_res_r2->>'already_processed')::boolean IS NOT TRUE
     OR v_wallet_bal <> 0 -- EXACTLY 0 WALLET BALANCE (NOT -50000!)
     OR v_ledger_count <> 1 THEN -- EXACTLY 1 LEDGER ENTRY!
    RAISE EXCEPTION 'Concurrency Test 2 Failed: Duplicate wallet deduction or duplicate ledger entry. Res1=%, Res2=%, balance=%, ledger=%', v_res_r1, v_res_r2, v_wallet_bal, v_ledger_count;
  END IF;

  -- ------------------------------------------------------------
  -- Sequential replay 3: two different refunds using the same provider_refund_id
  -- ------------------------------------------------------------
  -- Create a second captured order for test
  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id)
  VALUES (v_tenant, 'razorpay', 'pay_conc_other', 'order_conc_other', 30000, 'INR', 'CAPTURED', 'wallet_topup', 'live', 'payment_link', 'ref_conc_other')
  RETURNING id INTO v_order_other_id;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_other_id, 30000, 'PENDING')
  RETURNING id INTO v_rfnd_other_id;

  -- Attempt to process using existing provider_refund_id 'rfnd_prov_conc1'
  v_res_same_prov := process_refund_atomic_v11(
    p_refund_id => v_rfnd_other_id,
    p_payment_order_id => v_order_other_id,
    p_provider_refund_id => 'rfnd_prov_conc1', -- REUSED PROVIDER REFUND ID!
    p_provider_payment_id => 'pay_conc_other',
    p_actual_refund_amount_cents => 30000,
    p_provider_refund_status => 'processed'
  );

  SELECT status INTO v_rfnd2_status FROM payment_refunds WHERE id = v_rfnd_other_id;

  IF (v_res_same_prov->>'success')::boolean IS NOT FALSE
     OR v_res_same_prov->>'reason' <> 'duplicate_provider_refund_id'
     OR v_rfnd2_status <> 'MANUAL_REVIEW' THEN
    RAISE EXCEPTION 'Concurrency Test 3 Failed: Reused provider_refund_id was not rejected to MANUAL_REVIEW. Res=%, status=%', v_res_same_prov, v_rfnd2_status;
  END IF;

  -- Cleanup test tenant data
  DELETE FROM wallet_ledger_entries WHERE tenant_id = v_tenant;
  DELETE FROM payment_refunds WHERE tenant_id = v_tenant;
  DELETE FROM payment_orders WHERE tenant_id = v_tenant;
  DELETE FROM wallet_accounts WHERE tenant_id = v_tenant;
  DELETE FROM payment_links WHERE tenant_id = v_tenant;
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL SEQUENTIAL IDEMPOTENCY AND ATOMICITY ASSERTIONS PASSED CLEANLY!';
END;
$$;
