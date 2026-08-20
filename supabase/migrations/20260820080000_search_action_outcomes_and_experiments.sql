-- Search Action Outcomes, Baselines & Experimentation Schema Migration
-- Additive only. Preserves all existing data.

-- 1. Action Baselines
CREATE TABLE IF NOT EXISTS search_action_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES search_actions(id) ON DELETE CASCADE,
  target_url text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  query_rankings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_action_baseline UNIQUE (tenant_id, action_id)
);

ALTER TABLE search_action_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_action_baselines_tenant_read ON search_action_baselines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_action_baselines.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_action_baselines FROM public, anon;
GRANT SELECT ON search_action_baselines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_action_baselines TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_action_baselines_tenant ON search_action_baselines (tenant_id, action_id);

-- 2. Action Experiments & Longitudinal Outcomes
CREATE TABLE IF NOT EXISTS search_action_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES search_actions(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  industry text NOT NULL DEFAULT 'GENERAL',
  query_class text NOT NULL DEFAULT 'COMMERCIAL',
  hypothesis text NOT NULL,
  observation_window_days int NOT NULL DEFAULT 30,
  observation_status text NOT NULL DEFAULT 'IN_WINDOW' CHECK (observation_status IN (
    'IN_WINDOW', 'OBSERVED', 'IMPROVED', 'NO_EFFECT', 'NEGATIVE_EFFECT', 'INCONCLUSIVE'
  )),
  baseline_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  delta_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  attribution_confidence text NOT NULL DEFAULT 'UNKNOWN' CHECK (attribution_confidence IN (
    'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'
  )),
  decision text NOT NULL DEFAULT 'INCONCLUSIVE' CHECK (decision IN (
    'SUPPORTED', 'PARTIALLY_SUPPORTED', 'NOT_SUPPORTED', 'INCONCLUSIVE'
  )),
  explanation text,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_action_experiment UNIQUE (tenant_id, action_id)
);

ALTER TABLE search_action_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_action_experiments_tenant_read ON search_action_experiments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_action_experiments.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_action_experiments FROM public, anon;
GRANT SELECT ON search_action_experiments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_action_experiments TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_action_experiments_tenant ON search_action_experiments (tenant_id, action_type, observation_status);
