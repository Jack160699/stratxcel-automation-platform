DO $$
DECLARE
  v_tenant uuid;
  v_ref text;
  v_link_id uuid;
  v_pack_id uuid;
  v_sub_id uuid;
  v_res jsonb;
  v_order_count int;
  v_pack_status text;
  v_link_status text;
  v_ledger_count int;
BEGIN
  -- Setup isolated Tenant and Subscription
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Pack State', 'test-tenant-pack-state-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  INSERT INTO subscriptions (tenant_id, plan_tier, price_cents, status)
  VALUES (v_tenant, 'launch', 949900, 'active')
  RETURNING id INTO v_sub_id;

  -- ------------------------------------------------------------
  -- Case 1: pending -> SUCCEEDS
  -- ------------------------------------------------------------
  v_ref := 'pl_test_pack_pending_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 200000, 'INR', 'created', 'continuation_pack')
  RETURNING id INTO v_link_id;

  INSERT INTO continuation_packs (tenant_id, subscription_id, metric, extra_units, price_cents, payment_link_id, status)
  VALUES (v_tenant, v_sub_id, 'social_posts', 10, 200000, v_link_id, 'pending')
  RETURNING id INTO v_pack_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_pack_pending_1',
    p_provider_payment_id => 'pay_pack_pending_1',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 200000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_pack_status FROM continuation_packs WHERE id = v_pack_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT TRUE OR v_order_count <> 1 OR v_pack_status <> 'applied' OR v_link_status <> 'paid' THEN
    RAISE EXCEPTION 'Case 1 Failed: pending pack failed. Res=%, orders=%, pack_status=%, link_status=%', v_res, v_order_count, v_pack_status, v_link_status;
  END IF;

  DELETE FROM entitlement_ledger_entries WHERE continuation_pack_id = v_pack_id;
  DELETE FROM usage_entitlements WHERE tenant_id = v_tenant;
  DELETE FROM payment_orders WHERE reference_id = v_ref;
  DELETE FROM continuation_packs WHERE id = v_pack_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 2: applied -> REJECTED (continuation_pack_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_pack_applied_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 200000, 'INR', 'created', 'continuation_pack')
  RETURNING id INTO v_link_id;

  INSERT INTO continuation_packs (tenant_id, subscription_id, metric, extra_units, price_cents, payment_link_id, status)
  VALUES (v_tenant, v_sub_id, 'social_posts', 10, 200000, v_link_id, 'applied')
  RETURNING id INTO v_pack_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_pack_applied_2',
    p_provider_payment_id => 'pay_pack_applied_2',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 200000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_pack_status FROM continuation_packs WHERE id = v_pack_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ledger_count FROM entitlement_ledger_entries WHERE continuation_pack_id = v_pack_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'continuation_pack_state_not_payable'
     OR (v_res->>'pack_status') <> 'applied'
     OR v_order_count <> 0
     OR v_pack_status <> 'applied'
     OR v_ledger_count <> 0
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 2 Failed: applied pack was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM continuation_packs WHERE id = v_pack_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 3: refunded -> REJECTED (continuation_pack_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_pack_refunded_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 200000, 'INR', 'created', 'continuation_pack')
  RETURNING id INTO v_link_id;

  INSERT INTO continuation_packs (tenant_id, subscription_id, metric, extra_units, price_cents, payment_link_id, status)
  VALUES (v_tenant, v_sub_id, 'social_posts', 10, 200000, v_link_id, 'refunded')
  RETURNING id INTO v_pack_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_pack_refunded_3',
    p_provider_payment_id => 'pay_pack_refunded_3',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 200000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_pack_status FROM continuation_packs WHERE id = v_pack_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ledger_count FROM entitlement_ledger_entries WHERE continuation_pack_id = v_pack_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'continuation_pack_state_not_payable'
     OR (v_res->>'pack_status') <> 'refunded'
     OR v_order_count <> 0
     OR v_pack_status <> 'refunded'
     OR v_ledger_count <> 0
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 3 Failed: refunded pack was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM continuation_packs WHERE id = v_pack_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 4: cancelled -> REJECTED (continuation_pack_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_pack_cancelled_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 200000, 'INR', 'created', 'continuation_pack')
  RETURNING id INTO v_link_id;

  INSERT INTO continuation_packs (tenant_id, subscription_id, metric, extra_units, price_cents, payment_link_id, status)
  VALUES (v_tenant, v_sub_id, 'social_posts', 10, 200000, v_link_id, 'cancelled')
  RETURNING id INTO v_pack_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_pack_cancelled_4',
    p_provider_payment_id => 'pay_pack_cancelled_4',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 200000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_pack_status FROM continuation_packs WHERE id = v_pack_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ledger_count FROM entitlement_ledger_entries WHERE continuation_pack_id = v_pack_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'continuation_pack_state_not_payable'
     OR (v_res->>'pack_status') <> 'cancelled'
     OR v_order_count <> 0
     OR v_pack_status <> 'cancelled'
     OR v_ledger_count <> 0
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 4 Failed: cancelled pack was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM continuation_packs WHERE id = v_pack_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 5: expired -> REJECTED (continuation_pack_state_not_payable)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_pack_expired_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant, v_ref, 200000, 'INR', 'created', 'continuation_pack')
  RETURNING id INTO v_link_id;

  INSERT INTO continuation_packs (tenant_id, subscription_id, metric, extra_units, price_cents, payment_link_id, status)
  VALUES (v_tenant, v_sub_id, 'social_posts', 10, 200000, v_link_id, 'expired')
  RETURNING id INTO v_pack_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_pack_expired_5',
    p_provider_payment_id => 'pay_pack_expired_5',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 200000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_pack_status FROM continuation_packs WHERE id = v_pack_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ledger_count FROM entitlement_ledger_entries WHERE continuation_pack_id = v_pack_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'continuation_pack_state_not_payable'
     OR (v_res->>'pack_status') <> 'expired'
     OR v_order_count <> 0
     OR v_pack_status <> 'expired'
     OR v_ledger_count <> 0
     OR v_link_status <> 'created' THEN
    RAISE EXCEPTION 'Case 5 Failed: expired pack was not rejected properly. Res=%, orders=%, link_status=%', v_res, v_order_count, v_link_status;
  END IF;

  DELETE FROM continuation_packs WHERE id = v_pack_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- Cleanup isolated Tenant & Subscription
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL CONTINUATION PACK PAYMENT STATE VALIDATION POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
