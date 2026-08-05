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
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Domain Renewal State', 'test-tenant-dom-renew-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- ------------------------------------------------------------
  -- Case 1: active / registered -> SUCCEEDS (post-payment status = paid_pending_renewal, NOT paid_pending_registration)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_renew_active_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_renewal')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-renew-active-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'active', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_renew_active_1',
    p_provider_payment_id => 'pay_renew_active_1',
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

  IF (v_res->>'fulfilled')::boolean IS NOT TRUE
     OR v_order_count <> 1
     OR v_domain_status <> 'paid_pending_renewal'
     OR v_domain_status = 'paid_pending_registration'
     OR v_link_status <> 'paid' THEN
    RAISE EXCEPTION 'Case 1 Failed: active domain renewal failed. Res=%, orders=%, dom_status=%, link_status=%', v_res, v_order_count, v_domain_status, v_link_status;
  END IF;

  DELETE FROM payment_orders WHERE reference_id = v_ref;
  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 2: pending_payment -> REJECTED (domain_renewal_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_renew_pending_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_renewal')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-renew-pending-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'pending_payment', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_renew_pending_2',
    p_provider_payment_id => 'pay_renew_pending_2',
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
     OR (v_res->>'reason') <> 'domain_renewal_state_not_payable'
     OR (v_res->>'domain_status') <> 'pending_payment'
     OR v_order_count <> 0
     OR v_domain_status <> 'pending_payment'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 2 Failed: pending_payment domain renewal was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 3: cancelled -> REJECTED (domain_renewal_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_renew_cancelled_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_renewal')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-renew-cancelled-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'cancelled', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_renew_cancelled_3',
    p_provider_payment_id => 'pay_renew_cancelled_3',
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
     OR (v_res->>'reason') <> 'domain_renewal_state_not_payable'
     OR (v_res->>'domain_status') <> 'cancelled'
     OR v_order_count <> 0
     OR v_domain_status <> 'cancelled'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 3 Failed: cancelled domain renewal was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 4: transferred_out -> REJECTED (domain_renewal_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_renew_transfer_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 120000, 'INR', 'created', 'domain_renewal')
  RETURNING id INTO v_link_id;

  INSERT INTO domains (tenant_id, domain_name, registrant_name, registrant_email, registrant_phone, status, purchase_price_cents, renewal_price_cents, payment_link_id)
  VALUES (v_tenant, 'test-renew-transfer-' || gen_random_uuid()::text || '.com', 'Jane Client', 'jane@example.com', '+919876543210', 'transferred_out', 120000, 120000, v_link_id)
  RETURNING id INTO v_domain_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_renew_transfer_4',
    p_provider_payment_id => 'pay_renew_transfer_4',
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
     OR (v_res->>'reason') <> 'domain_renewal_state_not_payable'
     OR (v_res->>'domain_status') <> 'transferred_out'
     OR v_order_count <> 0
     OR v_domain_status <> 'transferred_out'
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 4 Failed: transferred_out domain renewal was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM domains WHERE id = v_domain_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- Cleanup isolated Tenant
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL DOMAIN RENEWAL PAYMENT STATE VALIDATION POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
