-- POST-RESET INVENTORY: Verify all customer data is gone, platform intact
SELECT
  (SELECT COUNT(*) FROM public.tenants WHERE slug != 'stratxcel') AS disposable_tenants,
  (SELECT COUNT(*) FROM public.tenants) AS total_tenants,
  (SELECT COUNT(*) FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE t.slug != 'stratxcel') AS customer_memberships,
  (SELECT COUNT(*) FROM public.brand_brains) AS brand_brains,
  (SELECT COUNT(*) FROM public.brand_brain_versions) AS brand_brain_versions,
  (SELECT COUNT(*) FROM public.audit_orders) AS audit_orders,
  (SELECT COUNT(*) FROM public.audit_generation_runs) AS audit_generation_runs,
  (SELECT COUNT(*) FROM public.audit_discovery_snapshots) AS audit_discovery_snapshots,
  (SELECT COUNT(*) FROM public.audit_delivery_events) AS audit_delivery_events,
  (SELECT COUNT(*) FROM public.audit_share_tokens) AS audit_share_tokens,
  (SELECT COUNT(*) FROM public.audit_free_eligibility_events) AS audit_free_eligibility_events,
  (SELECT COUNT(*) FROM public.promo_redemptions) AS promo_redemptions,
  (SELECT COUNT(*) FROM public.tenant_current_audits) AS tenant_current_audits,
  (SELECT COUNT(*) FROM public.social_accounts) AS social_accounts,
  (SELECT COUNT(*) FROM public.whatsapp_phone_bindings WHERE source != 'platform_shared_sender') AS customer_whatsapp_bindings,
  (SELECT COUNT(*) FROM public.whatsapp_phone_bindings WHERE source = 'platform_shared_sender') AS platform_whatsapp_sender,
  (SELECT COUNT(*) FROM public.wallet_accounts) AS wallet_accounts,
  (SELECT COUNT(*) FROM public.subscriptions) AS subscriptions,
  (SELECT COUNT(*) FROM public.crm_leads) AS crm_leads;
