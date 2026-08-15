-- DRY RUN: What would be deleted for each disposable customer tenant
-- Lists all rows that would need deletion, without touching data

WITH customer_tenants AS (
  SELECT t.id, t.slug, t.name
  FROM public.tenants t
  WHERE t.slug NOT IN ('stratxcel', 'platform', 'staff-workspace', 'system')
    AND NOT EXISTS (
      SELECT 1 FROM public.whatsapp_phone_bindings wpb
      WHERE wpb.tenant_id = t.id AND wpb.source = 'platform_shared_sender'
    )
),
order_ids AS (
  SELECT ao.id, ao.tenant_id
  FROM public.audit_orders ao
  WHERE ao.tenant_id IN (SELECT id FROM customer_tenants)
)
SELECT
  ct.slug,
  ct.name,
  'CUSTOMER_DELETE_ALLOWED' AS classification,
  -- tenant_current_audits rows
  (SELECT COUNT(*) FROM public.tenant_current_audits tca WHERE tca.tenant_id = ct.id) AS tenant_current_audits_rows,
  -- audit_free_eligibility_events rows
  (SELECT COUNT(*) FROM public.audit_free_eligibility_events afee WHERE afee.tenant_id = ct.id) AS free_eligibility_rows,
  -- audit_orders rows
  (SELECT COUNT(*) FROM public.audit_orders ao WHERE ao.tenant_id = ct.id) AS audit_order_rows,
  -- promo_redemptions rows
  (SELECT COUNT(*) FROM public.promo_redemptions pr WHERE pr.tenant_id = ct.id
     OR pr.audit_order_id IN (SELECT id FROM order_ids WHERE tenant_id = ct.id)) AS promo_redemption_rows,
  -- audit_generation_runs rows
  (SELECT COUNT(*) FROM public.audit_generation_runs agr
     WHERE agr.audit_order_id IN (SELECT id FROM order_ids WHERE tenant_id = ct.id)
        OR agr.tenant_id = ct.id) AS generation_run_rows,
  -- audit_delivery_events rows
  (SELECT COUNT(*) FROM public.audit_delivery_events ade WHERE ade.tenant_id = ct.id) AS delivery_event_rows,
  -- audit_discovery_snapshots rows
  (SELECT COUNT(*) FROM public.audit_discovery_snapshots ads WHERE ads.tenant_id = ct.id) AS discovery_snapshot_rows,
  -- audit_share_tokens rows
  (SELECT COUNT(*) FROM public.audit_share_tokens ast WHERE ast.tenant_id = ct.id) AS share_token_rows,
  -- brand_brains rows
  (SELECT COUNT(*) FROM public.brand_brains bb WHERE bb.tenant_id = ct.id) AS brand_brain_rows,
  -- crm_leads rows
  (SELECT COUNT(*) FROM public.crm_leads cl WHERE cl.tenant_id = ct.id) AS crm_lead_rows
FROM customer_tenants ct
ORDER BY ct.slug;
