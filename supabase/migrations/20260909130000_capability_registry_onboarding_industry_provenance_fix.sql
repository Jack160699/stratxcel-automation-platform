-- Registers the fix for a CRITICAL LIVE production bug (Final Production
-- Certification): a real business selected via Google Places ("MedRoute
-- Consultancy") still rendered "Type of Business: SaaS & Technology"
-- after a prior fix (5278713) had already tried to close this class of
-- bug. Root-caused end-to-end against a real production account. Applied
-- live via Supabase MCP; this file makes it reproducible from a fresh
-- database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:onboarding_industry_user_provenance',
  'Onboarding "Type of business" only locks to a value the customer actually chose -- a fresh Google Places category can always overwrite a non-user auto-fill',
  'Live bug: selecting a real Google business (MedRoute Consultancy, a medical-education consultancy) rendered "SaaS & Technology". Traced end-to-end against a real production account (qa-bizdiscovery-...@stratxcel.in, via Supabase auth.users.raw_user_meta_data): its persisted onboarding draft showed industry="SaaS & Technology" AND businessModel="B2B Subscription / Software" (the exact SaaS preset), with a real googleMapsUrl already set -- proving the synthesis engine itself had matched the SaaS preset, which only happens when its own selectedIndustry input was already "SaaS & Technology" (synthesizeOnboardingBusinessIntelligence, lib/intelligence/onboarding-business-intelligence.ts, treats any non-empty selectedIndustry as USER_PROVIDED, confidence 1.0, unconditionally beating a real googlePlaceData.category match). The actual source: draft.business.industry had already been auto-filled once earlier in the same session (a website AI guess, or an earlier business selection) WITHOUT the customer ever touching the dropdown, and both app/app/onboarding/OnboardingWizard.tsx''s discoverFromLinks and selectGooglePlace unconditionally sent `industry: draft.business.industry || undefined` on every subsequent /api/platform/site-discovery/resolve call -- blindly echoing back a non-user value that the server then trusted as an explicit customer choice. A prior fix (commit 5278713) had closed a DIFFERENT feedback path (the server no longer falls back to the website AI''s own guess when no explicit industry is given) but left this one open. Fixed by wiring up userEditedFields (declared on OnboardingDraft but never actually used): updateBusiness now marks every directly-patched key as user-edited -- the only real signal a StepBusiness form control (not an automatic synthesis run) actually set it. Both resolve requests now only send industry when userEditedFields.industry is real; applySynthesizedIntelligence''s own merge gets the same guard so a fresh Google-derived value can still overwrite a previously auto-filled (non-user) industry across multiple selections in one session; persisted server-side (app/api/platform/onboarding/route.ts''s sanitizeDraft, via a new bounded sanitizeUserEditedFields allowlisting only real business-field keys) so the protection survives an autosave/reload round-trip. Enforces the required precedence generically -- explicit user choice > Google Places category > website evidence > website AI inference -- with no MedRoute-specific condition anywhere.',
  'onboarding',
  'Engineering',
  'N/A (customer onboarding UI, not a Hermes/agent tool)',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean (2 pre-existing unrelated warnings confirmed via git stash), real NODE_ENV=production build exits 0. Existing app/app/onboarding/__tests__/business-intelligence-synthesis.test.ts (server-side synthesis, unaffected/untouched) and app/app/onboarding/__tests__/onboarding-wizard.test.ts both pass. New regression assertions added to onboarding-wizard.test.ts: updateBusiness marks patched keys as user-edited; applySynthesizedIntelligence''s industry merge is gated on userEditedFields.industry, not mere non-emptiness, and can still take a fresh intel value; both discoverFromLinks and selectGooglePlace send industry only when userEditedFields.industry is real (exactly 2 occurrences of the fixed pattern, 0 of the old unconditional-echo pattern); userEditedFields is declared on the draft type and actually persisted (not silently dropped) by the PATCH route''s sanitizer. Root cause independently confirmed via a real production account''s persisted onboarding draft (Supabase auth.users), not inferred.',
  'REAL_EXPOSED',
  'Fix is entirely client-request-construction + client-merge-logic; the server-side synthesis function (synthesizeOnboardingBusinessIntelligence) and its own selectedIndustry priority chain were correct already and were not changed. LIVE-VERIFIED on production (commit 027b5a2, stratxcel.in) immediately after deploy, in the exact same real account/session that reproduced the original bug (qa-bizdiscovery-...@stratxcel.in, sessionStorage draft still carrying the stale industry="SaaS & Technology"/userEditedFields={} state): re-selected the real Google Places result for "MedRoute Consultancy" -> Type of business now correctly shows "Professional Services & Consulting" (Google category "Consultant"). Then selected a second, different real business in the same session -- "Barbeque Nation" (Raipur) -- to confirm genericity: Type of business correctly updated to "Food & Dining (Restaurants / Cafes)" (Google category "Barbecue Restaurant"), proving the fix recomputes industry from each fresh selection''s own real Google category rather than being MedRoute-specific.',
  now(),
  'claude_session_2026-09-09'
);
