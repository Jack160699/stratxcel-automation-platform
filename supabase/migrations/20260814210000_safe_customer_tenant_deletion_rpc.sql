-- ==============================================================================
-- Migration: 20260814210000_safe_customer_tenant_deletion_rpc.sql
-- Description: Creates an atomic, fail-closed stored procedure for customer tenant deletion.
-- ==============================================================================

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
  v_deleted_count INTEGER := 0;
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

  -- 4. Delete dependent customer data in strict foreign-key order
  -- A. Audit Engine Tables
  DELETE FROM public.audit_delivery_events WHERE audit_order_id IN (SELECT id FROM public.audit_orders WHERE tenant_id = p_tenant_id);
  DELETE FROM public.audit_discovery_snapshots WHERE audit_order_id IN (SELECT id FROM public.audit_orders WHERE tenant_id = p_tenant_id);
  DELETE FROM public.audit_generation_runs WHERE audit_order_id IN (SELECT id FROM public.audit_orders WHERE tenant_id = p_tenant_id);
  DELETE FROM public.audit_share_tokens WHERE audit_order_id IN (SELECT id FROM public.audit_orders WHERE tenant_id = p_tenant_id);
  DELETE FROM public.audit_reset_snapshots WHERE tenant_id = p_tenant_id;
  DELETE FROM public.audit_whatsapp_destinations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.audit_orders WHERE tenant_id = p_tenant_id;

  -- B. Brand Brain Tables
  DELETE FROM public.brand_brain_versions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.brand_brains WHERE tenant_id = p_tenant_id;

  -- C. Social & Content Tables
  DELETE FROM public.social_tokens WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_accounts WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_posts WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_campaigns WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_agent_actions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_agent_run_events WHERE tenant_id = p_tenant_id;
  DELETE FROM public.social_agent_runs WHERE tenant_id = p_tenant_id;

  -- D. Missions & Hermes Tables
  DELETE FROM public.mission_events WHERE tenant_id = p_tenant_id;
  DELETE FROM public.mission_artifacts WHERE tenant_id = p_tenant_id;
  DELETE FROM public.mission_approvals WHERE tenant_id = p_tenant_id;
  DELETE FROM public.missions WHERE tenant_id = p_tenant_id;

  -- E. CRM & WhatsApp Customer Messaging Tables
  DELETE FROM public.crm_messages WHERE tenant_id = p_tenant_id;
  DELETE FROM public.crm_conversations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.crm_appointments WHERE tenant_id = p_tenant_id;
  DELETE FROM public.crm_leads WHERE tenant_id = p_tenant_id;
  DELETE FROM public.contact_consent WHERE tenant_id = p_tenant_id;
  DELETE FROM public.whatsapp_phone_bindings WHERE tenant_id = p_tenant_id AND source != 'platform_shared_sender';

  -- F. Subscriptions & Wallets
  DELETE FROM public.subscriptions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.wallet_transactions WHERE tenant_id = p_tenant_id;
  DELETE FROM public.wallet_accounts WHERE tenant_id = p_tenant_id;

  -- G. Websites, Domains, Storage & BYOK
  DELETE FROM public.websites WHERE tenant_id = p_tenant_id;
  DELETE FROM public.custom_domains WHERE tenant_id = p_tenant_id;
  DELETE FROM public.storage_drive_connections WHERE tenant_id = p_tenant_id;
  DELETE FROM public.byok_tenant_credentials WHERE tenant_id = p_tenant_id;

  -- H. Workforce & Media
  DELETE FROM public.workforce_tasks WHERE tenant_id = p_tenant_id;
  DELETE FROM public.workforce_agents WHERE tenant_id = p_tenant_id;
  DELETE FROM public.image_generation_jobs WHERE tenant_id = p_tenant_id;

  -- I. Memberships & Invitations
  DELETE FROM public.tenant_invitations WHERE tenant_id = p_tenant_id;
  DELETE FROM public.tenant_memberships WHERE tenant_id = p_tenant_id;

  -- J. Tenant Record Itself
  DELETE FROM public.tenants WHERE id = p_tenant_id;

  -- 5. Record auditable event
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

GRANT EXECUTE ON FUNCTION public.delete_customer_tenant_v1(UUID, TEXT) TO service_role;
