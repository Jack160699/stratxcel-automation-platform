-- Check which tables from our deletion list actually exist in production
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'social_tokens', 'social_posts', 'social_campaigns', 'social_agent_actions',
    'social_agent_run_events', 'social_agent_runs',
    'mission_events', 'mission_artifacts', 'mission_approvals',
    'workforce_tasks', 'workforce_agents',
    'ai_media_operations', 'ai_execution_usage', 'ai_execution_attempts', 'ai_usage_ledger',
    'oauth_states', 'crm_messages', 'crm_conversations',
    'websites', 'custom_domains', 'storage_drive_connections',
    'byok_tenant_credentials', 'tenant_memberships',
    'payment_refund_records', 'brand_assets'
  )
ORDER BY table_name;
