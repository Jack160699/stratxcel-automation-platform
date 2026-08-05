DO $$
DECLARE
  v_tenant uuid;
  v_ref text;
  v_link_id uuid;
  v_domain_id uuid;
  v_res jsonb;
  v_order_count int;
  v_domain_status text;
  v_link_status text;
BEGIN
  -- Setup isolated Tenant
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Domain Purchase State', 'test-tenant-dom-state-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- ------------------------------------------------------------
  -- Case 1: pending_payment -> SUCCEEDS (post-payment status = paid_pending_registration)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_dom_pending_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_purchase')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-pending-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'pending_payment', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_dom_pending_1',
    p_provider_payment_id => 'pay_dom_pending_1',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 120000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT TRUE OR v_order_count <> 1 OR v_domain_status <> 'paid_pending_registration' OR v_link_status <> 'paid' THEN
    RAISE EXCEPTION 'Case 1 Failed: pending_payment domain purchase failed. Res=%, orders=%, dom_status=%, link_status=%', v_res, v_order_count, v_domain_status, v_link_status;
  END IF;

  DELETE FROM payment_orders WHERE reference_id = v_ref;
  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 2: paid -> REJECTED (domain_purchase_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_dom_paid_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_purchase')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-paid-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'paid', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_dom_paid_2',
    p_provider_payment_id => 'pay_dom_paid_2',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 120000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'domain_purchase_state_not_payable'
     OR (v_res->>'domain_status') <> 'paid'
     OR v_order_count <> 0
     OR v_domain_status <> 'paid'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 2 Failed: paid domain was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 3: active / registered -> REJECTED (domain_purchase_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_dom_active_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_purchase')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-active-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'active', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_dom_active_3',
    p_provider_payment_id => 'pay_dom_active_3',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 120000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'domain_purchase_state_not_payable'
     OR (v_res->>'domain_status') <> 'active'
     OR v_order_count <> 0
     OR v_domain_status <> 'active'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 3 Failed: active domain was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 4: refunded -> REJECTED (domain_purchase_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_dom_refunded_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_purchase')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-refunded-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'refunded', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_dom_refunded_4',
    p_provider_payment_id => 'pay_dom_refunded_4',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 120000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'domain_purchase_state_not_payable'
     OR (v_res->>'domain_status') <> 'refunded'
     OR v_order_count <> 0
     OR v_domain_status <> 'refunded'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 4 Failed: refunded domain was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 5: cancelled -> REJECTED (domain_purchase_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_dom_cancelled_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_purchase')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-cancelled-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'cancelled', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_dom_cancelled_5',
    p_provider_payment_id => 'pay_dom_cancelled_5',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 120000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'domain_purchase_state_not_payable'
     OR (v_res->>'domain_status') <> 'cancelled'
     OR v_order_count <> 0
     OR v_domain_status <> 'cancelled'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 5 Failed: cancelled domain was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- Cleanup isolated Tenant
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL DOMAIN PURCHASE PAYMENT STATE VALIDATION POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
