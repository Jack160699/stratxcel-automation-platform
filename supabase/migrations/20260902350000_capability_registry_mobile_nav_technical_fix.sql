-- Records a fix for a real mobile-nav regression introduced by Update 41's
-- Normal/Technical mode split: the mobile bottom nav resolved to zero
-- items whenever a staff member switched to Technical mode. Applied live
-- via Supabase MCP on 2026-09-02; this file makes that reproducible from
-- a fresh database.
update public.capability_registry
set status_notes = status_notes || ' UPDATE (same day, next pass): found and fixed a real regression this same split introduced: ADMIN_MOBILE_NAV_KEYS was a single flat list of Normal-mode-only keys, so getAdminMobileNav(allowV2, "technical") silently resolved to zero items -- the mobile bottom nav would render empty whenever a staff member switched to Technical mode on mobile. Fixed by making ADMIN_MOBILE_NAV_KEYS mode-aware (Record<AdminViewMode, string[]>): normal keeps [overview, leads, approvals, clients]; technical gets its own real list [missions, system, integrations, operating-brain]. New regression test asserts neither mode ever resolves to an empty mobile nav and that every configured key is a real item in that mode''s data. Full-repo tsc --noEmit clean, lint clean, real NODE_ENV=production next build exit 0.',
    last_verified_at = now(),
    last_verified_by = 'claude_session_2026-09-02'
where capability_key = 'capability:admin_normal_technical_mode_split';
