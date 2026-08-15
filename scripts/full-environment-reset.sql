-- FULL PRODUCTION RESET: Delete all remaining disposable customer tenants
-- Protected: stratxcel, platform, staff-workspace, system, platform_shared_sender

DO $$
DECLARE
  v_tenant RECORD;
  v_result JSONB;
BEGIN
  FOR v_tenant IN
    SELECT t.id, t.slug, t.name
    FROM public.tenants t
    WHERE t.slug NOT IN ('stratxcel', 'platform', 'staff-workspace', 'system')
      AND NOT EXISTS (
        SELECT 1 FROM public.whatsapp_phone_bindings wpb
        WHERE wpb.tenant_id = t.id AND wpb.source = 'platform_shared_sender'
      )
    ORDER BY t.created_at
  LOOP
    RAISE NOTICE 'Deleting tenant: % (%)', v_tenant.name, v_tenant.slug;
    v_result := public.delete_customer_tenant_v1(v_tenant.id, 'platform_reset');
    RAISE NOTICE 'Result: %', v_result;
  END LOOP;
  RAISE NOTICE 'Full environment reset complete.';
END;
$$;

-- Verify remaining tenants
SELECT id, slug, name FROM public.tenants ORDER BY slug;
