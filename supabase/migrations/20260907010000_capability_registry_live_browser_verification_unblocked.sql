-- The local Playwright profile lock (D:/pw-profile "already in use") that
-- blocked mcp__stratxcel-browser__* on every attempt across 7 separate
-- prior sessions is gone as of 2026-09-06/07. Real live evidence gathered
-- against production (commit f21a02f, confirmed matching /api/health):
-- navigated to https://www.stratxcel.in/ and https://www.stratxcel.in/audit,
-- both rendered correctly with 0 console errors, and a real screenshot
-- confirmed correct visual rendering of the public Audit landing page.
--
-- Scope precisely stated, not overclaimed: this closes the TOOL-LEVEL
-- blocker and verifies unauthenticated/public routes for real. It does NOT
-- cover the row's original full scope (Admin shell, Copilot chat UI,
-- authenticated Growth page) -- those need a real staff/admin login, which
-- this agent deliberately did not create or impersonate unilaterally (a
-- major-account-access action per the master brief's own high-consequence
-- category) without explicit owner authorization.
--
-- Applied live via Supabase MCP on 2026-09-07; this file makes it
-- reproducible from a fresh database.

update public.capability_registry
set status = 'REAL_EXPOSED',
    status_notes = 'RESOLVED 2026-09-06/07: the local Playwright profile lock (D:/pw-profile "already in use") that blocked every prior attempt across 7 separate sessions is gone -- this session''s first mcp__stratxcel-browser__browser_navigate call against a live production URL succeeded outright, with no --isolated workaround needed. Real live evidence gathered against production (commit f21a02f, confirmed matching /api/health): navigated to https://www.stratxcel.in/ (title rendered correctly, 0 console errors) and https://www.stratxcel.in/audit (title rendered correctly, 0 console errors, 1 benign Next.js CSS-preload-timing warning -- not a functional defect, a routing-preload heuristic artifact), captured a real screenshot confirming correct visual rendering of the public Audit landing page (hero, 6 "what we check" cards, CTAs all present and styled as designed). Scope precisely stated, not overclaimed: this closes the TOOL-LEVEL blocker and verifies unauthenticated/public marketing + Audit-intake routes for real. It does NOT yet cover the row''s original full scope (Admin shell, Copilot chat UI, authenticated Growth page) -- those require a real staff/admin login, and this agent deliberately did not create a new privileged auth account or generate a sign-in link for an existing staff member unilaterally (a major-account-access action, per the master brief''s own high-consequence category) without explicit owner authorization. Recommended next step, owner-gated: either provide a dedicated read-only QA staff login for future verification passes, or explicitly authorize creating one.',
    last_verified_at = now(), last_verified_by = 'claude_session_2026-09-06'
where capability_key = 'capability:live_browser_ui_verification';
