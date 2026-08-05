DO $$
DECLARE
  v_tenant uuid;
  v_ref text;
  v_link_id uuid;
  v_audit_id uuid;
  v_res jsonb;
  v_order_count int;
  v_audit_status text;
  v_link_status text;
BEGIN
  -- Setup isolated Tenant
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Audit Fee State', 'test-tenant-audit-fee-state-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- ------------------------------------------------------------
  -- Case 1: pending_payment -> SUCCEEDS
  -- ------------------------------------------------------------
  v_ref := 'pl_test_audit_pending_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 99900, 'INR', 'created', 'audit_fee')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, payment_link_id)
  VALUES (v_tenant, 'Test Biz', 'pending_payment', 99900, v_link_id)
  RETURNING id INTO v_audit_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_audit_pending_1',
    p_provider_payment_id => 'pay_audit_pending_1',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 99900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_audit_status FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT TRUE OR v_order_count <> 1 OR v_audit_status <> 'paid' OR v_link_status <> 'paid' THEN
    RAISE EXCEPTION 'Case 1 Failed: pending_payment audit fee failed. Res=%, orders=%, audit_status=%, link_status=%', v_res, v_order_count, v_audit_status, v_link_status;
  END IF;

  DELETE FROM payment_orders WHERE reference_id = v_ref;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 2: paid -> REJECTED (audit_order_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_audit_paid_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 99900, 'INR', 'created', 'audit_fee')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, payment_link_id)
  VALUES (v_tenant, 'Test Biz', 'paid', 99900, v_link_id)
  RETURNING id INTO v_audit_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_audit_paid_2',
    p_provider_payment_id => 'pay_audit_paid_2',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 99900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_audit_status FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'audit_order_state_not_payable'
     OR (v_res->>'audit_status') <> 'paid'
     OR v_order_count <> 0
     OR v_audit_status <> 'paid'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 2 Failed: paid audit order was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 3: completed -> REJECTED (audit_order_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_audit_completed_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 99900, 'INR', 'created', 'audit_fee')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, payment_link_id)
  VALUES (v_tenant, 'Test Biz', 'completed', 99900, v_link_id)
  RETURNING id INTO v_audit_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_audit_completed_3',
    p_provider_payment_id => 'pay_audit_completed_3',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 99900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_audit_status FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'audit_order_state_not_payable'
     OR (v_res->>'audit_status') <> 'completed'
     OR v_order_count <> 0
     OR v_audit_status <> 'completed'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 3 Failed: completed audit order was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 4: refunded -> REJECTED (audit_order_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_audit_refunded_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 99900, 'INR', 'created', 'audit_fee')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, payment_link_id)
  VALUES (v_tenant, 'Test Biz', 'refunded', 99900, v_link_id)
  RETURNING id INTO v_audit_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_audit_refunded_4',
    p_provider_payment_id => 'pay_audit_refunded_4',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 99900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_audit_status FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'audit_order_state_not_payable'
     OR (v_res->>'audit_status') <> 'refunded'
     OR v_order_count <> 0
     OR v_audit_status <> 'refunded'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 4 Failed: refunded audit order was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 5: cancelled -> REJECTED (audit_order_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_audit_cancelled_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 99900, 'INR', 'created', 'audit_fee')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, payment_link_id)
  VALUES (v_tenant, 'Test Biz', 'cancelled', 99900, v_link_id)
  RETURNING id INTO v_audit_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_audit_cancelled_5',
    p_provider_payment_id => 'pay_audit_cancelled_5',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 99900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_audit_status FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'audit_order_state_not_payable'
     OR (v_res->>'audit_status') <> 'cancelled'
     OR v_order_count <> 0
     OR v_audit_status <> 'cancelled'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 5 Failed: cancelled audit order was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- Cleanup isolated Tenant
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL AUDIT FEE PAYMENT STATE VALIDATION POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
