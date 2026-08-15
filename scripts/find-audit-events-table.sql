-- Find the actual audit/events table in production
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%audit%event%'
   OR (table_schema = 'public' AND table_name LIKE '%platform_audit%')
   OR (table_schema = 'public' AND table_name LIKE '%audit_log%')
ORDER BY table_name;
