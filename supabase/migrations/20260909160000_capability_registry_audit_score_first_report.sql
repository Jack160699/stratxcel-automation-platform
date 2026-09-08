-- Registers the score-first audit report redesign (Final Customer
-- Experience Repair mission, Section 1) and a real signal-extraction bug
-- fix found while building it. Applied live via Supabase MCP; this file
-- makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:audit_report_score_first_summary',
  'Free Audit report opens with a score-first summary (overall score + 8 collapsed category cards) instead of a long-form technical dump',
  'Final Customer Experience Repair, Section 1: "a local business owner can understand it in seconds." Investigated the existing report (app/app/audit/VisualAuditReport.tsx, 995 lines) and found real, already-populated data that was never rendered anywhere: packages/audit-engine/src/live.ts''s own structured-output JSON schema already REQUIRES categoryScores (8 real categories: brandPositioning, websiteConversion, discoverabilitySeo, socialContent, leadGeneration, trustReputation, customerJourney, automationOperations -- each with a real score 0-100, an explanation, and evidenceSourceIds) and findings on every audit the engine produces. New components/audit/ScoreFirstReport.tsx renders these as the default view immediately after the report header: the overall score as a radial + label, then each category collapsed by default showing a score badge; opening one shows 2-4 key-finding bullets (a pure sentence-boundary split of that category''s own real explanation text -- never a paraphrase, never new wording) with "Read more" revealing the rest. A missing score/explanation renders an honest "not enough data yet" state, never a fabricated number. The existing long-form report (executive summary, GSC/GA4 performance tables, competitor analysis, technical SEO detail, top 5 actions, recommended service) is fully preserved byte-for-byte -- nothing deleted -- just moved behind a new "See full technical report" toggle, collapsed by default.',
  'audit',
  'Engineering',
  'N/A (customer-facing report UI, not a Hermes/agent tool)',
  'read',
  'tenant',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean, real NODE_ENV=production build exits 0. All 3 pre-existing regression-guard tests that assert on VisualAuditReport.tsx''s source (audit-v1-experience.test.ts, audit-ux-completion.test.ts, customer-product-completion.test.ts) pass unmodified. New lib/audit/__tests__/score-first-report.test.ts locks in: all 8 real categories rendered (no more, no fewer); every card and the deeper explanation start collapsed; the sentence-split is a real string operation on real explanation text, not a template/LLM call; the existing long-form sections are still present verbatim, just gated behind showFullReport (starts false).',
  'REAL_EXPOSED',
  'A second, related fabrication bug was found and fixed in the same file while redesigning it: a hardcoded, specific-sounding paragraph ("has established foundational domain presence...") rendered as if it were the business''s own real executive summary whenever report.executiveSummary was empty -- replaced with an honest empty state. See the companion capability:audit_plan_recommendation_real_signals row for the deriveSignalsFromReport fix.',
  now(),
  'claude_session_2026-09-09'
),
(
  'capability:audit_plan_recommendation_real_signals',
  'The audit report''s recommended-service logic (deriveSignalsFromReport) now reads the real AuditDeliveryReport shape instead of nonexistent fields',
  'Found while building the score-first redesign above. lib/audit/plan-recommendation.ts''s deriveSignalsFromReport fed recommendPlan/evaluateAuditScenario (the "Recommended service" section''s own scenario logic, and the biggest-opportunity headline) -- but every field it read (report.connectors, report.discoverability, report.socialPresence, report.competitors, report.contentOpportunities, report.presenceLinks, report.websiteHealth, report.reputation, report.keyFindings) does not exist anywhere on the real AuditDeliveryReport the audit engine actually produces. Every signal silently evaluated to null/0/false, so evaluateAuditScenario always fell back to its neutral 50/50 default regardless of the tenant''s real audit findings -- this function had zero test coverage (the existing plan-recommendation.test.ts only ever exercises recommendPlan/evaluateAuditScenario directly with hand-built signal objects, never through this real extraction step). Fixed to read the report''s real fields: categoryScores.{discoverabilitySeo,socialContent,websiteConversion,trustReputation}.score, connectorAvailability, whyTheyWin, contentCoverage.{missingServices,missingLocations,weakPages}, findings (impact === "HIGH"), websiteUrl.',
  'audit',
  'Engineering',
  'N/A (audit report business logic, not a Hermes/agent tool)',
  'read',
  'tenant',
  'free',
  'low_mutation',
  'New real-data test added to lib/audit/__tests__/plan-recommendation.test.ts: a hand-built, realistically-shaped AuditDeliveryReport object confirms every derived signal now reads its real corresponding field (not the old nonexistent ones), plus an empty-report case confirming it degrades to null/0/false honestly rather than throwing. All 5 existing Scenario A-E assertions (which call recommendPlan/evaluateAuditScenario directly, bypassing this function) remain unaffected and still pass -- this fix only changes what real report data actually reaches those functions.',
  'REAL_EXPOSED',
  'This closes a genuine analytical-accuracy gap for every audit generated going forward; it does not retroactively recompute the recommended-service section for any already-delivered report (those were rendered once and are not regenerated).',
  now(),
  'claude_session_2026-09-09'
);
