-- Search Trend Intelligence Schema Migration
-- Additive only. Preserves all existing data.
--
-- Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md: no
-- trend-relevance classification (USE_NOW/ADAPT/MONITOR/IGNORE) existed
-- anywhere in this codebase. Built on the already-real, already-configured
-- grounded research engine (research/grounded-runtime.ts) -- every row
-- traces to a real source_url/observed_at/confidence, never a fabricated
-- trend. Matches the field set produced by
-- packages/search-discovery/src/trends/relevance-engine.ts.

CREATE TABLE IF NOT EXISTS search_trend_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES search_projects(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('google_search', 'ai_search', 'social', 'news', 'industry_publication', 'general_web')),
  topic text NOT NULL,
  format text NOT NULL DEFAULT 'unknown' CHECK (format IN ('short_video', 'long_video', 'carousel', 'text_post', 'blog_article', 'guide', 'local_listing', 'review_response', 'unknown')),
  hook_pattern text,
  visual_pattern text,
  audience_signal text,
  reason_for_trend text NOT NULL,
  velocity numeric,
  source text NOT NULL,
  source_url text,
  observed_at timestamptz NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL CHECK (decision IN ('USE_NOW', 'ADAPT', 'MONITOR', 'IGNORE')),
  decision_reason text NOT NULL,
  adaptation_guidance text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_trend_topic_source UNIQUE (tenant_id, topic, source)
);

-- Enable RLS
ALTER TABLE search_trend_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY search_trend_signals_tenant_read ON search_trend_signals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = search_trend_signals.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON search_trend_signals FROM public, anon;
GRANT SELECT ON search_trend_signals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_trend_signals TO service_role;

CREATE INDEX IF NOT EXISTS idx_search_trend_signals_tenant ON search_trend_signals (tenant_id, decision, observed_at DESC);
