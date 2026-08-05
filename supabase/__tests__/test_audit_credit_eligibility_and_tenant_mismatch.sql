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
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Eligibility A', 'test-tenant-eligibility-a-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_a;
  INSERT INTO tenants (name, slug) VALUES ('Test Tenant Eligibility B', 'test-tenant-eligibility-b-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_b;

  -- ------------------------------------------------------------
  -- Case 1: Future Credit Start + Discounted Payment -> REJECTED (subscription_expected_amount_mismatch)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_future_disc_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_a, v_ref, 850000, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, audit_completed_at, credit_eligible_from, credit_expires_at)
  VALUES (v_tenant_a, 'Test Biz', 'completed', 99900, now(), now() + interval '1 day', now() + interval '8 days')
  RETURNING id INTO v_audit_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, audit_order_id, plan_tier, price_cents, status)
  VALUES (v_tenant_a, v_link_id, v_audit_id, 'launch', 949900, 'pending_payment')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_future_disc_1',
    p_provider_payment_id => 'pay_future_disc_1',
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
    RAISE EXCEPTION 'Case 1 Failed: Future credit discounted payment was not cleanly rejected. Res=%, orders=%, sub_status=%, link_status=%', v_res, v_order_count, v_sub_status, v_link_status;
  END IF;

  DELETE FROM payment_reconciliation_issues WHERE link_id = v_link_id::text;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 2: Future Credit Start + Full Payment -> SUCCEEDS using NO credit when tenant ownership is valid
  -- ------------------------------------------------------------
  v_ref := 'pl_test_future_full_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_a, v_ref, 949900, 'INR', 'created', 'subscription_payment')
  RETURNING id INTO v_link_id;

  INSERT INTO audit_orders (tenant_id, business_name, status, audit_fee_cents, audit_completed_at, credit_eligible_from, credit_expires_at)
  VALUES (v_tenant_a, 'Test Biz', 'completed', 99900, now(), now() + interval '1 day', now() + interval '8 days')
  RETURNING id INTO v_audit_id;

  INSERT INTO subscriptions (tenant_id, payment_link_id, audit_order_id, plan_tier, price_cents, status)
  VALUES (v_tenant_a, v_link_id, v_audit_id, 'launch', 949900, 'pending_payment')
  RETURNING id INTO v_sub_id;

  v_res := reconcile_and_fulfill_razorpay_payment_v4(
    p_provider_event_id => 'evt_future_full_2',
    p_provider_payment_id => 'pay_future_full_2',
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
  SELECT credit_consumed_at INTO v_audit_consumed FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;

  IF (v_res->>'fulfilled')::boolean IS NOT TRUE OR v_order_count <> 1 OR v_sub_status <> 'active' OR v_audit_consumed IS NOT NULL OR v_link_status <> 'paid' THEN
    RAISE EXCEPTION 'Case 2 Failed: Future credit full payment failed. Res=%, orders=%, sub_status=%, credit_consumed=%, link_status=%', v_res, v_order_count, v_sub_status, v_audit_consumed, v_link_status;
  END IF;

  DELETE FROM entitlement_ledger_entries WHERE subscription_id = v_sub_id;
  DELETE FROM usage_entitlements WHERE subscription_id = v_sub_id;
  DELETE FROM payment_orders WHERE reference_id = v_ref;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 3: Cross-Tenant Audit + Discounted Payment -> REJECTED (audit_credit_tenant_mismatch)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_crosstenant_disc_' || gen_random_uuid()::text;
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
    p_provider_event_id => 'evt_crosstenant_disc_3',
    p_provider_payment_id => 'pay_crosstenant_disc_3',
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
     OR (v_res->>'reason') <> 'audit_credit_tenant_mismatch'
     OR v_order_count <> 0
     OR v_sub_status <> 'pending_payment'
     OR v_audit_consumed IS NOT NULL
     OR v_ent_count <> 0
     OR v_link_status <> 'reconciliation_required' THEN
    RAISE EXCEPTION 'Case 3 Failed: Cross tenant audit discounted payment was not rejected with audit_credit_tenant_mismatch. Res=%, orders=%, sub_status=%, link_status=%', v_res, v_order_count, v_sub_status, v_link_status;
  END IF;

  DELETE FROM payment_reconciliation_issues WHERE link_id = v_link_id::text;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- ------------------------------------------------------------
  -- Case 4: Cross-Tenant Audit + Full-Price Payment -> ALSO REJECTED (audit_credit_tenant_mismatch)
  -- ------------------------------------------------------------
  v_ref := 'pl_test_crosstenant_full_' || gen_random_uuid()::text;
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, currency, status, payment_purpose)
  VALUES (v_tenant_a, v_ref, 949900, 'INR', 'created', 'subscription_payment')
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
    p_provider_event_id => 'evt_crosstenant_full_4',
    p_provider_payment_id => 'pay_crosstenant_full_4',
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
  SELECT credit_consumed_at INTO v_audit_consumed FROM audit_orders WHERE id = v_audit_id;
  SELECT status INTO v_link_status FROM payment_links WHERE id = v_link_id;
  SELECT count(*) INTO v_ent_count FROM usage_entitlements WHERE subscription_id = v_sub_id;

  IF (v_res->>'fulfilled')::boolean IS NOT FALSE
     OR (v_res->>'reason') <> 'audit_credit_tenant_mismatch'
     OR v_order_count <> 0
     OR v_sub_status <> 'pending_payment'
     OR v_audit_consumed IS NOT NULL
     OR v_ent_count <> 0
     OR v_link_status <> 'reconciliation_required' THEN
    RAISE EXCEPTION 'Case 4 Failed: Cross tenant audit full-price payment was not rejected with audit_credit_tenant_mismatch. Res=%, orders=%, sub_status=%, link_status=%', v_res, v_order_count, v_sub_status, v_link_status;
  END IF;

  DELETE FROM payment_reconciliation_issues WHERE link_id = v_link_id::text;
  DELETE FROM subscriptions WHERE id = v_sub_id;
  DELETE FROM audit_orders WHERE id = v_audit_id;
  DELETE FROM payment_links WHERE id = v_link_id;

  -- Cleanup isolated Tenants
  DELETE FROM tenants WHERE id IN (v_tenant_a, v_tenant_b);

  RAISE NOTICE 'ALL AUDIT CREDIT ELIGIBILITY & CROSS-TENANT REJECTION POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
