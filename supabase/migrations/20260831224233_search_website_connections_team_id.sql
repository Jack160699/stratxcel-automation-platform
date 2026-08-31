-- Vercel team-scoped-token support for search_website_connections.
-- Additive only. Preserves all existing data.
--
-- Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
-- Update 19: a real, live customer-reported VERCEL_API_ERROR_404 on
-- "Connect Vercel". Traced against Vercel's own live REST API docs
-- (fetched during this fix): GET /v2/user only documents
-- 200/302/400/401/403/409/410 as possible responses -- 404 isn't among
-- them for a genuinely invalid token (those get 401/403). A Personal
-- Access Token scoped to a specific Team (a normal, common choice Vercel
-- itself offers at token creation) has no personal-account "user"
-- resource at all, and 404s on that call even though the token is
-- genuinely valid. packages/search-discovery/src/vercel/client.ts's
-- validateVercelToken now falls back to GET /v2/teams on that specific
-- 404 and resolves a real teamId -- this column is where that gets
-- persisted so every later project/domain discovery call
-- (packages/search-discovery/src/vercel/connector.ts's
-- discoverVercelProjects) can pass ?teamId= correctly instead of losing
-- that context after the initial connect.

ALTER TABLE search_website_connections
  ADD COLUMN IF NOT EXISTS team_id text;

COMMENT ON COLUMN search_website_connections.team_id IS
  'Vercel team id, set only when the connecting Personal Access Token is scoped to a specific Team rather than "Full Account" (validateVercelToken''s /v2/teams fallback). Null for a normal personal-account token.';
