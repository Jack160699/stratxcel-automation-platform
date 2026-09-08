-- Registers the fix for a CRITICAL LIVE production bug (Final Customer
-- Experience Repair & Product Simplification, Sections 1-4): selecting
-- Business A, going back, and selecting a different Business B kept
-- showing/loading Business A throughout the rest of onboarding. Applied
-- live via Supabase MCP; this file makes it reproducible from a fresh
-- database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:onboarding_business_selection_replaceable',
  'Onboarding business selection is fully replaceable -- selecting a new business completely supersedes the previous one, with stale-request protection',
  'Live bug reported by Anupurna Tripathi: searched/selected "Credit C", analysis ran, went back, selected a different company -- the system kept showing/loading Credit C. Two independent real causes found and fixed in app/app/onboarding/OnboardingWizard.tsx and steps/StepBusiness.tsx. (1) Server-echo bug, the same pattern as the earlier MedRoute industry fix (capability:onboarding_industry_user_provenance) found again here: startDiscovery/selectGooglePlace unconditionally sent existingDraft.businessName/location, echoing back whatever was currently in those fields even a stale auto-fill from a previous business; synthesizeOnboardingBusinessIntelligence treats a non-empty existingDraft.businessName/location as USER_PROVIDED, confidence 1.0, unconditionally beating the newly selected business''s own real Google/website data -- fixed by only sending them when userEditedFields.name/location is real. (2) Client-side stickiness: applySynthesizedIntelligence''s merge used "never overwrite once set" for name/industry/location/website -- correct for protecting a genuine customer edit, wrong for a value the ENGINE itself auto-filled for the previous business, which then permanently blocked the new business''s data -- fixed by gating each on userEditedFields (extended updateBusiness to accept {userEdited:false} for automatic/non-customer reflections: Google-discovered website, maps-link-derived name, so they never wrongly lock a field). (3) New stale-request protection: discoverySequenceRef gives every discovery call a real identity -- a slower response from an earlier selection can never overwrite a newer one regardless of network arrival order; both entry points also reset every non-user-edited business field synchronously BEFORE their own network call, so the old business visibly disappears the instant a new selection begins instead of lingering until the new one resolves. selectGooglePlace''s superseded call now returns a distinct signal; selectSuggestion (StepBusiness.tsx) treats it as a silent no-op, never a false "failed" error for a request the customer already moved past.',
  'onboarding',
  'Engineering',
  'N/A (customer onboarding UI, not a Hermes/agent tool)',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean (2 pre-existing unrelated warnings confirmed via git stash), real NODE_ENV=production build exits 0. Existing app/app/onboarding/__tests__/business-intelligence-synthesis.test.ts (server-side synthesis, untouched) and onboarding-wizard.test.ts both pass, with new regression assertions locking in: resetNonUserEditedBusiness exists and is called synchronously before the network call in both entry points; discoverySequenceRef is minted and checked at every point a response could otherwise mutate state; existingDraft.businessName/location is gated on userEditedFields at both call sites (2 occurrences, 0 of the old unconditional-echo pattern); name/location/website merge lines in applySynthesizedIntelligence are each gated on a real user-edit flag while still able to take a fresh intel value; googleMapsUrl is confirmed to never be gated (it identifies which business is selected, not incidental content); a superseded result is confirmed to be a silent no-op in selectSuggestion, never surfaced as a failure.',
  'REAL_EXPOSED',
  'Brand-step fields (offers/description/audience) were deliberately left un-reset -- this codebase has no per-field edit-provenance tracking for Brand (only business.userEditedFields), so clearing them on a new business selection risked discarding real copy the customer may have already typed into StepBrand.tsx before going back. Out of scope for this pass; a future pass adding Brand-field edit tracking could close this narrower remaining gap safely. LIVE-VERIFIED on production (commit 626954d, stratxcel.in) immediately after deploy: cleared onboarding state, selected Business A (Barbeque Nation, Raipur -- name/Food & Dining industry/mall address, no website), clicked Change, searched and selected a completely different Business B (MedRoute Consultancy) -- every field correctly and completely replaced (name, industry, address, website, googleMapsUrl all now MedRoute''s own real data, zero trace of Barbeque Nation anywhere in the rendered form or the underlying draft state, confirmed by inspecting the actual persisted draft object).',
  now(),
  'claude_session_2026-09-09'
);
