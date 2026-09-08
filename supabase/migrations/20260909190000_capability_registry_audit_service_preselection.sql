-- Registers the audit service auto-preselection feature (Final Customer
-- Experience Repair mission, Section 4). Applied live via Supabase MCP;
-- this file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:audit_service_auto_preselection',
  '"What do you need help with?" is pre-checked from the audit''s real category scores, reusing the existing goal vocabulary -- never forced, never a generic industry guess',
  'Final Customer Experience Repair, Section 4: weak Google presence -> Google Growth selected; poor website -> Website selected; poor content -> Social Content selected; weak lead handling -> Lead Generation selected -- user can always deselect, never forced, never recommended without real audit support. Reuses the existing "what does this business want help with" vocabulary (app/app/onboarding/steps/StepGoals.tsx''s BUSINESS_GOALS: local_customers, google_visibility, whatsapp_leads, social_presence, website_conversion, lead_followup) rather than inventing a second, parallel services taxonomy -- mirrored (not imported, to avoid a server route importing a "use client" component) into new lib/audit/business-goal-keys.ts. New lib/audit/service-preselection.ts (pure function, real test coverage) maps the audit engine''s real 8 categoryScores keys to that vocabulary: discoverabilitySeo->google_visibility, websiteConversion->website_conversion, socialContent->social_presence, leadGeneration->lead_followup, trustReputation->local_customers, automationOperations->whatsapp_leads. brandPositioning and customerJourney have no honest 1:1 match among the 6 real goal keys, so a weak score there recommends nothing rather than forcing a bad-fit suggestion. The weak-score threshold (score < 70) matches components/audit/ScoreFirstReport.tsx''s own "Strong" band cutoff exactly, so a category shown there as anything other than Strong is always among the recommendations here -- the two surfaces can never silently disagree. New /api/platform/audit/report/interested-services route reuses ownedCompletedAudit (the same real ownership/completion gate app/api/platform/audit/report/whatsapp/route.ts already uses) and persists the selection into the EXISTING audit_orders.goals_answers JSONB column (already used by the pre-audit intake flow) under a new key, rather than a new table -- validating every submitted key against the real bounded vocabulary before writing, never trusting an arbitrary client-supplied string. New ServicePreselectionPanel.tsx renders on the audit report right after the score-first summary, before the free creatives; every option stays individually toggleable.',
  'audit',
  'Engineering',
  'N/A (customer-facing UI + a lead-qualification signal, not a Hermes/agent tool)',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean, real NODE_ENV=production build exits 0. New lib/audit/__tests__/service-preselection.test.ts directly tests recommendGoalKeysFromCategoryScores (a pure function, real coverage, not source-regex): no data / all-strong categories recommend nothing; the mission''s own 3 worked examples (weak Google presence, weak website, weak lead handling) each produce exactly the right single key; multiple real weak categories produce multiple real recommendations, never everything; a null score (not enough evidence) never recommends; the two categories with no honest goal-key match never force a bad-fit suggestion even when weak; the weak-score threshold is confirmed to literally match ScoreFirstReport''s own "Strong" cutoff string. Source-level checks confirm the route reuses the real ownership gate, validates against the real bounded vocabulary, and merges (never overwrites) the existing goals_answers JSONB; and that the panel keeps every option toggleable.',
  'REAL_EXPOSED',
  'Persisted selection is a lead-qualification signal for a human/sales follow-up to act on -- this pass does not build any automated action that reads interestedServices back out and does something with it (e.g. auto-recommending a specific plan at checkout); that would be a separate, real integration task.',
  now(),
  'claude_session_2026-09-09'
);
