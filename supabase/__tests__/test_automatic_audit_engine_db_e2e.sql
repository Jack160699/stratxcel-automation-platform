-- Automatic Audit Engine V1 — local NON-PROD DB E2E fixture.
-- Safe for disposable local Postgres only. Never run against production.
--
-- Covers:
--   paid → Brand Brain → enqueue → worker-stage fixture → research/report
--   → quality PASS → complete_automatic_audit_generation_v1 → customer retrieval
--   duplicate completion = one credit (timestamps unchanged, one admin event)
--   quality failure path → NEEDS_REVIEW (no completion)
--   cancelled / refunded stops
--   cross-tenant rejected

DO $$
DECLARE
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_user_a uuid;
  v_link_a uuid;
  v_order_pass uuid;
  v_order_review uuid;
  v_order_cancel uuid;
  v_order_refund uuid;
  v_run_pass uuid;
  v_run_review uuid;
  v_job_id uuid;
  v_res jsonb;
  v_res2 jsonb;
  v_credit_from timestamptz;
  v_credit_exp timestamptz;
  v_event_count int;
  v_status text;
  v_run_status text;
  v_report jsonb;
  v_research jsonb;
  v_evidence jsonb;
  v_receipts jsonb;
BEGIN
  -- ----------------------------------------------------------
  -- Setup tenants / user / Brand Brain / paid payment
  -- ----------------------------------------------------------
  INSERT INTO auth.users (id, instance_id, email, aud, role)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'audit-e2e-' || gen_random_uuid()::text || '@example.test',
          'authenticated', 'authenticated')
  RETURNING id INTO v_user_a;

  INSERT INTO tenants (name, slug)
  VALUES ('Audit E2E Tenant A', 'audit-e2e-a-' || gen_random_uuid()::text)
  RETURNING id INTO v_tenant_a;

  INSERT INTO tenants (name, slug)
  VALUES ('Audit E2E Tenant B', 'audit-e2e-b-' || gen_random_uuid()::text)
  RETURNING id INTO v_tenant_b;

  INSERT INTO tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_a, v_user_a, 'owner');

  INSERT INTO brand_brain_versions (tenant_id, version, content)
  VALUES (
    v_tenant_a,
    1,
    jsonb_build_object(
      'business_name', 'Example Business',
      'industry', 'Professional services',
      'finalized', true
    )
  );
  INSERT INTO brand_brains (tenant_id, current_version)
  VALUES (v_tenant_a, 1);

  INSERT INTO payment_links (
    tenant_id, reference_id, amount_cents, currency, status, payment_purpose, mode
  )
  VALUES (
    v_tenant_a,
    'pl_audit_e2e_' || gen_random_uuid()::text,
    99900,
    'INR',
    'paid',
    'audit_fee',
    'test'
  )
  RETURNING id INTO v_link_a;

  INSERT INTO audit_orders (
    tenant_id, user_id, business_name, industry, website_url,
    status, audit_fee_cents, payment_link_id
  )
  VALUES (
    v_tenant_a, v_user_a, 'Example Business', 'Professional services',
    'https://example.com', 'paid', 99900, v_link_a
  )
  RETURNING id INTO v_order_pass;

  -- Shared rich-report / research fixtures (deterministic, no live providers)
  v_research := jsonb_build_object(
    'status', 'PASS',
    'summary', 'Grounded evidence shows a credible offer with discoverability gaps.',
    'sources', jsonb_build_array(
      jsonb_build_object('id', 'source_1', 'url', 'https://example.com/about', 'title', 'Official site'),
      jsonb_build_object('id', 'source_2', 'url', 'https://industry.example.org/market', 'title', 'Industry ref'),
      jsonb_build_object('id', 'source_3', 'url', 'https://directory.example.net/biz', 'title', 'Directory')
    )
  );
  v_evidence := jsonb_build_array(
    'audit_artifact:source_1',
    'audit_artifact:source_2',
    'audit_artifact:source_3'
  );
  v_receipts := jsonb_build_array(
    jsonb_build_object(
      'step', 'research',
      'provider', 'google',
      'model', 'fixture-grounded-model',
      'estimatedCostUsd', 0.12
    ),
    jsonb_build_object(
      'step', 'report_generation',
      'provider', 'google',
      'model', 'fixture-report-model',
      'estimatedCostUsd', 0.18
    )
  );
  v_report := jsonb_build_object(
    'reportVersion', 'automatic_audit_v1',
    'businessName', 'Example Business',
    'executiveSummary',
      'Example Business has a credible core offer and visible customer demand, but its public journey does not yet translate that trust into a consistent acquisition and conversion system.',
    'priorityRisks', jsonb_build_array(
      jsonb_build_object('id', 'risk_1', 'title', 'Weak conversion path', 'severity', 'high')
    ),
    'actionPlan', jsonb_build_array(
      jsonb_build_object('id', 'action_1', 'title', 'Clarify priority offer', 'horizon', '30d')
    ),
    'findings', jsonb_build_array(
      jsonb_build_object(
        'id', 'finding_1',
        'title', 'Discoverability gap',
        'evidenceSourceIds', jsonb_build_array('source_1', 'source_2')
      )
    ),
    'opportunities', jsonb_build_array(
      jsonb_build_object(
        'id', 'opp_1',
        'title', 'Strengthen high-intent pages',
        'evidenceSourceIds', jsonb_build_array('source_3')
      )
    ),
    'categoryScores', jsonb_build_object(
      'brandPositioning', jsonb_build_object(
        'score', 78,
        'evidenceSourceIds', jsonb_build_array('source_1')
      )
    )
  );

  -- ----------------------------------------------------------
  -- 1) Happy path: enqueue
  -- ----------------------------------------------------------
  v_res := public.start_automatic_audit_generation_v1(v_order_pass, v_tenant_a, 1, 1.5);
  IF (v_res->>'success')::boolean IS NOT TRUE OR v_res->>'run_id' IS NULL OR v_res->>'queue_job_id' IS NULL THEN
    RAISE EXCEPTION 'E2E enqueue failed: %', v_res;
  END IF;
  v_run_pass := (v_res->>'run_id')::uuid;
  v_job_id := (v_res->>'queue_job_id')::uuid;

  SELECT status INTO v_status FROM audit_orders WHERE id = v_order_pass;
  IF v_status <> 'in_review' THEN
    RAISE EXCEPTION 'E2E expected in_review after enqueue, got %', v_status;
  END IF;

  -- Re-enqueue is durable/idempotent (same order+brain version)
  v_res2 := public.start_automatic_audit_generation_v1(v_order_pass, v_tenant_a, 1, 1.5);
  IF (v_res2->>'success')::boolean IS NOT TRUE OR (v_res2->>'run_id')::uuid <> v_run_pass THEN
    RAISE EXCEPTION 'E2E re-enqueue should reuse run: %', v_res2;
  END IF;

  -- ----------------------------------------------------------
  -- 2) Worker fixture stages (simulate Mission Worker updates)
  -- ----------------------------------------------------------
  UPDATE audit_generation_runs
  SET status = 'RUNNING',
      stage = 'RESEARCH',
      attempt_count = 1,
      started_at = coalesce(started_at, now()),
      heartbeat_at = now(),
      stage_updated_at = now(),
      updated_at = now()
  WHERE id = v_run_pass;

  UPDATE audit_generation_runs
  SET stage = 'ANALYSIS',
      research_data = v_research,
      evidence_artifact_refs = v_evidence,
      ai_receipts = v_receipts,
      estimated_cost_usd = 0.12,
      stage_updated_at = now(),
      updated_at = now()
  WHERE id = v_run_pass;

  UPDATE audit_generation_runs
  SET stage = 'QUALITY_GATE',
      report_data = v_report,
      estimated_cost_usd = 0.30,
      quality_outcome = 'PASS',
      quality_score = 0.9100,
      confidence_band = 'HIGH',
      stage_updated_at = now(),
      updated_at = now()
  WHERE id = v_run_pass;

  UPDATE audit_generation_runs
  SET stage = 'DELIVERY',
      stage_updated_at = now(),
      updated_at = now()
  WHERE id = v_run_pass;

  UPDATE queue_jobs
  SET status = 'SUCCEEDED',
      completed_at = now(),
      updated_at = now()
  WHERE id = v_job_id;

  -- ----------------------------------------------------------
  -- 3) Automated completion + customer retrieval
  -- ----------------------------------------------------------
  v_res := public.complete_automatic_audit_generation_v1(
    v_run_pass,
    v_tenant_a,
    v_order_pass,
    v_report,
    v_research,
    v_evidence,
    v_receipts,
    0.9100
  );
  IF (v_res->>'success')::boolean IS NOT TRUE
     OR coalesce((v_res->>'already_completed')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'E2E first completion failed: %', v_res;
  END IF;

  SELECT status, credit_eligible_from, credit_expires_at, report_data
  INTO v_status, v_credit_from, v_credit_exp, v_report
  FROM audit_orders WHERE id = v_order_pass;

  SELECT status INTO v_run_status FROM audit_generation_runs WHERE id = v_run_pass;

  IF v_status <> 'completed'
     OR v_run_status <> 'COMPLETED'
     OR v_credit_from IS NULL
     OR v_credit_exp IS NULL
     OR v_report IS NULL
     OR length(trim(coalesce(v_report->>'executiveSummary', ''))) = 0 THEN
    RAISE EXCEPTION 'E2E customer retrieval / completion state invalid: status=%, run=%, credit_from=%, report_null=%',
      v_status, v_run_status, v_credit_from, (v_report IS NULL);
  END IF;

  SELECT count(*) INTO v_event_count
  FROM platform_admin_events
  WHERE action = 'complete_automated_audit'
    AND metadata->>'audit_order_id' = v_order_pass::text;
  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'E2E expected exactly one complete_automated_audit event, got %', v_event_count;
  END IF;

  -- ----------------------------------------------------------
  -- 4) Exactly-once credit: duplicate completion
  -- ----------------------------------------------------------
  v_res2 := public.complete_automatic_audit_generation_v1(
    v_run_pass,
    v_tenant_a,
    v_order_pass,
    v_report,
    v_research,
    v_evidence,
    v_receipts,
    0.9100
  );
  IF (v_res2->>'success')::boolean IS NOT TRUE
     OR (v_res2->>'already_completed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'E2E duplicate completion should be already_completed: %', v_res2;
  END IF;

  IF (SELECT credit_eligible_from FROM audit_orders WHERE id = v_order_pass) IS DISTINCT FROM v_credit_from
     OR (SELECT credit_expires_at FROM audit_orders WHERE id = v_order_pass) IS DISTINCT FROM v_credit_exp THEN
    RAISE EXCEPTION 'E2E credit timestamps mutated on duplicate completion';
  END IF;

  SELECT count(*) INTO v_event_count
  FROM platform_admin_events
  WHERE action = 'complete_automated_audit'
    AND metadata->>'audit_order_id' = v_order_pass::text;
  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'E2E duplicate completion created extra admin events: %', v_event_count;
  END IF;

  -- ----------------------------------------------------------
  -- 5) Quality failure → NEEDS_REVIEW (no automatic completion)
  -- ----------------------------------------------------------
  INSERT INTO audit_orders (
    tenant_id, user_id, business_name, status, audit_fee_cents, payment_link_id
  )
  VALUES (v_tenant_a, v_user_a, 'Review Business', 'paid', 99900, v_link_a)
  RETURNING id INTO v_order_review;

  v_res := public.start_automatic_audit_generation_v1(v_order_review, v_tenant_a, 1, 1.5);
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'E2E review-path enqueue failed: %', v_res;
  END IF;
  v_run_review := (v_res->>'run_id')::uuid;

  UPDATE audit_generation_runs
  SET status = 'NEEDS_REVIEW',
      stage = 'REVIEW',
      quality_outcome = 'LOW_CONFIDENCE',
      quality_score = 0.4200,
      confidence_band = 'LOW',
      failure_code = 'LOW_CONFIDENCE',
      failure_message_safe = 'Report quality below automatic delivery threshold',
      review_required_at = now(),
      stage_updated_at = now(),
      updated_at = now()
  WHERE id = v_run_review;

  v_res := public.complete_automatic_audit_generation_v1(
    v_run_review,
    v_tenant_a,
    v_order_review,
    v_report,
    v_research,
    v_evidence,
    v_receipts,
    0.4200
  );
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'quality_pass_required' THEN
    RAISE EXCEPTION 'E2E quality failure must reject completion: %', v_res;
  END IF;
  IF (SELECT status FROM audit_orders WHERE id = v_order_review) <> 'in_review' THEN
    RAISE EXCEPTION 'E2E quality failure must leave order in_review';
  END IF;
  IF (SELECT status FROM audit_generation_runs WHERE id = v_run_review) <> 'NEEDS_REVIEW' THEN
    RAISE EXCEPTION 'E2E quality failure must keep run NEEDS_REVIEW';
  END IF;

  -- ----------------------------------------------------------
  -- 6) Cancelled / refunded stops enqueue + completion
  -- ----------------------------------------------------------
  INSERT INTO audit_orders (
    tenant_id, user_id, business_name, status, audit_fee_cents, payment_link_id
  )
  VALUES (v_tenant_a, v_user_a, 'Cancelled Business', 'cancelled', 99900, v_link_a)
  RETURNING id INTO v_order_cancel;

  v_res := public.start_automatic_audit_generation_v1(v_order_cancel, v_tenant_a, 1, 1.5);
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'audit_cancelled_or_refunded' THEN
    RAISE EXCEPTION 'E2E cancelled enqueue not rejected: %', v_res;
  END IF;

  INSERT INTO audit_orders (
    tenant_id, user_id, business_name, status, audit_fee_cents, payment_link_id
  )
  VALUES (v_tenant_a, v_user_a, 'Refunded Business', 'paid', 99900, v_link_a)
  RETURNING id INTO v_order_refund;

  v_res := public.start_automatic_audit_generation_v1(v_order_refund, v_tenant_a, 1, 1.5);
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'E2E refund-path enqueue failed before refund: %', v_res;
  END IF;
  UPDATE audit_orders SET status = 'refunded', updated_at = now() WHERE id = v_order_refund;
  v_res := public.complete_automatic_audit_generation_v1(
    (v_res->>'run_id')::uuid,
    v_tenant_a,
    v_order_refund,
    v_report,
    v_research,
    v_evidence,
    v_receipts,
    0.9100
  );
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'audit_cancelled_or_refunded' THEN
    RAISE EXCEPTION 'E2E refunded completion not rejected: %', v_res;
  END IF;

  -- ----------------------------------------------------------
  -- 7) Cross-tenant rejected
  -- ----------------------------------------------------------
  v_res := public.start_automatic_audit_generation_v1(v_order_pass, v_tenant_b, 1, 1.5);
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' NOT IN ('tenant_mismatch', 'already_completed') THEN
    -- completed order with wrong tenant: start returns tenant_mismatch before completed branch
    -- (order is locked then tenant checked). Accept tenant_mismatch.
    IF v_res->>'reason' <> 'tenant_mismatch' THEN
      RAISE EXCEPTION 'E2E cross-tenant start not rejected: %', v_res;
    END IF;
  END IF;

  -- Fresh paid order for explicit cross-tenant start rejection
  INSERT INTO audit_orders (
    tenant_id, user_id, business_name, status, audit_fee_cents, payment_link_id
  )
  VALUES (v_tenant_a, v_user_a, 'Cross Tenant Business', 'paid', 99900, v_link_a)
  RETURNING id INTO v_order_pass;

  v_res := public.start_automatic_audit_generation_v1(v_order_pass, v_tenant_b, 1, 1.5);
  IF (v_res->>'success')::boolean IS NOT FALSE OR v_res->>'reason' <> 'tenant_mismatch' THEN
    RAISE EXCEPTION 'E2E cross-tenant start must be tenant_mismatch: %', v_res;
  END IF;

  v_res := public.start_automatic_audit_generation_v1(v_order_pass, v_tenant_a, 1, 1.5);
  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'E2E cross-tenant setup enqueue failed: %', v_res;
  END IF;
  UPDATE audit_generation_runs
  SET quality_outcome = 'PASS', quality_score = 0.9100, stage = 'DELIVERY', status = 'RUNNING'
  WHERE id = (v_res->>'run_id')::uuid;

  v_res2 := public.complete_automatic_audit_generation_v1(
    (v_res->>'run_id')::uuid,
    v_tenant_b,
    v_order_pass,
    v_report,
    v_research,
    v_evidence,
    v_receipts,
    0.9100
  );
  IF (v_res2->>'success')::boolean IS NOT FALSE OR v_res2->>'reason' <> 'tenant_mismatch' THEN
    RAISE EXCEPTION 'E2E cross-tenant completion must be tenant_mismatch: %', v_res2;
  END IF;

  RAISE NOTICE 'automatic_audit_engine_db_e2e: PASS';
END $$;

SELECT 'automatic_audit_engine_db_e2e_PASS' AS status;
