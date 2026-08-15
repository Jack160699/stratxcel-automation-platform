SELECT
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  p.proconfig AS config,
  r.rolname AS owner,
  pg_get_functiondef(p.oid) AS source
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.proname = 'delete_customer_tenant_v1';
