-- Registers the Content section simplification pass (Final Customer
-- Experience Repair mission, Section 5/26). Applied live via Supabase
-- MCP; this file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:content_free_creatives_and_connect_accounts',
  'Content Library surfaces the free branded creatives prominently and adds a genuine "Connect Accounts" entry point -- no existing functionality removed',
  'Final Customer Experience Repair, Section 5/26: inspect the existing Content Library before changing it; make My Free Content, Create Content, Download, Connect Accounts obvious; hide advanced controls unless required; never remove existing underlying functionality merely to simplify. Inspected app/app/content/ContentLibraryClient.tsx (~660 lines) first: 7 real category tabs (All/Creatives & Posters/Drafts/Published/Captions & Copy/Videos & Reels/Saved Assets), Quick Navigation Cards into Creative Studio/Content Calendar/Publishing Pipeline/Growth Copywriter, real delete/refresh/search actions -- all left completely untouched. Found two genuine, real gaps rather than inventing a redesign: (1) "Connect Accounts" was one of the plainly-named main actions this page never had a path to at all -- no link into /app/integrations anywhere on the page. (2) The 3 free branded creatives (capability:audit_three_free_branded_creatives) were not surfaced here even though app/app/content/page.tsx''s loadImageGenerationCreatives already queries image_generation_jobs with no sourceContext filter, so those exact jobs were already silently present in the "Creatives & Posters" tab -- just not immediately visible without navigating/filtering. Fixed both: added a "Connect Accounts" link (header actions row) to /app/integrations, and rendered the EXACT SAME FreeCreativesPanel component (from the audit report, capability:audit_three_free_branded_creatives) prominently right after the header, before the Quick Navigation Cards -- never a second/duplicated creative-generation implementation.',
  'content',
  'Engineering',
  'N/A (customer-facing UI, not a Hermes/agent tool)',
  'read',
  'tenant',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean (2 pre-existing <img> warnings at lines far from this change, confirmed via git diff --stat showing additions only). Real NODE_ENV=production build exits 0. All 3 pre-existing tests referencing ContentLibraryClient.tsx (no-fabricated-published-example.test.ts, content-library-filtering-brand-assets.test.ts, customer-app-bugfixes-polish.test.ts) pass completely unmodified -- proof nothing existing broke. New app/app/content/__tests__/content-simplification.test.ts locks in: the Connect Accounts link''s real href, that FreeCreativesPanel is imported and actually rendered (not just imported), and that the existing tabs/Creative Studio/Ask Assistant links all still exist.',
  'REAL_EXPOSED',
  'Deliberately conservative scope: the 7-tab category system, delete flows, and all other existing controls were left exactly as-is rather than attempting a full navigational redesign within this pass -- "hide advanced controls unless required" was interpreted as "do not add new clutter," not as "restructure a large, already-working, already-tested component," given the explicit instruction to never remove existing underlying functionality merely to simplify the UI.',
  now(),
  'claude_session_2026-09-09'
);
