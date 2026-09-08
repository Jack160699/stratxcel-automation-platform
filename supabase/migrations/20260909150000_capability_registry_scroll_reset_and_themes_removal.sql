-- Registers two bounded fixes from Final Customer Experience Repair &
-- Product Simplification: Section 6 (page navigation must always open a
-- new step/screen at the top) and Section 24/27 (remove the duplicated
-- Themes/Appearance toggle). Applied live via Supabase MCP; this file
-- makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:app_shell_scroll_reset_on_navigation',
  'Every route change and onboarding step transition opens at the top of the page, with the correct header visible',
  'Reported bug: the next page (a new onboarding step, an audit/results screen) could open with the PREVIOUS page''s scroll position still applied. Root cause: components/shell/CoreAppShell.tsx''s own <main> is the real scroll container (overflow-y-auto), not the browser window/document -- the existing app/components/ScrollRestoration.jsx (root layout) only ever resets window scroll, so it never reached this element. New components/shell/ScrollToTopMain.tsx wraps that <main>, resetting it to the top on every pathname change (usePathname), used by both /app and /admin via CoreAppShell. Onboarding renders standalone (app/app/layout.tsx returns <OnboardingPanel> directly for a NEW_CUSTOMER, bypassing CoreAppShell entirely) and its steps are one route with client-state-driven transitions (no pathname change at all) -- OnboardingWizard.tsx resets window scroll directly on its own `step` state change instead, since it is that page''s real scroll container.',
  'app_shell',
  'Engineering',
  'N/A (customer/admin UI, not a Hermes/agent tool)',
  'read',
  'global',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean, real NODE_ENV=production build exits 0. No existing test suite asserted on the old (broken) scroll behavior, so no regression test needed updating; the fix is additive (a new small client component + one new useEffect).',
  'REAL_EXPOSED',
  'Section 8 (typography flash on navigation) was investigated as a likely related symptom, not a separate defect: app/layout.tsx already uses next/font/google with adjustFontFallback + display swap (self-hosted, no external round-trip -- already best practice), so no independent font-loading bug was found. A viewer landing at a stale scroll position mid-load/hydration could plausibly read as "unstyled content" even though it was really a scroll-position bug; this fix should resolve most of what was reported as flash. Not independently re-tested with a live font-network-throttling reproduction.',
  now(),
  'claude_session_2026-09-09'
),
(
  'capability:customer_app_appearance_toggle_removed',
  'Duplicate light/dark Appearance toggle removed from the profile menu and /app/settings -- ThemeProvider''s dark-mode CSS support is untouched, just no user-facing switch left',
  'Final Customer Experience Repair Section 24 ("Remove Themes from More") / Section 27 ("remove duplicate actions"). No literal "Themes" nav item existed anywhere in the codebase -- the actual referent was the light/dark Appearance picker, duplicated in TWO places at once: app/app/components/CustomerHeaderActions.tsx''s profile dropdown and app/app/settings/page.tsx, both driven by the same components/theme/ThemeProvider.tsx. Removed the toggle UI (and the now-unused useTheme import/destructure) from both files -- non-essential customization for a non-technical SMB owner, and a genuine duplicate action across two menus. ThemeProvider itself, its dark-mode CSS tokens, and the unused (pre-existing, out of scope) exported ThemeToggle component were left untouched -- everyone now simply gets the provider''s existing default ("light" when no prior localStorage preference), with no regression to dark-mode CSS support for any future re-introduction of a switch.',
  'customer_app',
  'Engineering',
  'N/A (customer UI, not a Hermes/agent tool)',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean, real NODE_ENV=production build exits 0. Updated the one existing real regression-guard test that still asserted "Appearance" as a required profile-menu item (lib/rbac/__tests__/customer-app-final-ux.test.ts) to instead assert its absence from both files; that test and customer-app-bugfixes-polish.test.ts (which separately verifies ThemeProvider''s own dark-mode CSS support, untouched) both pass.',
  'REAL_EXPOSED',
  null,
  now(),
  'claude_session_2026-09-09'
);
