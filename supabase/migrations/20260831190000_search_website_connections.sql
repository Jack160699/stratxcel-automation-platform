-- Website Deployment Connector Schema Migration (Vercel, extensible to others)
-- Additive only. Preserves all existing data.
--
-- Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md: no
-- website-deployment connector existed anywhere in this codebase. The
-- token itself is NEVER stored here -- only a vault_secrets reference
-- (see packages/byok/src/vault.ts's createDevEncryptedVault, the same
-- real, already-in-use AES-256-GCM vault every other real secret in this
-- codebase uses), matching this codebase's "never return a saved secret
-- to the browser, never store a secret in an application-readable table"
-- rule.

CREATE TABLE IF NOT EXISTS search_website_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES search_projects(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('vercel')),
  -- vault_secrets.id (uuid), stored as text to stay storage-agnostic --
  -- never the token itself.
  token_vault_ref text NOT NULL,
  scope text NOT NULL DEFAULT 'ANALYSIS_ONLY' CHECK (scope IN ('ANALYSIS_ONLY', 'AUTONOMOUS_WRITE')),
  external_account_id text,
  external_account_name text,
  is_healthy boolean NOT NULL DEFAULT true,
  last_verified_at timestamptz,
  last_error text,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_website_provider UNIQUE (tenant_id, provider)
);

-- Enable RLS
ALTER TABLE search_website_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_website_connections_tenant_read ON search_website_connections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_website_connections.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_website_connections FROM public, anon;
GRANT SELECT ON search_website_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_website_connections TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_website_connections_tenant ON search_website_connections (tenant_id, provider);

-- Discovered Vercel projects for a connection -- separate table so
-- discovery can be refreshed/re-run without losing the connection itself.
CREATE TABLE IF NOT EXISTS search_website_connection_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES search_website_connections(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_project_id text NOT NULL,
  project_name text NOT NULL,
  domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  framework text,
  last_deployment_state text,
  last_deployment_url text,
  last_discovered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_connection_external_project UNIQUE (connection_id, external_project_id)
);

ALTER TABLE search_website_connection_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_website_connection_projects_tenant_read ON search_website_connection_projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_website_connection_projects.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_website_connection_projects FROM public, anon;
GRANT SELECT ON search_website_connection_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_website_connection_projects TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_website_conn_projects_tenant ON search_website_connection_projects (tenant_id, connection_id);
