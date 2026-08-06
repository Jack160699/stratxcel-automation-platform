DO $$
DECLARE
  v_tenant_a uuid;
  v_tenant_b uuid;

  v_staff_user uuid;
  v_non_staff_user uuid;
  v_inactive_staff_user uuid;

  v_audit_valid uuid;
  v_audit_cancelled uuid;

  v_res jsonb;
  v_status text;
  v_completed_by uuid;
  v_audit_completed_at timestamptz;
  v_delivered_at timestamptz;
  v_event_count int;
BEGIN
  -- Setup test tenants
  INSERT INTO tenants (name, slug) VALUES ('Staff Audit Tenant A', 'staff-tenant-a-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_a;
  INSERT INTO tenants (name, slug) VALUES ('Staff Audit Tenant B', 'staff-tenant-b-' || gen_random_uuid()::text) RETURNING id INTO v_tenant_b;

  -- Create test users in auth.users
  INSERT INTO auth.users (id, instance_id, email, aud, role)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'staff-' || gen_random_uuid()::text || '@test.com', 'authenticated', 'authenticated')
  RETURNING id INTO v_staff_user;

  INSERT INTO auth.users (id, instance_id, email, aud, role)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'nonstaff-' || gen_random_uuid()::text || '@test.com', 'authenticated', 'authenticated')
  RETURNING id INTO v_non_staff_user;

  INSERT INTO auth.users (id, instance_id, email, aud, role)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'inactivestaff-' || gen_random_uuid()::text || '@test.com', 'authenticated', 'authenticated')
  RETURNING id INTO v_inactive_staff_user;

  -- Create staff records
  INSERT INTO platform_staff_users (user_id, role, is_active) VALUES (v_staff_user, 'audit_reviewer', true);
  INSERT INTO platform_staff_users (user_id, role, is_active) VALUES (v_inactive_staff_user, 'audit_reviewer', false);

  -- Create audit orders
  INSERT INTO audit_orders (tenant_id, user_id, business_name, status, audit_fee_cents)
  VALUES (v_tenant_a, v_staff_user, 'Valid Business A', 'paid', 99900)
  RETURNING id INTO v_audit_valid;

  INSERT INTO audit_orders (tenant_id, user_id, business_name, status, audit_fee_cents)
  VALUES (v_tenant_a, v_staff_user, 'Cancelled Business', 'cancelled', 99900)
  RETURNING id INTO v_audit_cancelled;

  -- ------------------------------------------------------------
  -- Test 1: Non-staff actor -> REJECTED (non_staff_actor)
  -- ------------------------------------------------------------
  v_res := complete_audit_and_issue_subscription_credit_v5(v_audit_valid, v_tenant_a, v_non_staff_user);
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'non_staff_actor' THEN
    RAISE EXCEPTION 'Test 1 Failed: Non-staff actor not rejected properly. Res=%', v_res;
  END IF;

  -- ------------------------------------------------------------
  -- Test 2: Inactive staff actor -> REJECTED (non_staff_actor)
  -- ------------------------------------------------------------
  v_res := complete_audit_and_issue_subscription_credit_v5(v_audit_valid, v_tenant_a, v_inactive_staff_user);
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'non_staff_actor' THEN
    RAISE EXCEPTION 'Test 2 Failed: Inactive staff actor not rejected properly. Res=%', v_res;
  END IF;

  -- ------------------------------------------------------------
  -- Test 3: Cross-tenant completion -> REJECTED (tenant_mismatch)
  -- ------------------------------------------------------------
  v_res := complete_audit_and_issue_subscription_credit_v5(v_audit_valid, v_tenant_b /* wrong tenant */, v_staff_user);
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'tenant_mismatch' THEN
    RAISE EXCEPTION 'Test 3 Failed: Cross-tenant completion not rejected. Res=%', v_res;
  END IF;

  -- ------------------------------------------------------------
  -- Test 4: Cancelled/Refunded audit -> REJECTED (audit_cancelled_or_refunded)
  -- ------------------------------------------------------------
  v_res := complete_audit_and_issue_subscription_credit_v5(v_audit_cancelled, v_tenant_a, v_staff_user);
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'audit_cancelled_or_refunded' THEN
    RAISE EXCEPTION 'Test 4 Failed: Cancelled audit completion not rejected. Res=%', v_res;
  END IF;

  -- ------------------------------------------------------------
  -- Test 5: Valid staff completion -> SUCCEEDS & Persists fields
  -- ------------------------------------------------------------
  v_res := complete_audit_and_issue_subscription_credit_v5(v_audit_valid, v_tenant_a, v_staff_user);
  
  SELECT status, completed_by, audit_completed_at, delivered_at
  INTO v_status, v_completed_by, v_audit_completed_at, v_delivered_at
  FROM audit_orders WHERE id = v_audit_valid;

  SELECT count(*) INTO v_event_count FROM platform_admin_events
  WHERE actor_user_id = v_staff_user AND action = 'complete_audit';

  IF (v_res->>'success')::boolean IS NOT TRUE
     OR v_status <> 'completed'
     OR v_completed_by <> v_staff_user
     OR v_audit_completed_at IS NULL
     OR v_delivered_at IS NULL
     OR v_event_count <> 1 THEN
    RAISE EXCEPTION 'Test 5 Failed: Valid staff completion failed or fields missing. Res=%, status=%, completed_by=%, event_count=%', v_res, v_status, v_completed_by, v_event_count;
  END IF;

  -- ------------------------------------------------------------
  -- Test 6: Second completion attempt -> REJECTED & Fields Unchanged
  -- ------------------------------------------------------------
  v_res := complete_audit_and_issue_subscription_credit_v5(v_audit_valid, v_tenant_a, v_staff_user);
  
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'audit_already_completed' THEN
    RAISE EXCEPTION 'Test 6 Failed: Duplicate audit completion not rejected. Res=%', v_res;
  END IF;

  SELECT completed_by, audit_completed_at INTO v_completed_by, v_audit_completed_at
  FROM audit_orders WHERE id = v_audit_valid;
  IF v_completed_by <> v_staff_user OR v_audit_completed_at IS NULL THEN
    RAISE EXCEPTION 'Test 6 Failed: Audit completion fields mutated during rejected retry';
  END IF;

  -- ------------------------------------------------------------
  -- Test 7: First-staff bootstrap cannot be run unauthenticated when staff exists
  -- ------------------------------------------------------------
  v_res := bootstrap_first_platform_staff(v_non_staff_user /* target */, NULL /* actor */, 'platform_admin');
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'platform_staff_already_exists' THEN
    RAISE EXCEPTION 'Test 7 Failed: Bootstrap allowed without actor when staff exists. Res=%', v_res;
  END IF;

  -- Cleanup test data
  DELETE FROM platform_admin_events WHERE actor_user_id = v_staff_user OR target_user_id IN (v_staff_user, v_non_staff_user, v_inactive_staff_user);
  DELETE FROM audit_orders WHERE tenant_id IN (v_tenant_a, v_tenant_b);
  DELETE FROM platform_staff_users WHERE user_id IN (v_staff_user, v_non_staff_user, v_inactive_staff_user);
  DELETE FROM tenants WHERE id IN (v_tenant_a, v_tenant_b);
  DELETE FROM auth.users WHERE id IN (v_staff_user, v_non_staff_user, v_inactive_staff_user);

  RAISE NOTICE 'ALL PLATFORM STAFF & AUDIT COMPLETION ASSERTIONS PASSED CLEANLY!';
END;
$$;
