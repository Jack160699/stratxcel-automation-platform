-- Review Bot durable idempotency + audit trail. Additive only.
--
-- Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md
-- (Update 11/12): lib/google/google-growth-engine.ts's processCustomerReview
-- and lib/social/providers/google-business.ts's listLocationReviews/
-- replyToLocationReview are real, tested, and unwired -- nothing persists
-- which reviews have already been decided/replied to. Without a durable
-- uniqueness boundary (not just an application-level if-check), a retried
-- or overlapping scheduler run could reply to the same review twice.
--
-- One row per (tenant, provider, review) is created the first time a
-- review is observed and is the single source of truth for whether it has
-- already been acted on -- the unique constraint below is the real
-- idempotency mechanism, not the calling code's own care.

CREATE TABLE IF NOT EXISTS gbp_review_response_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES social_accounts(id) ON DELETE SET NULL,
  location_resource_name text NOT NULL,
  provider text NOT NULL DEFAULT 'google_business',
  review_id text NOT NULL,
  reviewer_name text,
  star_rating smallint CHECK (star_rating BETWEEN 0 AND 5),
  review_comment text,
  review_created_at timestamptz,
  sentiment text CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
  escalation_reasons text[] NOT NULL DEFAULT '{}',
  decision text NOT NULL CHECK (decision IN ('AUTO_REPLY', 'ESCALATE', 'SKIP_ALREADY_REPLIED')),
  status text NOT NULL DEFAULT 'DISCOVERED'
    CHECK (status IN ('DISCOVERED', 'PENDING', 'APPROVED_FOR_AUTO_REPLY', 'REPLIED', 'ESCALATED', 'FAILED')),
  generated_response text,
  attempt smallint NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  -- The real idempotency boundary (brief Section 4): a DB uniqueness
  -- constraint, not an application-level if-check. A provider's review_id
  -- resource name is already globally unique, but scoping by tenant_id too
  -- keeps this table's guarantee legible without depending on that
  -- provider detail, and matches every sibling search_* table's own
  -- per-tenant uniqueness convention.
  CONSTRAINT uq_tenant_provider_review UNIQUE (tenant_id, provider, review_id)
);

ALTER TABLE gbp_review_response_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY gbp_review_response_jobs_tenant_read ON gbp_review_response_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenant_members m
      WHERE m.tenant_id = gbp_review_response_jobs.tenant_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON gbp_review_response_jobs FROM public, anon;
GRANT SELECT ON gbp_review_response_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON gbp_review_response_jobs TO service_role;

CREATE INDEX IF NOT EXISTS idx_gbp_review_response_jobs_tenant ON gbp_review_response_jobs (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gbp_review_response_jobs_needs_attention ON gbp_review_response_jobs (tenant_id) WHERE status = 'ESCALATED';
