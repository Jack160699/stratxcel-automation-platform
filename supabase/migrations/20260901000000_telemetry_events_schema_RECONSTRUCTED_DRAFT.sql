-- RECONSTRUCTED DRAFT — NOT the recovered original file, NOT applied.
--
-- The original supabase/migrations/20260828050000_telemetry_events_schema.sql
-- was an untracked file, accidentally deleted by `git clean -fd` during an
-- unrelated diagnostic branch cleanup this session. A real, thorough
-- recovery search was performed and came up empty: git reflog (all refs),
-- every stash including their untracked-file trees, a full history grep,
-- every dangling/unreachable blob in the object database (125 checked),
-- every sibling worktree's filesystem, and local editor-history folders.
-- The file was never staged or committed anywhere, so git has no copy.
--
-- Confirmed directly against the real production database
-- (uccqlgeghkwzujeeymua): no `telemetry_events` table exists —
-- `select table_name from information_schema.tables where table_name ilike
-- '%telemetry%'` returns zero rows. The lost migration was never applied.
-- There is no live schema drift to reconcile.
--
-- This file is a best-effort RECONSTRUCTION inferred only from the
-- surviving application code that reads/writes this table
-- (lib/analytics/telemetry-shared.ts, app/api/telemetry/route.ts,
-- lib/analytics/track-server.ts) — not from the original migration file
-- itself, which is genuinely gone. It is NOT applied to production and
-- should not be treated as authoritative: the original author may have
-- included additional columns (e.g. session_id, referrer, page_url — all
-- plausible for funnel telemetry but with zero evidence for or against in
-- the surviving code), different indexes, or a different retention policy
-- that this reconstruction cannot know about. Review before applying.
--
-- Evidence used for every column below:
--   tenant_id    — app/api/telemetry/route.ts inserts `context?.tenantId ??
--                  null` / resolveTenantId(); nullable (anonymous events).
--   event_name   — telemetry-shared.ts' sanitizeEventName(): lowercase
--                  snake_case, 1-64 chars.
--   properties   — telemetry-shared.ts' sanitizeTelemetryProperties():
--                  flat jsonb, string/number/boolean values only.
--   ip_hash      — telemetry-shared.ts' hashTelemetryIp(): sha256, first
--                  16 hex chars; nullable (server-originated events omit
--                  it per track-server.ts' own comment).
--   user_agent   — telemetry-shared.ts' sanitizeUserAgent(): capped at 300
--                  chars; nullable.
--   ua_class     — telemetry-shared.ts' classifyUserAgent(): exactly
--                  'bot' | 'human' | 'unknown'; track-server.ts' comment
--                  states this "defaults to 'unknown' at the DB level" for
--                  server-originated rows that omit it.

CREATE TABLE IF NOT EXISTS telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  event_name text NOT NULL CHECK (event_name ~ '^[a-z][a-z0-9_]{0,63}$'),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text,
  ua_class text NOT NULL DEFAULT 'unknown' CHECK (ua_class IN ('bot', 'human', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

-- No customer-facing read is evidenced anywhere in the surviving code (this
-- is a write-only ingestion sink); service-role only, no `authenticated`
-- grant, matching the "least surface until a real caller needs more" bar
-- this session's other new tables followed.
REVOKE ALL ON telemetry_events FROM public, anon, authenticated;
GRANT SELECT, INSERT ON telemetry_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_telemetry_events_tenant ON telemetry_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_name ON telemetry_events (event_name, created_at DESC);
