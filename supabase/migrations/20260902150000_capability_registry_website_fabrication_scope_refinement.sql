-- Refines Update 29's finding after further tracing: confirms generate5PageSite
-- (the basic creation route) is clean, and precisely scopes the fabrication
-- defect to (1) the AI Website Creator/brief flow's still-unfixed fabricated
-- PRODUCTS (testimonials were already fixed there 2026-08-23, products were
-- not) and (2) applyNaturalLanguageEdit's own separate, never-fixed copy.
-- Applied live via Supabase MCP on 2026-09-02; this file makes that
-- reproducible from a fresh database.
update public.capability_registry
set status_notes = 'This is a real, live, pre-existing product-quality/honesty defect, more precisely scoped after further tracing: (1) generate5PageSite (the basic creation route, app/api/platform/websites POST -- already confirmed real/clean elsewhere in this registry) does NOT fabricate content -- confirmed clean. (2) The AI Website Creator/brief flow (POST /api/platform/website-factory/brief -> WebsiteGenerationEngine -> page-planner.ts''s planPageArchitecture) already had its TESTIMONIALS fabrication fixed on 2026-08-23 (see packages/websites-and-domains/src/__tests__/no-fabricated-testimonials.test.ts''s own detailed history) -- but that fix and its regression test check testimonials only; the SAME file''s "Trending Favorites" ecommerce template still hardcodes fabricated PRODUCTS ("Signature Tailored Blazer... Rs24,999", "Egyptian Cotton Oxford Shirt... Rs8,499") for every ECOMMERCE-type site generated through this real, live, reachable route -- an incomplete fix of a known bug class, not a new undiscovered one. (3) applyNaturalLanguageEdit (site-builder.ts, the separate "edit" feature) has its own, never-fixed copy of the identical fabricated products AND still-fabricated testimonials, plus the silent-no-op issue on any unmatched instruction. Deliberately NOT bridged to the agent for any of these three surfaces.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:website_edit_fabrication_defect';
