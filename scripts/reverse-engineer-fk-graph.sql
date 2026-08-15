-- STEP 1: Get the complete FK graph for all tables that reference tenants or audit_orders
-- This is the complete reverse-engineering query for the live production database

-- A. All FKs that reference public.tenants(id) with RESTRICT
SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
  AND tc.table_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
  AND rc.unique_constraint_schema = ccu.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (
    (ccu.table_schema = 'public' AND ccu.table_name = 'tenants')
    OR (ccu.table_schema = 'public' AND ccu.table_name = 'audit_orders')
    OR (ccu.table_schema = 'public' AND ccu.table_name = 'promo_redemptions')
    OR (ccu.table_schema = 'public' AND ccu.table_name = 'promo_codes')
  )
ORDER BY ccu.table_name, rc.delete_rule DESC, tc.table_name;
