-- Continuous Search Growth Loop, Strategy State, and AI Search / AEO Snapshots
-- Additive only. Preserves all existing data.

-- 1. Search Strategy State (TAKE, DEFEND, EXPAND, RECOVER)
CREATE TABLE IF NOT EXISTS search_strategy_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES search_projects(id) ON DELETE CASCADE,
  current_mode text NOT NULL DEFAULT 'EXPAND' CHECK (current_mode IN ('TAKE', 'DEFEND', 'EXPAND', 'RECOVER')),
  movement_status text NOT NULL DEFAULT 'STABLE' CHECK (movement_status IN ('GAINING', 'STABLE', 'DECLINING', 'UNKNOWN')),
  active_alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  growth_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_project_strategy UNIQUE (tenant_id, project_id)
);

-- Enable RLS
ALTER TABLE search_strategy_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_strategy_states_tenant_read ON search_strategy_states
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_strategy_states.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_strategy_states FROM public, anon;
GRANT SELECT ON search_strategy_states TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_strategy_states TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_strategy_tenant ON search_strategy_states (tenant_id, current_mode);

-- 2. AI Visibility & AEO Measurement Snapshots
CREATE TABLE IF NOT EXISTS search_ai_visibility_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES search_projects(id) ON DELETE CASCADE,
  run_id uuid REFERENCES search_analysis_runs(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('chatgpt_search', 'perplexity', 'gemini', 'claude_web', 'google_ai_overview', 'aggregated_ai')),
  query text NOT NULL,
  brand_mentioned boolean NOT NULL DEFAULT false,
  client_cited boolean NOT NULL DEFAULT false,
  cited_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  competitor_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_response_summary text,
  confidence text NOT NULL DEFAULT 'MEDIUM' CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  availability_state text NOT NULL DEFAULT 'connected',
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_project_ai_query UNIQUE (tenant_id, project_id, platform, fingerprint)
);

-- Enable RLS
ALTER TABLE search_ai_visibility_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_ai_visibility_tenant_read ON search_ai_visibility_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_ai_visibility_snapshots.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_ai_visibility_snapshots FROM public, anon;
GRANT SELECT ON search_ai_visibility_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_ai_visibility_snapshots TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_ai_snapshots_tenant ON search_ai_visibility_snapshots (tenant_id, platform, created_at DESC);
