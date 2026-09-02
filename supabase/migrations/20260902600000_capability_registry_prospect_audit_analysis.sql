-- Records run_prospect_audit_analysis, closing capability:prospect_audit_automated_pipeline
-- (NOT_BUILT since Update 58) with a real, honest on-demand automated
-- first-pass analysis for the free/prospect Audit product. Applied live
-- via Supabase MCP on 2026-09-02; this file makes it reproducible from a
-- fresh database.

update public.capability_registry
set status = 'REAL_EXPOSED',
    status_notes = status_notes || ' CLOSED 2026-09-02 (final gap-closing pass): run_prospect_audit_analysis (lib/agent-core/prospect-audit-analysis-tool.ts) ships a real, honest first automated slice -- reuses the exact real, already-live website intelligence pipeline analyze_website uses (runWebsiteIntelligencePipelineCached, real crawl + SSRF protection + evidence-tagged extraction, 24h cache) to actually populate a submitted public_audit_requests row''s job_status/progress_percentage/report_data/evidence_data/completed_at for real, on demand. NOT the same as the paid audit_orders engine (packages/audit-engine''s multi-stage pipeline) -- stated honestly, not claimed to be that. Deliberately does not touch the request''s own CRM-stage `status` column (new/contacted/qualified/.../rejected) -- stays a human sales decision. Turns "100% manual, forever" into "a real automated first-pass analysis a staff member triggers and reviews" -- true zero-touch automation would need a cron trigger, which this app''s own Vercel Hobby-plan ceiling (capability:vercel_cron_hobby_tier_daily_cap) would bound to once-daily anyway even if built, so an on-demand tool is the more honest, immediately valuable shape for this pass. risk: low_mutation, reuses the existing agent:mutate:audit_reports permission. Verified: full-repo tsc --noEmit clean, lint clean, test:agent-core-lib (zero regressions), real NODE_ENV=production next build (exit 0), a live transactional dry-run update/rollback against a real public_audit_requests row (confirmed still stuck at job_status=draft/progress=0 before this tool existed -- direct, live proof this gap was real, not theoretical).',
    external_blocker = null,
    last_verified_at = now(), last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:prospect_audit_automated_pipeline';
