DO $$
DECLARE
  v_tenant uuid;
  v_link_valid uuid;
  v_sub_valid uuid;
  v_sub_other uuid;
  v_order_valid uuid;
  v_refund_valid uuid;

  v_link_old_fixture uuid;
  v_order_old_fixture uuid;
  v_refund_old_fixture uuid;

  v_link_missing_meta uuid;
  v_order_missing_meta uuid;
  v_refund_missing_meta uuid;

  v_link_bad_meta uuid;
  v_order_bad_meta uuid;
  v_refund_bad_meta uuid;

  v_link_no_ent uuid;
  v_sub_no_ent uuid;
  v_order_no_ent uuid;
  v_refund_no_ent uuid;

  v_ent_valid_id uuid;
  v_ent_other_id uuid;
  v_ent_null_sub_id uuid;

  v_res jsonb;
  v_status text;
  v_reason text;
  v_processed_at timestamptz;
  v_sub_status text;
  v_base_valid int;
  v_base_other int;
  v_base_null int;
  v_ledger_count int;
BEGIN
  -- Setup isolated tenant
  INSERT INTO tenants (name, slug) VALUES ('Tenant Scoping Test', 'tenant-scoping-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- Create primary subscription link
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_ref_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_valid;

  INSERT INTO subscriptions (tenant_id, plan_tier, price_cents, payment_link_id, status)
  VALUES (v_tenant, 'growth', 1899900, v_link_valid, 'active')
  RETURNING id INTO v_sub_valid;

  -- Create another same-tenant subscription
  INSERT INTO subscriptions (tenant_id, plan_tier, price_cents, status)
  VALUES (v_tenant, 'launch', 949900, 'active')
  RETURNING id INTO v_sub_other;

  -- Entitlement strictly belonging to v_sub_valid
  INSERT INTO usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
  VALUES (v_tenant, v_sub_valid, 'social_posts', 100, 20, 120, 10)
  RETURNING id INTO v_ent_valid_id;

  -- Entitlement belonging to ANOTHER subscription (v_sub_other)
  INSERT INTO usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
  VALUES (v_tenant, v_sub_other, 'meta_ad_campaigns', 50, 0, 50, 5)
  RETURNING id INTO v_ent_other_id;

  -- Entitlement belonging to same tenant but NULL subscription_id
  INSERT INTO usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
  VALUES (v_tenant, NULL, 'whatsapp_contacts', 500, 0, 500, 50)
  RETURNING id INTO v_ent_null_sub_id;

  -- ------------------------------------------------------------
  -- Case 1: Production-shaped subscription refund -> SUCCEEDS
  -- ------------------------------------------------------------
  SELECT reference_id INTO v_status FROM payment_links WHERE id = v_link_valid;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_scoping_val1', 'order_scoping_val1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_status, jsonb_build_object('link_id', v_link_valid::text))
  RETURNING id INTO v_order_valid;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_valid, 199000, 'PENDING')
  RETURNING id INTO v_refund_valid;

  v_res := process_refund_atomic_v10(
    p_refund_id => v_refund_valid,
    p_payment_order_id => v_order_valid,
    p_provider_refund_id => 'rfnd_scoping_val1',
    p_provider_payment_id => 'pay_scoping_val1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at INTO v_status, v_processed_at FROM payment_refunds WHERE id = v_refund_valid;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_valid;
  SELECT base_limit_amount INTO v_base_valid FROM usage_entitlements WHERE id = v_ent_valid_id;
  SELECT base_limit_amount INTO v_base_other FROM usage_entitlements WHERE id = v_ent_other_id;
  SELECT base_limit_amount INTO v_base_null FROM usage_entitlements WHERE id = v_ent_null_sub_id;
  SELECT count(*) INTO v_ledger_count FROM entitlement_ledger_entries WHERE subscription_id = v_sub_valid;

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_status <> 'PROCESSED'
     OR v_processed_at IS NULL
     OR v_sub_status <> 'refunded'
     OR v_base_valid <> 0
     OR v_base_other <> 50 -- UNCHANGED!
     OR v_base_null <> 500 -- UNCHANGED!
     OR v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Case 1 Failed: Production-shaped sub refund failed or reversed wrong entitlements. Res=%, base_valid=%, base_other=%, base_null=%, ledger_count=%', v_res, v_base_valid, v_base_other, v_base_null, v_ledger_count;
  END IF;

  -- Test duplicate processing remains idempotent
  v_res := process_refund_atomic_v10(
    p_refund_id => v_refund_valid,
    p_payment_order_id => v_order_valid,
    p_provider_refund_id => 'rfnd_scoping_val1',
    p_provider_payment_id => 'pay_scoping_val1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT base_limit_amount INTO v_base_valid FROM usage_entitlements WHERE id = v_ent_valid_id;
  SELECT count(*) INTO v_ledger_count FROM entitlement_ledger_entries WHERE subscription_id = v_sub_valid;

  IF (v_res->>'already_processed')::boolean IS NOT TRUE
     OR v_base_valid <> 0
     OR v_ledger_count <> 1 THEN
    RAISE EXCEPTION 'Case 1 Duplicate Failed: Duplicate processing failed. Res=%, base_valid=%, ledger_count=%', v_res, v_base_valid, v_ledger_count;
  END IF;

  -- ------------------------------------------------------------
  -- Case 2: Old invented reference_id = payment_link.id fixture -> REJECTED
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_ref_old_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_old_fixture;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_scoping_old1', 'order_scoping_old1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_link_old_fixture::text /* invented link.id as ref_id */, jsonb_build_object('link_id', v_link_old_fixture::text))
  RETURNING id INTO v_order_old_fixture;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_old_fixture, 199000, 'PENDING')
  RETURNING id INTO v_refund_old_fixture;

  v_res := process_refund_atomic_v10(
    p_refund_id => v_refund_old_fixture,
    p_payment_order_id => v_order_old_fixture,
    p_provider_refund_id => 'rfnd_scoping_old1',
    p_provider_payment_id => 'pay_scoping_old1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason FROM payment_refunds WHERE id = v_refund_old_fixture INTO v_status, v_reason;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'subscription_refund_relationship_mismatch'
     OR v_status <> 'MANUAL_REVIEW' THEN
    RAISE EXCEPTION 'Case 2 Failed: Old invented fixture reference_id was not rejected. Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 3: Missing metadata.link_id -> REJECTED
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_ref_nometa_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_missing_meta;

  SELECT reference_id INTO v_status FROM payment_links WHERE id = v_link_missing_meta;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_scoping_nometa1', 'order_scoping_nometa1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_status, '{}'::jsonb)
  RETURNING id INTO v_order_missing_meta;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_missing_meta, 199000, 'PENDING')
  RETURNING id INTO v_refund_missing_meta;

  v_res := process_refund_atomic_v10(
    p_refund_id => v_refund_missing_meta,
    p_payment_order_id => v_order_missing_meta,
    p_provider_refund_id => 'rfnd_scoping_nometa1',
    p_provider_payment_id => 'pay_scoping_nometa1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason FROM payment_refunds WHERE id = v_refund_missing_meta INTO v_status, v_reason;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'subscription_refund_relationship_mismatch'
     OR v_status <> 'MANUAL_REVIEW' THEN
    RAISE EXCEPTION 'Case 3 Failed: Missing metadata.link_id was not rejected. Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 4: Incorrect metadata.link_id -> REJECTED
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_ref_badmeta_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_bad_meta;

  SELECT reference_id INTO v_status FROM payment_links WHERE id = v_link_bad_meta;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_scoping_badmeta1', 'order_scoping_badmeta1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_status, jsonb_build_object('link_id', gen_random_uuid()::text))
  RETURNING id INTO v_order_bad_meta;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_bad_meta, 199000, 'PENDING')
  RETURNING id INTO v_refund_bad_meta;

  v_res := process_refund_atomic_v10(
    p_refund_id => v_refund_bad_meta,
    p_payment_order_id => v_order_bad_meta,
    p_provider_refund_id => 'rfnd_scoping_badmeta1',
    p_provider_payment_id => 'pay_scoping_badmeta1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason FROM payment_refunds WHERE id = v_refund_bad_meta INTO v_status, v_reason;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'subscription_refund_relationship_mismatch'
     OR v_status <> 'MANUAL_REVIEW' THEN
    RAISE EXCEPTION 'Case 4 Failed: Incorrect metadata.link_id was not rejected. Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 5: No linked entitlement rows -> MANUAL_REVIEW
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_ref_noent_' || gen_random_uuid()::text, 199000, 'subscription_payment', 'paid')
  RETURNING id INTO v_link_no_ent;

  INSERT INTO subscriptions (tenant_id, plan_tier, price_cents, payment_link_id, status)
  VALUES (v_tenant, 'growth', 1899900, v_link_no_ent, 'active')
  RETURNING id INTO v_sub_no_ent;

  SELECT reference_id INTO v_status FROM payment_links WHERE id = v_link_no_ent;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_scoping_noent1', 'order_scoping_noent1', 199000, 'INR', 'CAPTURED', 'subscription_payment', 'live', 'payment_link', v_status, jsonb_build_object('link_id', v_link_no_ent::text))
  RETURNING id INTO v_order_no_ent;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_no_ent, 199000, 'PENDING')
  RETURNING id INTO v_refund_no_ent;

  v_res := process_refund_atomic_v10(
    p_refund_id => v_refund_no_ent,
    p_payment_order_id => v_order_no_ent,
    p_provider_refund_id => 'rfnd_scoping_noent1',
    p_provider_payment_id => 'pay_scoping_noent1',
    p_actual_refund_amount_cents => 199000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, reason FROM payment_refunds WHERE id = v_refund_no_ent INTO v_status, v_reason;
  SELECT status INTO v_sub_status FROM subscriptions WHERE id = v_sub_no_ent;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'subscription_entitlements_not_found_for_refund'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_sub_status <> 'active' THEN
    RAISE EXCEPTION 'Case 5 Failed: Subscription without entitlement rows was not rejected to MANUAL_REVIEW. Res=%, status=%, sub_status=%', v_res, v_status, v_sub_status;
  END IF;

  -- Cleanup test tenant
  DELETE FROM entitlement_ledger_entries WHERE tenant_id = v_tenant;
  DELETE FROM payment_refunds WHERE tenant_id = v_tenant;
  DELETE FROM payment_orders WHERE tenant_id = v_tenant;
  DELETE FROM usage_entitlements WHERE tenant_id = v_tenant;
  DELETE FROM subscriptions WHERE tenant_id = v_tenant;
  DELETE FROM payment_links WHERE tenant_id = v_tenant;
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL PROCESS_REFUND_ATOMIC_V10 POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
