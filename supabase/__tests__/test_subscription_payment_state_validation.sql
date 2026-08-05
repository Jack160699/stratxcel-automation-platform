DO $$
DECLARE
  v_tenant uuid;
  v_ref text;
  v_link_id uuid;
  v_sub_id uuid;
  v_res jsonb;
  v_order_count int;
  v_sub_status text;
  v_ent_count int;
  v_link_status text;
BEGIN
  -- Setup isolated Tenant
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Sub State', 'test-tenant-sub-state-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- ------------------------------------------------------------
  -- Case 1: pending_payment -> SUCCEEDS
  -- ------------------------------------------------------------
  v_ref := 'pl_test_state_pending_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 949900, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, plan_tier, price_cents, status)
  VALUES (v_tenant, v_link_id, 'launch', 949900, 'pending_payment')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_state_pending_1',
    p_provider_payment_id => 'pay_state_pending_1',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 949900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT TRUE OR v_order_count <> 1 OR v_sub_status <> 'active' OR v_link_status <> 'paid' THEN
    RAISE EXCEPTION 'Case 1 Failed: pending_payment failed. Res=%, orders=%, sub_status=%, link_status=%', v_res, v_order_count, v_sub_status, v_link_status;
  END IF;

  DELETE FROM entitlement_ledger_entries WHERE subscription_id = v_sub_id;
  DELETE FROM usage_entitlements WHERE subscription_id = v_sub_id;
  DELETE FROM payment_orders WHERE reference_id = v_ref;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 2: active -> REJECTED (subscription_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_state_active_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 949900, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, plan_tier, price_cents, status)
  VALUES (v_tenant, v_link_id, 'launch', 949900, 'active')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_state_active_2',
    p_provider_payment_id => 'pay_state_active_2',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 949900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ent_count FROM usage_entitlements WHERE subscription_id = v_sub_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'subscription_state_not_payable'
     OR (v_res->>'subscription_status') <> 'active'
     OR v_order_count <> 0
     OR v_sub_status <> 'active'
     OR v_ent_count <> 0
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 2 Failed: active subscription was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 3: cancelled -> REJECTED (subscription_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_state_cancelled_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 949900, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, plan_tier, price_cents, status)
  VALUES (v_tenant, v_link_id, 'launch', 949900, 'cancelled')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_state_cancelled_3',
    p_provider_payment_id => 'pay_state_cancelled_3',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 949900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ent_count FROM usage_entitlements WHERE subscription_id = v_sub_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'subscription_state_not_payable'
     OR (v_res->>'subscription_status') <> 'cancelled'
     OR v_order_count <> 0
     OR v_sub_status <> 'cancelled'
     OR v_ent_count <> 0
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 3 Failed: cancelled subscription was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 4: refunded -> REJECTED (subscription_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_state_refunded_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 949900, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, plan_tier, price_cents, status)
  VALUES (v_tenant, v_link_id, 'launch', 949900, 'refunded')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_state_refunded_4',
    p_provider_payment_id => 'pay_state_refunded_4',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 949900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ent_count FROM usage_entitlements WHERE subscription_id = v_sub_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'subscription_state_not_payable'
     OR (v_res->>'subscription_status') <> 'refunded'
     OR v_order_count <> 0
     OR v_sub_status <> 'refunded'
     OR v_ent_count <> 0
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 4 Failed: refunded subscription was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 5: expired -> REJECTED (subscription_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_state_expired_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 949900, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, plan_tier, price_cents, status)
  VALUES (v_tenant, v_link_id, 'launch', 949900, 'expired')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_state_expired_5',
    p_provider_payment_id => 'pay_state_expired_5',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 949900,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ent_count FROM usage_entitlements WHERE subscription_id = v_sub_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'subscription_state_not_payable'
     OR (v_res->>'subscription_status') <> 'expired'
     OR v_order_count <> 0
     OR v_sub_status <> 'expired'
     OR v_ent_count <> 0
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 5 Failed: expired subscription was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- Cleanup isolated Tenant
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL SUBSCRIPTION PAYMENT STATE VALIDATION POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
