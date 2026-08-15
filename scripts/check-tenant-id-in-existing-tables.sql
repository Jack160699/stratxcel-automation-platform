-- Check which of these existing tables have a tenant_id column
SELECT t.table_name, c.column_name
FROM information_schema.tables t
LEFT JOIN information_schema.columns c
  ON c.table_schema = t.table_schema
  AND c.table_name = t.table_name
  AND c.column_name = 'tenant_id'
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'social_tokens', 'social_campaigns', 'social_agent_actions',
    'social_agent_run_events', 'social_agent_runs',
    'mission_events', 'mission_artifacts',
    'ai_media_operations', 'ai_execution_usage'
  )
ORDER BY t.table_name;
