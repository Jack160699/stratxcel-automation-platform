-- Records that the generation-time half of Update 29/30's finding was
-- actually FIXED this pass (not just documented) -- page-planner.ts's
-- fabricated ECOMMERCE products and AI_BUSINESS pricing sections removed,
-- matching the already-proven 2026-08-23 testimonials remediation pattern.
-- The edit-time half (applyNaturalLanguageEdit) remains open. Applied live
-- via Supabase MCP on 2026-09-02; this file makes that reproducible from a
-- fresh database.
update public.capability_registry
set status = 'PARTIAL',
    name = 'Website natural-language edit: fabrication defect (generation half FIXED; edit half still broken)',
    status_notes = 'UPDATE 2026-09-02, same pass: fixed the generation-time half of this defect. page-planner.ts''s ECOMMERCE (two fabricated products sections) and AI_BUSINESS (one fabricated pricing section) templates -- reachable via the real, live POST /api/platform/website-factory/brief route -- had those sections removed entirely, same remediation pattern already proven for the 2026-08-23 testimonials fix in the same file. Real regression coverage added: no-fabricated-testimonials.test.ts extended with 3 new tests (was 7, now 10, all passing) and wired into the test:website-factory aggregate script for the first time (it existed but was never run in CI). Full test:website-factory suite (22 files, hundreds of cases) re-verified passing after the change; tsc --noEmit clean. STILL BROKEN and NOT fixed this pass: applyNaturalLanguageEdit (site-builder.ts, the separate "edit" feature invoked from app/api/platform/website-factory/[projectId]/edit/route.ts) has its own, still-unfixed copy of the identical fabricated testimonials/products, plus its own silent-no-op-reported-as-success issue on any unmatched instruction -- a real fix for that function specifically (not just deleting the sections, since edit-time content also needs an honest "did not understand this instruction" path) was judged out of scope for this pass and left for a dedicated follow-up.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:website_edit_fabrication_defect';
