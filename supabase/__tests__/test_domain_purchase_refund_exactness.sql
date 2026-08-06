DO $$
DECLARE
  v_tenant uuid;

  v_link_valid uuid;
  v_domain_valid uuid;
  v_order_valid uuid;
  v_refund_valid uuid;

  v_link_unrelated uuid;
  v_domain_unrelated uuid;

  v_link_partial uuid;
  v_domain_partial uuid;
  v_order_partial uuid;
  v_refund_partial uuid;

  v_link_nodomain uuid;
  v_order_nodomain uuid;
  v_refund_nodomain uuid;

  v_link_badmeta uuid;
  v_order_badmeta uuid;
  v_refund_badmeta uuid;

  v_link_nometa uuid;
  v_order_nometa uuid;
  v_refund_nometa uuid;

  v_link_registering uuid;
  v_domain_registering uuid;
  v_order_registering uuid;
  v_refund_registering uuid;

  v_link_registered uuid;
  v_domain_registered uuid;
  v_order_registered uuid;
  v_refund_registered uuid;

  v_link_active uuid;
  v_domain_active uuid;
  v_order_active uuid;
  v_refund_active uuid;

  v_link_provid uuid;
  v_domain_provid uuid;
  v_order_provid uuid;
  v_refund_provid uuid;

  v_res jsonb;
  v_status text;
  v_reason text;
  v_processed_at timestamptz;
  v_domain_status text;
  v_ref_id text;
BEGIN
  -- Setup test tenant
  INSERT INTO tenants (name, slug) VALUES ('Domain Refund Test Tenant', 'domain-refund-tenant-' || gen_random_uuid()::text) RETURNING id INTO v_tenant;

  -- Create an unrelated same-tenant domain (must remain untouched!)
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_dom_unrelated_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  RETURNING id INTO v_link_unrelated;

  INSERT INTO domains (tenant_id, domain_name, provider, status, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
  VALUES (v_tenant, 'unrelated-domain-' || gen_random_uuid()::text || '.in', 'sandbox', 'paid_pending_registration', 149900, 149900, v_link_unrelated, 'Unrelated Owner', 'owner@unrelated.com', '+919999999999')
  RETURNING id INTO v_domain_unrelated;

  -- ------------------------------------------------------------
  -- Case 1: Valid production-shaped full refund -> SUCCEEDS (status set to 'refunded', NOT 'cancelled')
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_dom_val1_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  RETURNING id INTO v_link_valid;

  INSERT INTO domains (tenant_id, domain_name, provider, status, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
  VALUES (v_tenant, 'valid-refund-' || gen_random_uuid()::text || '.com', 'sandbox', 'paid_pending_registration', 149900, 149900, v_link_valid, 'Valid Owner', 'owner@valid.com', '+919876543210')
  RETURNING id INTO v_domain_valid;

  SELECT reference_id INTO v_ref_id FROM payment_links WHERE id = v_link_valid;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_dom_val1', 'order_dom_val1', 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', v_link_valid::text))
  RETURNING id INTO v_order_valid;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_valid, 149900, 'PENDING')
  RETURNING id INTO v_refund_valid;

  v_res := process_refund_atomic_v11(
    p_refund_id => v_refund_valid,
    p_payment_order_id => v_order_valid,
    p_provider_refund_id => 'rfnd_dom_val1',
    p_provider_payment_id => 'pay_dom_val1',
    p_actual_refund_amount_cents => 149900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at INTO v_status, v_processed_at FROM payment_refunds WHERE id = v_refund_valid;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_valid;

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_status <> 'PROCESSED'
     OR v_processed_at IS NULL
     OR v_domain_status <> 'refunded' THEN -- MUST be refunded, NOT cancelled!
    RAISE EXCEPTION 'Case 1 Failed: Valid domain purchase refund failed or domain status not refunded. Res=%, status=%, domain_status=%', v_res, v_status, v_domain_status;
  END IF;

  -- Test duplicate processing remains idempotent
  v_res := process_refund_atomic_v11(
    p_refund_id => v_refund_valid,
    p_payment_order_id => v_order_valid,
    p_provider_refund_id => 'rfnd_dom_val1',
    p_provider_payment_id => 'pay_dom_val1',
    p_actual_refund_amount_cents => 149900,
    p_provider_refund_status => 'processed'
  );

  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_valid;
  IF (v_res->>'already_processed')::boolean IS NOT TRUE OR v_domain_status <> 'refunded' THEN
    RAISE EXCEPTION 'Case 1 Duplicate Failed: Res=%, domain_status=%', v_res, v_domain_status;
  END IF;

  -- Check unrelated domain remains unchanged (paid_pending_registration)
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_unrelated;
  IF v_domain_status <> 'paid_pending_registration' THEN
    RAISE EXCEPTION 'Case 1 Unrelated Domain Failed: Unrelated domain status mutated to %', v_domain_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 2: Partial Refund -> REJECTED (MANUAL_REVIEW)
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_dom_part_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  RETURNING id INTO v_link_partial;

  INSERT INTO domains (tenant_id, domain_name, provider, status, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
  VALUES (v_tenant, 'partial-refund-' || gen_random_uuid()::text || '.com', 'sandbox', 'paid_pending_registration', 149900, 149900, v_link_partial, 'Partial Owner', 'owner@partial.com', '+919876543210')
  RETURNING id INTO v_domain_partial;

  SELECT reference_id INTO v_ref_id FROM payment_links WHERE id = v_link_partial;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_dom_part1', 'order_dom_part1', 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', v_link_partial::text))
  RETURNING id INTO v_order_partial;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_partial, 50000, 'PENDING')
  RETURNING id INTO v_refund_partial;

  v_res := process_refund_atomic_v11(
    p_refund_id => v_refund_partial,
    p_payment_order_id => v_order_partial,
    p_provider_refund_id => 'rfnd_dom_part1',
    p_provider_payment_id => 'pay_dom_part1',
    p_actual_refund_amount_cents => 50000,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at FROM payment_refunds WHERE id = v_refund_partial INTO v_status, v_processed_at;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_partial;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'partial_domain_purchase_refund_manual_review'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_domain_status <> 'paid_pending_registration' THEN
    RAISE EXCEPTION 'Case 2 Partial Refund Failed: Res=%, status=%, domain_status=%', v_res, v_status, v_domain_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 3: Missing domain -> REJECTED (domain_not_found_for_refund)
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_dom_nodom_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  RETURNING id INTO v_link_nodomain;

  SELECT reference_id INTO v_ref_id FROM payment_links WHERE id = v_link_nodomain;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_dom_nodom1', 'order_dom_nodom1', 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', v_link_nodomain::text))
  RETURNING id INTO v_order_nodomain;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_nodomain, 149900, 'PENDING')
  RETURNING id INTO v_refund_nodomain;

  v_res := process_refund_atomic_v11(
    p_refund_id => v_refund_nodomain,
    p_payment_order_id => v_order_nodomain,
    p_provider_refund_id => 'rfnd_dom_nodom1',
    p_provider_payment_id => 'pay_dom_nodom1',
    p_actual_refund_amount_cents => 149900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at FROM payment_refunds WHERE id = v_refund_nodomain INTO v_status, v_processed_at;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'domain_not_found_for_refund'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Case 3 Missing Domain Failed: Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 4: Incorrect metadata.link_id -> REJECTED (domain_purchase_refund_relationship_mismatch)
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_dom_badmeta_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  RETURNING id INTO v_link_badmeta;

  SELECT reference_id INTO v_ref_id FROM payment_links WHERE id = v_link_badmeta;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_dom_badmeta1', 'order_dom_badmeta1', 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', gen_random_uuid()::text))
  RETURNING id INTO v_order_badmeta;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_badmeta, 149900, 'PENDING')
  RETURNING id INTO v_refund_badmeta;

  v_res := process_refund_atomic_v11(
    p_refund_id => v_refund_badmeta,
    p_payment_order_id => v_order_badmeta,
    p_provider_refund_id => 'rfnd_dom_badmeta1',
    p_provider_payment_id => 'pay_dom_badmeta1',
    p_actual_refund_amount_cents => 149900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at FROM payment_refunds WHERE id = v_refund_badmeta INTO v_status, v_processed_at;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'domain_purchase_refund_relationship_mismatch'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Case 4 Incorrect Metadata Failed: Res=%, status=%', v_res, v_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 5: Registering domain -> REJECTED (domain_registration_started_or_unverifiable)
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_dom_reging_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  RETURNING id INTO v_link_registering;

  INSERT INTO domains (tenant_id, domain_name, provider, status, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
  VALUES (v_tenant, 'registering-domain-' || gen_random_uuid()::text || '.com', 'sandbox', 'registering', 149900, 149900, v_link_registering, 'Reging Owner', 'owner@reging.com', '+919876543210')
  RETURNING id INTO v_domain_registering;

  SELECT reference_id INTO v_ref_id FROM payment_links WHERE id = v_link_registering;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_dom_reging1', 'order_dom_reging1', 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', v_link_registering::text))
  RETURNING id INTO v_order_registering;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_registering, 149900, 'PENDING')
  RETURNING id INTO v_refund_registering;

  v_res := process_refund_atomic_v11(
    p_refund_id => v_refund_registering,
    p_payment_order_id => v_order_registering,
    p_provider_refund_id => 'rfnd_dom_reging1',
    p_provider_payment_id => 'pay_dom_reging1',
    p_actual_refund_amount_cents => 149900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at FROM payment_refunds WHERE id = v_refund_registering INTO v_status, v_processed_at;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_registering;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'domain_registration_started_or_unverifiable'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_domain_status <> 'registering' THEN
    RAISE EXCEPTION 'Case 5 Registering Domain Failed: Res=%, status=%, domain_status=%', v_res, v_status, v_domain_status;
  END IF;

  -- ------------------------------------------------------------
  -- Case 6: Existing provider_domain_id -> REJECTED (domain_registration_started_or_unverifiable)
  -- ------------------------------------------------------------
  INSERT INTO payment_links (tenant_id, reference_id, amount_cents, payment_purpose, status)
  VALUES (v_tenant, 'plink_dom_provid_' || gen_random_uuid()::text, 149900, 'domain_purchase', 'paid')
  RETURNING id INTO v_link_provid;

  INSERT INTO domains (tenant_id, domain_name, provider, status, provider_domain_id, purchase_price_cents, renewal_price_cents, payment_link_id, registrant_name, registrant_email, registrant_phone)
  VALUES (v_tenant, 'provid-domain-' || gen_random_uuid()::text || '.com', 'sandbox', 'paid_pending_registration', 'dom_rc_999', 149900, 149900, v_link_provid, 'Provid Owner', 'owner@provid.com', '+919876543210')
  RETURNING id INTO v_domain_provid;

  SELECT reference_id INTO v_ref_id FROM payment_links WHERE id = v_link_provid;

  INSERT INTO payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
  VALUES (v_tenant, 'razorpay', 'pay_dom_provid1', 'order_dom_provid1', 149900, 'INR', 'CAPTURED', 'domain_purchase', 'live', 'payment_link', v_ref_id, jsonb_build_object('link_id', v_link_provid::text))
  RETURNING id INTO v_order_provid;

  INSERT INTO payment_refunds (tenant_id, payment_order_id, amount_cents, status)
  VALUES (v_tenant, v_order_provid, 149900, 'PENDING')
  RETURNING id INTO v_refund_provid;

  v_res := process_refund_atomic_v11(
    p_refund_id => v_refund_provid,
    p_payment_order_id => v_order_provid,
    p_provider_refund_id => 'rfnd_dom_provid1',
    p_provider_payment_id => 'pay_dom_provid1',
    p_actual_refund_amount_cents => 149900,
    p_provider_refund_status => 'processed'
  );

  SELECT status, processed_at FROM payment_refunds WHERE id = v_refund_provid INTO v_status, v_processed_at;
  SELECT status INTO v_domain_status FROM domains WHERE id = v_domain_provid;

  IF (v_res->>'success')::boolean IS NOT FALSE
     OR v_res->>'reason' <> 'domain_registration_started_or_unverifiable'
     OR v_status <> 'MANUAL_REVIEW'
     OR v_processed_at IS NOT NULL
     OR v_domain_status <> 'paid_pending_registration' THEN
    RAISE EXCEPTION 'Case 6 Existing Provider Domain ID Failed: Res=%, status=%, domain_status=%', v_res, v_status, v_domain_status;
  END IF;

  -- Cleanup test tenant
  DELETE FROM payment_refunds WHERE tenant_id = v_tenant;
  DELETE FROM payment_orders WHERE tenant_id = v_tenant;
  DELETE FROM domains WHERE tenant_id = v_tenant;
  DELETE FROM payment_links WHERE tenant_id = v_tenant;
  DELETE FROM tenants WHERE id = v_tenant;

  RAISE NOTICE 'ALL PROCESS_REFUND_ATOMIC_V11 POSTGRESQL ASSERTIONS PASSED CLEANLY!';
END;
$$;
