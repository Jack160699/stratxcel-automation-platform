-- Records the fix for capability:analyze_website_no_cache (master brief
-- section 27, cost optimization) -- a real Postgres-backed cache now
-- wraps analyze_website's underlying pipeline. Applied live via Supabase
-- MCP on 2026-09-02; this file makes that reproducible from a fresh
-- database.
update public.capability_registry
set status = 'REAL_EXPOSED',
    status_notes = status_notes || ' UPDATE 2026-09-02 (later pass, same day): FIXED. New real Postgres-backed cache (website_intelligence_cache table, service-role-only RLS, global not tenant-scoped since these are public-website results) via lib/agent-core/website-intelligence-cache.ts''s runWebsiteIntelligencePipelineCached -- a real cache-through wrapper (24h TTL, a deliberate stated choice) now used by analyze_website. Explicitly NOT an in-memory cache (the exact mistake found live in the editing/ module -- capability:editing_module_in_memory_prototype -- would not survive serverless invocations). Any cache read/write failure falls through to a real fresh pipeline run rather than blocking or fabricating a result. New website-intelligence-cache.test.ts (4 real assertions: miss-then-store, fresh-hit-skips-pipeline, expired-row-treated-as-miss, read-failure-falls-through-to-real-run), wired into test:agent-core-lib. Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production next build exit 0.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:analyze_website_no_cache';
