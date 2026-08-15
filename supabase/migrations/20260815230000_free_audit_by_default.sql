-- ==============================================================================
-- Migration: 20260815230000_free_audit_by_default.sql
-- Description: Makes the Business Growth Audit 100% Free by default for all fresh customer tenants.
-- - tenant_has_fresh_audit_grant returns true for any tenant without a prior consume event
-- - claim_fresh_product_grant_audit_v1 creates order with actual_paid_cents = 0 and audit_fee_cents = 0
-- ==============================================================================

-- 1. Ensure every tenant gets 1 free audit out of the box without manual grant or promo code
CREATE OR REPLACE FUNCTION public.tenant_has_fresh_audit_grant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH latest AS (
    SELECT event_type
    FROM public.audit_free_eligibility_events
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM latest) = 0 THEN TRUE -- Fresh tenant gets free audit by default!
    ELSE (SELECT event_type IN ('grant', 'reset') FROM latest)
  END;
$$;

-- 2. Update claim_fresh_product_grant_audit_v1 to set clean zero-fee amounts
CREATE OR REPLACE FUNCTION public.claim_fresh_product_grant_audit_v1(
  p_tenant_id UUID,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member BOOLEAN;
  v_order public.audit_orders;
  v_grant_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'missing_tenant_or_actor');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
  ) INTO v_member;

  IF NOT v_member THEN
    RETURN jsonb_build_object('success', false, 'reason', 'tenant_membership_required');
  END IF;

  -- Reuse existing active free audit order if one is already in progress
  SELECT * INTO v_order
  FROM public.audit_orders
  WHERE id = (
    SELECT current_audit_order_id
    FROM public.tenant_current_audits
    WHERE tenant_id = p_tenant_id
  )
    AND status IN ('paid', 'in_review')
    AND fulfilment_source IN ('product_grant', 'promo')
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'audit_order_id', v_order.id, 'reused', true);
  END IF;

  IF NOT public.tenant_has_fresh_audit_grant(p_tenant_id) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'fresh_audit_grant_required');
  END IF;

  -- Insert clean free audit order (₹0 paid, ₹0 fee, fulfilment_source = product_grant)
  INSERT INTO public.audit_orders (
    tenant_id,
    user_id,
    business_name,
    audit_fee_cents,
    status,
    fulfilment_source,
    list_price_cents,
    discount_cents,
    actual_paid_cents,
    deep_dive_answers
  ) VALUES (
    p_tenant_id,
    p_actor_user_id,
    'Pending — completed in intake',
    0,
    'paid',
    'product_grant',
    0,
    0,
    0,
    jsonb_build_object('intakeMeta', jsonb_build_object('questionnaireVersion', 'connect_discover_v1'))
  )
  RETURNING * INTO v_order;

  INSERT INTO public.audit_free_eligibility_events (tenant_id, event_type, actor_user_id, reason, audit_order_id)
  VALUES (p_tenant_id, 'consume', p_actor_user_id, 'fresh_product_grant', v_order.id)
  RETURNING id INTO v_grant_id;

  INSERT INTO public.tenant_current_audits (tenant_id, current_audit_order_id, updated_at)
  VALUES (p_tenant_id, v_order.id, now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET previous_audit_order_id = COALESCE(public.tenant_current_audits.current_audit_order_id, public.tenant_current_audits.previous_audit_order_id),
        current_audit_order_id = v_order.id,
        archived_at = NULL,
        updated_at = now();

  RETURN jsonb_build_object('success', true, 'audit_order_id', v_order.id, 'reused', false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_fresh_product_grant_audit_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fresh_product_grant_audit_v1(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
