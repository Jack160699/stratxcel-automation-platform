\set ON_ERROR_STOP on

-- Existing behavioral suites collectively cover all payment-v4 product paths.
\ir test_atomicity.sql
\ir test_subscription_payment_state_validation.sql
\ir test_audit_credit_price_validation.sql
\ir test_audit_credit_eligibility_and_tenant_mismatch.sql
\ir test_audit_fee_payment_state_validation.sql
\ir test_continuation_pack_payment_state_validation.sql
\ir test_domain_purchase_payment_state_validation.sql
\ir test_domain_renewal_payment_state_validation.sql

DO $$
DECLARE
  v_def text := pg_get_functiondef(
    'public.reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamptz)'::regprocedure
  );
BEGIN
  IF v_def !~ 'provider_link_id = p_provider_link_id' OR v_def !~ 'reference_id = p_reference_id' THEN
    RAISE EXCEPTION 'payment-v4 provider-link/reference lookup safety is missing';
  END IF;
  IF v_def !~ 'p_actual_amount_cents <> v_link.amount_cents' OR v_def !~ 'upper\(p_actual_currency\) <> upper\(v_link.currency\)' THEN
    RAISE EXCEPTION 'payment-v4 exact amount/currency equality is missing';
  END IF;
  IF v_def !~* 'v_limits_launch int\[\] := ARRAY\[12, 1, 500, 0\]' OR
     v_def !~* 'v_limits_growth int\[\] := ARRAY\[30, 2, 2500, 1\]' OR
     v_def !~* 'v_limits_custom int\[\] := ARRAY\[60, 4, 10000, 1\]' THEN
    RAISE EXCEPTION 'payment-v4 exact entitlement limits are missing';
  END IF;
  IF v_def !~ 'credit_eligible_from <= now\(\)' OR v_def !~ 'credit_expires_at > now\(\)' OR v_def !~ 'credit_consumed_at is null' THEN
    RAISE EXCEPTION 'payment-v4 audit-credit time/consumption guards are missing';
  END IF;
  IF v_def !~ '''paid_pending_renewal''' OR v_def ~ 'expires_at = coalesce\(expires_at' THEN
    RAISE EXCEPTION 'payment-v4 domain-renewal registrar-confirmation boundary is missing';
  END IF;
  IF v_def !~ 'v_link.mode' OR v_def ~ '''live'',\s*''payment_link''' THEN
    RAISE EXCEPTION 'payment-v4 order mode is hardcoded or not copied from the link';
  END IF;
  IF v_def ~ 'balance_after_cents' OR v_def ~ '\mdescription\M' THEN
    RAISE EXCEPTION 'payment-v4 still references non-existent wallet ledger columns';
  END IF;
  IF v_def !~ 'tenant_id, entry_type, amount_cents, reference_type, reference_id, metadata' THEN
    RAISE EXCEPTION 'payment-v4 wallet fulfilment does not use the real ledger schema';
  END IF;
END;
$$;
