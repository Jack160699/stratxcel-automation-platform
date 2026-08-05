DO $$
DECLARE
  v_res jsonb;
  v_link_id uuid;
  v_ref text := 'pl_test_atomicity_' || gen_random_uuid()::text;
  v_tenant_id uuid;
  v_order_count int;
  v_link_status text;
BEGIN
  -- Resolve existing tenant
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (name, slug) VALUES ('Test Atomicity', 'test-atomicity-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_id;
  END IF;

  -- 1. Test Case A: Unsupported payment purpose ('invoice_payment')
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_id, v_ref, 5000, 'INR', 'created', 'invoice_payment')
  RETURNING id INTO v_link_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_test_unsupported',
    p_provider_payment_id => 'pay_test_unsupported',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 5000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE OR (v_res->>'reason') <> 'unsupported_payment_purpose' OR v_order_count <> 0 OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Assertion failed for unsupported purpose: res=%, order_count=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM payment_links WHERE id = v_link_id;

  -- 2. Test Case B: Product Not Found (subscription_payment with non-existent subscription)
  v_ref := 'pl_test_nosub_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_id, v_ref, 949900, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_test_nosub',
    p_provider_payment_id => 'pay_test_nosub',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 949900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE OR (v_res->>'reason') <> 'subscription_not_found' OR v_order_count <> 0 OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Assertion failed for missing subscription: res=%, order_count=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM payment_links WHERE id = v_link_id;

  -- 3. Test Case C: Product Not Found (audit_fee with non-existent audit order)
  v_ref := 'pl_test_noaudit_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_id, v_ref, 99900, 'INR', 'created', 'audit_fee')
  RETURNING id INTO v_link_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_test_noaudit',
    p_provider_payment_id => 'pay_test_noaudit',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 99900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE OR (v_res->>'reason') <> 'audit_order_not_found' OR v_order_count <> 0 OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Assertion failed for missing audit order: res=%, order_count=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM payment_links WHERE id = v_link_id;

  -- 4. Test Case D: Product Not Found (continuation_pack with non-existent pack)
  v_ref := 'pl_test_nopack_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_id, v_ref, 25000, 'INR', 'created', 'continuation_pack')
  RETURNING id INTO v_link_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_test_nopack',
    p_provider_payment_id => 'pay_test_nopack',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 25000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE OR (v_res->>'reason') <> 'continuation_pack_not_found' OR v_order_count <> 0 OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Assertion failed for missing continuation pack: res=%, order_count=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM payment_links WHERE id = v_link_id;

  -- 5. Test Case E: Product Not Found (domain_purchase with non-existent domain)
  v_ref := 'pl_test_nodomain_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_id, v_ref, 120000, 'INR', 'created', 'domain_purchase')
  RETURNING id INTO v_link_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_test_nodomain',
    p_provider_payment_id => 'pay_test_nodomain',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 120000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE OR (v_res->>'reason') <> 'domain_not_found' OR v_order_count <> 0 OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Assertion failed for missing domain: res=%, order_count=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM payment_links WHERE id = v_link_id;

  RAISE NOTICE 'ALL LIVE POSTGRESQL ATOMICITY REJECTION ASSERTIONS PASSED SUCCESSFULLY!';
END;
$$;
