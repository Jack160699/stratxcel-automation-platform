DO $$
DECLARE
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_ref text;
  v_link_id uuid;
  v_sub_id uuid;
  v_audit_id uuid;
  v_res jsonb;
  v_order_count int;
  v_sub_status text;
  v_audit_consumed timestamptz;
  v_ent_count int;
  v_link_status text;
BEGIN
  -- 1. Setup isolated Tenants
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Audit Price A', 'test-tenant-audit-price-a-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_a;
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Audit Price B', 'test-tenant-audit-price-b-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_b;

  -- ------------------------------------------------------------
  -- Case 1: No Credit - Full Plan Amount (9,49,900 cents) succeeds
  -- ------------------------------------------------------------
  v_ref := 'pl_test_nocredit_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_a, v_ref, 949900, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, plan_tier, price_cents, status)
  VALUES (v_tenant_a, v_link_id, 'launch', 949900, 'pending_payment')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_nocredit_1',
    p_provider_payment_id => 'pay_nocredit_1',
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
    RAISE EXCEPTION 'Case 1 Failed: No credit full plan amount failed. Res=%, orders=%, sub_status=%, link_status=%', v_res, v_order_count, v_sub_status, v_link_status;
  END IF;

  DELETE FROM entitlement_ledger_entries WHERE subscription_id = v_sub_id;
  DELETE FROM usage_entitlements WHERE subscription_id = v_sub_id;
  DELETE FROM payment_orders WHERE reference_id = v_ref;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 2: Valid Credit - Discounted Amount (8,50,000 cents) succeeds
  -- ------------------------------------------------------------
  v_ref := 'pl_test_validcredit_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_a, v_ref, 850000, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, audit_completed_at, credit_eligible_from, credit_expires_at)
  VALUES (v_tenant_a, 'Test Biz', 'completed', 99900, now() - interval '1 hour', now() - interval '1 hour', now() + interval '7 days')
  RETURNING id INTO v_audit_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, audit_order_id, plan_tier, price_cents, status)
  VALUES (v_tenant_a, v_link_id, v_audit_id, 'launch', 949900, 'pending_payment')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_validcredit_2',
    p_provider_payment_id => 'pay_validcredit_2',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 850000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT credit_consumed_at INTO v_audit_consumed FROM audit_orders WHERE id = v_audit_id;

  IF (v_res->>'fulfilled')::boolean IS NOT TRUE OR v_order_count <> 1 OR v_sub_status <> 'active' OR v_audit_consumed IS NULL THEN
    RAISE EXCEPTION 'Case 2 Failed: Valid credit discounted amount failed. Res=%, orders=%, sub_status=%, credit_consumed=%', v_res, v_order_count, v_sub_status, v_audit_consumed;
  END IF;

  DELETE FROM entitlement_ledger_entries WHERE subscription_id = v_sub_id;
  DELETE FROM usage_entitlements WHERE subscription_id = v_sub_id;
  DELETE FROM payment_orders WHERE reference_id = v_ref;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 3: Expired Credit + Discounted Payment -> REJECTED
  -- ------------------------------------------------------------
  v_ref := 'pl_test_expiredcredit_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_a, v_ref, 850000, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, audit_completed_at, credit_eligible_from, credit_expires_at)
  VALUES (v_tenant_a, 'Test Biz', 'completed', 99900, now() - interval '10 days', now() - interval '10 days', now() - interval '3 days')
  RETURNING id INTO v_audit_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, audit_order_id, plan_tier, price_cents, status)
  VALUES (v_tenant_a, v_link_id, v_audit_id, 'launch', 949900, 'pending_payment')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_expiredcredit_3',
    p_provider_payment_id => 'pay_expiredcredit_3',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 850000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT credit_consumed_at INTO v_audit_consumed FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ent_count FROM usage_entitlements WHERE subscription_id = v_sub_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'subscription_expected_amount_mismatch'
     OR v_order_count <> 0
     OR v_sub_status <> 'pending_payment'
     OR v_audit_consumed IS NOT NULL
     OR v_ent_count <> 0
     OR v_link_status <> 'reconciliation_required' THEN
    RAISE EXCEPTION 'Case 3 Failed: Expired credit discounted payment was not cleanly rejected. Res=%, orders=%, sub_status=%, credit_consumed=%, link_status=%', v_res, v_order_count, v_sub_status, v_audit_consumed, v_link_status;
  END IF;

  DELETE FROM payment_reconciliation_issues WHERE link_id = v_link_id::text;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 4: Already Consumed Credit + Discounted Payment -> REJECTED
  -- ------------------------------------------------------------
  v_ref := 'pl_test_consumedcredit_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_a, v_ref, 850000, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, audit_completed_at, credit_eligible_from, credit_expires_at, credit_consumed_at)
  VALUES (v_tenant_a, 'Test Biz', 'completed', 99900, now() - interval '1 hour', now() - interval '1 hour', now() + interval '7 days', now() - interval '30 mins')
  RETURNING id INTO v_audit_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, audit_order_id, plan_tier, price_cents, status)
  VALUES (v_tenant_a, v_link_id, v_audit_id, 'launch', 949900, 'pending_payment')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_consumedcredit_4',
    p_provider_payment_id => 'pay_consumedcredit_4',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 850000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ent_count FROM usage_entitlements WHERE subscription_id = v_sub_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'subscription_expected_amount_mismatch'
     OR v_order_count <> 0
     OR v_sub_status <> 'pending_payment'
     OR v_ent_count <> 0
     OR v_link_status <> 'reconciliation_required' THEN
    RAISE EXCEPTION 'Case 4 Failed: Consumed credit discounted payment was not cleanly rejected. Res=%, orders=%, sub_status=%, link_status=%', v_res, v_order_count, v_sub_status, v_link_status;
  END IF;

  DELETE FROM payment_reconciliation_issues WHERE link_id = v_link_id::text;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 5: Cross-Tenant Audit Credit -> REJECTED
  -- ------------------------------------------------------------
  v_ref := 'pl_test_crosstenant_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_a, v_ref, 850000, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  -- Audit order belongs to Tenant B
  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, audit_completed_at, credit_eligible_from, credit_expires_at)
  VALUES (v_tenant_b, 'Test Biz B', 'completed', 99900, now() - interval '1 hour', now() - interval '1 hour', now() + interval '7 days')
  RETURNING id INTO v_audit_id;

  -- Subscription belongs to Tenant A, pointing at Tenant B's audit order
  INSERT INTO subscriptions (tenant_id, payment_link_id, audit_order_id, plan_tier, price_cents, status)
  VALUES (v_tenant_a, v_link_id, v_audit_id, 'launch', 949900, 'pending_payment')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_crosstenant_5',
    p_provider_payment_id => 'pay_crosstenant_5',
    p_provider_link_id => null,
    p_provider_order_id => null,
    p_reference_id => v_ref,
    p_actual_amount_cents => 850000,
    p_actual_currency => 'INR',
    p_provider_status => 'captured',
    p_captured => true
  );

  SELECT count(*) INTO v_order_count FROM payment_orders WHERE reference_id = v_ref;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_id;
  SELECT credit_consumed_at INTO v_audit_consumed FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'subscription_expected_amount_mismatch'
     OR v_order_count <> 0
     OR v_sub_status <> 'pending_payment'
     OR v_audit_consumed IS NOT NULL
     OR v_link_status <> 'reconciliation_required' THEN
    RAISE EXCEPTION 'Case 5 Failed: Cross tenant audit credit was not cleanly rejected. Res=%, orders=%, sub_status=%, credit_consumed=%, link_status=%', v_res, v_order_count, v_sub_status, v_audit_consumed, v_link_status;
  END IF;

  DELETE FROM payment_reconciliation_issues WHERE link_id = v_link_id::text;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- Cleanup isolated Tenants
  DELETE FROM tenants WHERE id IN (v_tenant_a, v_tenant_b);

  RAISE NOTICE 'ALL 5 AUDIT CREDIT PRICE REVALIDATION POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
