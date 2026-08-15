-- Query ALL tables that have tenant_id columns (and their type)
-- This tells us which tables we can delete by tenant_id
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
ORDER BY table_name;
