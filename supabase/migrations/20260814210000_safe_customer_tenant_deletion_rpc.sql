-- ==============================================================================
-- Migration: 20260814210000_safe_customer_tenant_deletion_rpc.sql
-- Description: Creates an atomic, fail-closed stored procedure for customer tenant deletion.
-- ==============================================================================

-- 1. Update promo_redemptions_immutable trigger function to respect transaction-level bypass and service_role deletion
CREATE OR REPLACE FUNCTION public.promo_redemptions_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('stratxcel.allow_tenant_deletion', true) = 'on'
     OR (auth.role() = 'service_role' AND TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'promo_redemptions are immutable';
END;
$$;

-- 2. Update prevent_completed_audit_rewrite trigger function to respect transaction-level bypass and service_role deletion
CREATE OR REPLACE FUNCTION public.prevent_completed_audit_rewrite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('stratxcel.allow_tenant_deletion', true) = 'on'
     OR (auth.role() = 'service_role' AND (NEW.promo_redemption_id IS NULL AND OLD.promo_redemption_id IS NOT NULL)) THEN
    RETURN NEW;
  END IF;

  IF OLD.audit_completed_at IS NOT NULL AND (
    NEW.completed_by IS DISTINCT FROM OLD.completed_by OR
    NEW.audit_completed_at IS DISTINCT FROM OLD.audit_completed_at OR
    NEW.delivered_at IS DISTINCT FROM OLD.delivered_at OR
    NEW.audit_fee_cents IS DISTINCT FROM OLD.audit_fee_cents OR
    NEW.credit_eligible_from IS DISTINCT FROM OLD.credit_eligible_from OR
    NEW.credit_expires_at IS DISTINCT FROM OLD.credit_expires_at OR
    NEW.fulfilment_source IS DISTINCT FROM OLD.fulfilment_source OR
    NEW.promo_redemption_id IS DISTINCT FROM OLD.promo_redemption_id OR
    NEW.actual_paid_cents IS DISTINCT FROM OLD.actual_paid_cents OR
    NEW.list_price_cents IS DISTINCT FROM OLD.list_price_cents OR
    NEW.discount_cents IS DISTINCT FROM OLD.discount_cents
  ) THEN
    RAISE EXCEPTION 'completed audit fields are immutable';
  END IF;

  -- Once commercial provenance is set, do not silently overwrite it.
  IF OLD.fulfilment_source IS NOT NULL
     AND NEW.fulfilment_source IS DISTINCT FROM OLD.fulfilment_source THEN
    RAISE EXCEPTION 'audit fulfilment_source is immutable once set';
  END IF;
  IF OLD.promo_redemption_id IS NOT NULL
     AND NEW.promo_redemption_id IS DISTINCT FROM OLD.promo_redemption_id THEN
    RAISE EXCEPTION 'audit promo_redemption_id is immutable once set';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Ensure service_role can delete promo_redemptions when clearing disposable customer tenants
GRANT SELECT, INSERT, DELETE ON public.promo_redemptions TO service_role;

-- 4. Create the canonical customer tenant deletion function
CREATE OR REPLACE FUNCTION public.delete_customer_tenant_v1(
  p_tenant_id UUID,
  p_actor TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant RECORD;
  v_is_platform_sender BOOLEAN := FALSE;
  v_order_ids UUID[];
BEGIN
  -- 1. Check tenant existence
  SELECT id, slug, name INTO v_tenant
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Tenant with ID % does not exist', p_tenant_id;
  END IF;

  -- 2. Validate system/platform slug protection
  IF LOWER(v_tenant.slug) IN ('stratxcel', 'platform', 'staff-workspace', 'system') THEN
    RAISE EXCEPTION 'PROTECTED_TENANT: System workspace % (%) cannot be deleted', v_tenant.name, v_tenant.slug;
  END IF;

  -- 3. Validate platform shared sender protection
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_phone_bindings
    WHERE tenant_id = p_tenant_id
      AND source = 'platform_shared_sender'
  ) INTO v_is_platform_sender;

  IF v_is_platform_sender THEN
    RAISE EXCEPTION 'PROTECTED_TENANT_WHATSAPP_SENDER: Tenant % is the platform shared WhatsApp sender', v_tenant.name;
  END IF;

  -- 4. Enable transaction-local bypass for immutable triggers during customer deletion
  PERFORM set_config('stratxcel.allow_tenant_deletion', 'on', true);

  -- 5. Gather dependent order IDs
  SELECT COALESCE(ARRAY_AGG(id), '{}'::UUID[]) INTO v_order_ids
  FROM public.audit_orders
  WHERE tenant_id = p_tenant_id;

  -- 6. Break mutual FK reference between audit_orders and promo_redemptions
  UPDATE public.audit_orders
  SET promo_redemption_id = NULL
  WHERE tenant_id = p_tenant_id;

  -- 7. Delete dependent customer data in strict foreign-key dependency order
  -- A. Promo Redemptions
  DELETE FROM public.promo_redemptions
  WHERE tenant_id = p_tenant_id
     OR (CARDINALITY(v_order_ids) > 0 AND audit_order_id = ANY(v_order_ids));

  -- B. Audit Engine Tables
  IF CARDINALITY(v_order_ids) > 0 THEN
    DELETE FROM public.audit_delivery_events WHERE audit_order_id = ANY(v_order_ids);
    DELETE FROM public.audit_discovery_snapshots WHERE audit_order_id = ANY(v_order_ids);
    DELETE FROM public.audit_generation_runs WHERE audit_order_id = ANY(v_order_ids);
    DELETE FROM public.audit_share_tokens WHERE audit_order_id = ANY(v_order_ids);
  END IF;

  DELETE FROM public.audit_reset_snapshots WHERE tenant_id = p_tenant_id;
  DELETE FROM public.audit_discovery_snapshots WHERE tenant_id = p_tenant_id;
  DELETE FROM public.audit_whatsapp_destinations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.audit_orders WHERE tenant_id = p_tenant_id;

  -- C. Brand Brain Tables
  DELETE FROM public.brand_brain_versions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_brains WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_assets WHERE tenant_id = p_tenant_id;

  -- D. Image Generation & Media Tables
  DELETE FROM public.image_generation_references WHERE tenant_id = p_tenant_id;
  DELETE FROM public.image_generation_candidates WHERE tenant_id = p_tenant_id;
  DELETE FROM public.image_generation_jobs WHERE tenant_id = p_tenant_id;

  -- E. Social & Content Tables
  DELETE FROM public.social_autopilot_queue_items WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_autopilot_authorizations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_tokens WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_posts WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_campaigns WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_agent_actions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_agent_run_events WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_agent_runs WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_media_assets WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_brand_profiles WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_accounts WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_whatsapp_sessions WHERE tenant_id = p_tenant_id;

  -- F. Missions & Workforce Tables
  DELETE FROM public.workforce_reviews WHERE tenant_id = p_tenant_id;
  DELETE FROM public.workforce_stages WHERE tenant_id = p_tenant_id;
  DELETE FROM public.workforce_plans WHERE tenant_id = p_tenant_id;
  DELETE FROM public.workforce_tasks WHERE tenant_id = p_tenant_id;
  DELETE FROM public.workforce_agents WHERE tenant_id = p_tenant_id;
  DELETE FROM public.mission_events WHERE tenant_id = p_tenant_id;
  DELETE FROM public.mission_artifacts WHERE tenant_id = p_tenant_id;
  DELETE FROM public.mission_approvals WHERE tenant_id = p_tenant_id;
  DELETE FROM public.ai_media_operations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.ai_execution_usage WHERE tenant_id = p_tenant_id;
  DELETE FROM public.ai_execution_attempts WHERE tenant_id = p_tenant_id;
  DELETE FROM public.ai_usage_ledger WHERE tenant_id = p_tenant_id;
  DELETE FROM public.missions WHERE tenant_id = p_tenant_id;

  -- G. Search & Discovery Tables
  DELETE FROM public.search_actions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.search_recommendations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.search_opportunities WHERE tenant_id = p_tenant_id;
  DELETE FROM public.search_analysis_runs WHERE tenant_id = p_tenant_id;
  DELETE FROM public.search_projects WHERE tenant_id = p_tenant_id;
  DELETE FROM public.search_measurement_snapshots WHERE tenant_id = p_tenant_id;
  DELETE FROM public.search_google_connections WHERE tenant_id = p_tenant_id;
  DELETE FROM public.oauth_states WHERE tenant_id = p_tenant_id;

  -- H. CRM & WhatsApp Customer Messaging Tables
  DELETE FROM public.crm_messages WHERE tenant_id = p_tenant_id;
  DELETE FROM public.crm_conversations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.crm_appointments WHERE tenant_id = p_tenant_id;
  DELETE FROM public.crm_follow_ups WHERE tenant_id = p_tenant_id;
  DELETE FROM public.crm_leads WHERE tenant_id = p_tenant_id;
  DELETE FROM public.contact_consent WHERE tenant_id = p_tenant_id;
  DELETE FROM public.whatsapp_shadow_messages WHERE tenant_id = p_tenant_id;
  DELETE FROM public.whatsapp_phone_bindings WHERE tenant_id = p_tenant_id AND source != 'platform_shared_sender';

  -- I. Subscriptions, Wallets & Payments
  DELETE FROM public.payment_refund_records WHERE tenant_id = p_tenant_id;
  DELETE FROM public.payment_refunds WHERE tenant_id = p_tenant_id;
  DELETE FROM public.payment_orders WHERE tenant_id = p_tenant_id;
  DELETE FROM public.payment_links WHERE tenant_id = p_tenant_id;
  DELETE FROM public.invoices WHERE tenant_id = p_tenant_id;
  DELETE FROM public.credit_notes WHERE tenant_id = p_tenant_id;
  DELETE FROM public.billing_profiles WHERE tenant_id = p_tenant_id;
  DELETE FROM public.subscriptions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.wallet_transactions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.wallet_accounts WHERE tenant_id = p_tenant_id;

  -- J. Websites, Domains, Storage & BYOK
  DELETE FROM public.site_projects WHERE tenant_id = p_tenant_id;
  DELETE FROM public.websites WHERE tenant_id = p_tenant_id;
  DELETE FROM public.domains WHERE tenant_id = p_tenant_id;
  DELETE FROM public.custom_domains WHERE tenant_id = p_tenant_id;
  DELETE FROM public.storage_file_references WHERE tenant_id = p_tenant_id;
  DELETE FROM public.storage_connections WHERE tenant_id = p_tenant_id;
  DELETE FROM public.storage_drive_connections WHERE tenant_id = p_tenant_id;
  DELETE FROM public.tenant_provider_connections WHERE tenant_id = p_tenant_id;
  DELETE FROM public.provider_usage_events WHERE tenant_id = p_tenant_id;
  DELETE FROM public.byok_tenant_credentials WHERE tenant_id = p_tenant_id;

  -- K. Memberships & Invitations
  DELETE FROM public.tenant_invitations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.tenant_memberships WHERE tenant_id = p_tenant_id;
  DELETE FROM public.tenant_members WHERE tenant_id = p_tenant_id;

  -- L. Tenant Record Itself
  DELETE FROM public.tenants WHERE id = p_tenant_id;

  -- 8. Record auditable platform event
  INSERT INTO public.platform_audit_events (
    tenant_id,
    event_type,
    metadata
  ) VALUES (
    p_tenant_id,
    'admin_customer_deleted',
    jsonb_build_object(
      'admin_user_id', p_actor,
      'target_tenant_id', p_tenant_id,
      'target_tenant_slug', v_tenant.slug,
      'target_tenant_name', v_tenant.name,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_tenant_id', p_tenant_id,
    'slug', v_tenant.slug,
    'name', v_tenant.name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_customer_tenant_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_customer_tenant_v1(UUID, TEXT) TO service_role;

-- 5. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
