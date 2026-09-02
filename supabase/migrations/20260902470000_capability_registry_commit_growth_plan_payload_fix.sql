-- Records a correctness fix to commit_growth_plan: strategy_payload now
-- stores the complete plan (including planningContext) rather than a
-- hand-picked subset that would have made a real committed plan
-- unrevisable later. Applied live via Supabase MCP on 2026-09-02; this
-- file makes that reproducible from a fresh database.
update public.capability_registry
set status_notes = status_notes || ' UPDATE (same day, next pass): fixed a real gap found while considering how a future revision tool would work -- the original strategy_payload only stored a hand-picked subset of BusinessGrowthPlan fields, omitting planningContext (brandBrain/audience/geography/positioning/channels/goals snapshot). reviseThirtyDayPlan specifically reads current.planningContext to preserve that snapshot across a revision -- omitting it would have made a real committed plan quietly unrevisable later. Now stores the complete plan object (minus the two fields already promoted to their own real columns) rather than re-guessing which fields matter.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:commit_growth_plan_tool';
