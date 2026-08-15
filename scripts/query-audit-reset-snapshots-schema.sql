-- Get exact column definitions of audit_reset_snapshots
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'audit_reset_snapshots'
ORDER BY ordinal_position;
