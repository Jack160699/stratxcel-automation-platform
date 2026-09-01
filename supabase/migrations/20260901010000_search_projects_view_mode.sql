-- Customer-facing UI detail-level preference for the Search Growth
-- dashboard. Additive only. Preserves all existing data.
--
-- Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
-- Update 23: the real, existing search_projects.enabled column already
-- represents a genuinely different concept -- whether the daily
-- continuous-growth scheduler runs for this tenant at all (backend
-- automation eligibility; app/api/internal/search/scheduler/route.ts's
-- `.eq("enabled", true)`). Conflating that with a customer's preferred
-- level of dashboard detail would let a UI-only preference change
-- accidentally stop real backend work, or vice versa. This column is a
-- second, independent switch: purely how much of the already-computed
-- SearchGrowthDashboardData a customer wants rendered. Changing it must
-- never touch enabled, subscriptions, or any scheduler/crawl/execution
-- state -- see app/api/platform/search/view-mode/route.ts.

ALTER TABLE search_projects
  ADD COLUMN IF NOT EXISTS view_mode text NOT NULL DEFAULT 'simple';

ALTER TABLE search_projects
  ADD CONSTRAINT search_projects_view_mode_check
    CHECK (view_mode IN ('simple', 'detailed'));

COMMENT ON COLUMN search_projects.view_mode IS
  'Customer-facing dashboard detail-level preference only ("simple" or "detailed"). Purely a presentation switch over the same SearchGrowthDashboardData -- independent of search_projects.enabled (backend scheduler eligibility), which this column must never influence or be influenced by.';
