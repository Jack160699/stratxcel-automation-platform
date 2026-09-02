-- Sharpens the engine:learning_loop finding now that planBusinessGrowth
-- itself is real and reachable: the real remaining blocker is that
-- workforce_plans has zero real INSERT writers anywhere. Applied live via
-- Supabase MCP on 2026-09-02; this file makes that reproducible from a
-- fresh database.
update public.capability_registry
set status_notes = status_notes || ' UPDATE 2026-09-02 (later pass, same day): more precise now that planBusinessGrowth itself is real and reachable (capability:preview_growth_plan_tool) -- the remaining blocker is specifically that workforce_plans has ZERO real INSERT writers anywhere in this codebase (confirmed by repo-wide grep; its only real reference, lib/tenants/lifecycle.ts, is a tenant-offboarding cleanup/delete path, not a writer). Persisting a real BusinessGrowthPlan (linked to a real mission via createAndEstimateMission, which does exist and is real) is a genuine, novel piece of engineering -- designing the first-ever write path to this table -- not a simple "wire an existing engine" job like everything else fixed this session. Left honestly open rather than rushed: a real, separate, dedicated design pass is the right way to build this, not an improvised addition at the end of a long session.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'engine:learning_loop';
