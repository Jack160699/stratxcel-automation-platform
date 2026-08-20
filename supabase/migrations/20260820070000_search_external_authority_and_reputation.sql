-- Search External Authority, Community, Local & Reputation Schema Migration
-- Additive only. Preserves all existing data.

-- 1. External Authority Sources & Citations
CREATE TABLE IF NOT EXISTS search_external_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES search_projects(id) ON DELETE CASCADE,
  domain text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'news_publication', 'industry_publication', 'trade_association',
    'business_directory', 'local_directory', 'review_platform',
    'community_reddit', 'community_quora', 'community_forum',
    'youtube_social', 'reference_database', 'other'
  )),
  title text,
  target_url text,
  topic_relevance int NOT NULL DEFAULT 50 CHECK (topic_relevance BETWEEN 0 AND 100),
  geographic_relevance text NOT NULL DEFAULT 'NATIONAL' CHECK (geographic_relevance IN ('LOCAL', 'REGIONAL', 'NATIONAL', 'GLOBAL')),
  client_present boolean NOT NULL DEFAULT false,
  competitor_present boolean NOT NULL DEFAULT false,
  competitor_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  publication_capability text NOT NULL DEFAULT 'READ_ONLY' CHECK (publication_capability IN ('READ_ONLY', 'RECOMMENDATION_ONLY', 'SUBMISSION_AVAILABLE', 'API_WRITE_AVAILABLE')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunity_score int NOT NULL DEFAULT 50 CHECK (opportunity_score BETWEEN 0 AND 100),
  confidence text NOT NULL DEFAULT 'MEDIUM' CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_project_source_domain UNIQUE (tenant_id, project_id, domain)
);

-- Enable RLS
ALTER TABLE search_external_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_external_sources_tenant_read ON search_external_sources
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_external_sources.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_external_sources FROM public, anon;
GRANT SELECT ON search_external_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_external_sources TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_external_sources_tenant ON search_external_sources (tenant_id, source_type);

-- 2. Entity & Citation Graph Nodes
CREATE TABLE IF NOT EXISTS search_entity_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES search_projects(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('BRAND', 'PERSON', 'SERVICE', 'LOCATION', 'PRODUCT', 'PUBLICATION', 'DIRECTORY', 'REVIEW_PROFILE', 'AI_CITATION')),
  canonical_name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  relationships jsonb NOT NULL DEFAULT '[]'::jsonb,
  consistency_status text NOT NULL DEFAULT 'CONSISTENT' CHECK (consistency_status IN ('CONSISTENT', 'INCONSISTENT', 'WEAK_COVERAGE', 'MISSING_RELATIONSHIP')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_project_entity UNIQUE (tenant_id, project_id, entity_type, canonical_name)
);

-- Enable RLS
ALTER TABLE search_entity_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_entity_nodes_tenant_read ON search_entity_nodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_entity_nodes.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_entity_nodes FROM public, anon;
GRANT SELECT ON search_entity_nodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_entity_nodes TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_entity_nodes_tenant ON search_entity_nodes (tenant_id, entity_type);
