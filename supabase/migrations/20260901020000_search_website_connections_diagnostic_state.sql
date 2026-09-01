-- Vercel connection diagnostic classification. Additive only. Preserves
-- all existing data.
--
-- Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
-- Update 24: a real customer's genuinely-valid-looking token was rejected
-- with "could not be authorized" (Update 23's INVALID_TOKEN -- a real
-- 401/403 from Vercel's own API, not a code bug). Investigating exposed a
-- real, separate gap: a connect attempt that succeeded at the
-- token-validation stage had no record of whether it then actually found
-- a matching StratXcel project/domain in the connected Vercel account --
-- discoverVercelProjects ran as a fully separate, later call with no
-- combined diagnostic persisted anywhere. This column stores the result
-- of the new diagnoseVercelConnection() pipeline (vercel/diagnostics.ts),
-- refreshed on every connect and every discover, so "token valid but
-- project not found" (a real, non-failure state) is distinguishable from
-- a genuine token failure without a second live API round-trip.

ALTER TABLE search_website_connections
  ADD COLUMN IF NOT EXISTS diagnostic_state text;

COMMENT ON COLUMN search_website_connections.diagnostic_state IS
  'One of TOKEN_VALID_PERSONAL | TOKEN_VALID_TEAM | PROJECT_ACCESS_MISSING | PROJECT_NOT_FOUND | DOMAIN_NOT_FOUND | DOMAIN_MISMATCH | PROVIDER_ERROR -- only ever set once the token itself is genuinely valid (a token-level failure never creates a connection row at all). Null for a connection created before this column existed, until its next connect/discover refreshes it.';
