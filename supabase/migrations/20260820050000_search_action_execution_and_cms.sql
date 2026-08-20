-- Search Action Execution Engine & CMS Connectors Schema Migration
-- Additive only. Preserves all existing data.

-- 1. Additive columns for search_actions to support full execution lifecycle & verification
ALTER TABLE IF EXISTS search_actions
  ADD COLUMN IF NOT EXISTS target_url text,
  ADD COLUMN IF NOT EXISTS target_entity text,
  ADD COLUMN IF NOT EXISTS execution_tool text,
  ADD COLUMN IF NOT EXISTS agent_role text,
  ADD COLUMN IF NOT EXISTS execution_state text DEFAULT 'PROPOSED',
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS verification_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS rollback_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. CMS Connections Table (WordPress, StratXcel Native, Webflow, Shopify, Webhooks)
CREATE TABLE IF NOT EXISTS search_cms_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cms_type text NOT NULL CHECK (cms_type IN ('wordpress', 'stratxcel_native', 'webflow', 'shopify', 'webhook')),
  site_url text NOT NULL,
  auth_kind text NOT NULL CHECK (auth_kind IN ('application_password', 'vault_secret', 'native_session', 'bearer_token')),
  vault_secret_id text,
  is_healthy boolean NOT NULL DEFAULT true,
  write_enabled boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_cms_site UNIQUE (tenant_id, site_url)
);

-- Enable RLS
ALTER TABLE search_cms_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_cms_connections_tenant_read ON search_cms_connections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_cms_connections.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_cms_connections FROM public, anon;
GRANT SELECT ON search_cms_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_cms_connections TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_cms_tenant_type ON search_cms_connections (tenant_id, cms_type);
CREATE INDEX IF NOT EXISTS idx_search_actions_execution_state ON search_actions (tenant_id, execution_state, created_at DESC);
