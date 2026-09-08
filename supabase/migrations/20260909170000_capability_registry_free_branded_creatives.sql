-- Registers the three-free-branded-creatives giveaway (Final Customer
-- Experience Repair mission, Section 2). Applied live via Supabase MCP;
-- this file makes it reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:audit_three_free_branded_creatives',
  'Three real branded creatives are generated free after the audit, reusing Creative Studio''s own canonical generation pipeline -- no second creative engine',
  'Final Customer Experience Repair, Section 2: show, don''t tell, what StratXcel can produce, using the customer''s actual brand identity, without requiring a subscription. Investigated the existing creative-generation surface first (lib/social/package-autopilot.ts''s Social Autopilot subscription/queue system, app/api/platform/social/autopilot/manual-generate/route.ts, app/api/platform/image-generations/route.ts). Found that manual-generate''s pathway is deliberately gated to paying subscribers (resolveManualRouting returns NO_SUBSCRIPTION for any tenant with no active plan), but Creative Studio''s own route (image-generations) uses a DIFFERENT, already-free-tier-compatible path: createImageGenerationJob''s own attempt-limit enforcement already grants "Free: 3 image attempts/month" to any unsubscribed tenant, with zero new grant/entitlement infrastructure needed. New lib/audit/free-creatives-briefs.ts (pure, real Brand Brain data only) builds exactly 3 distinct briefs -- Business & Brand, Service & Offer (or an honest "What We Do" framing when no real service exists yet, never inventing one), Educational & Engagement (a general industry tip, never a specific claim about the business) -- from getCanonicalBrandContext (business name, industry, description, real services, real logo/color hints already carried by Brand Brain). lib/audit/free-creatives.ts orchestrates 3 real calls through generateStudioCreativeTreatment + createImageGenerationJob + processImageGenerationJob (sourceContext "creative_studio", the exact same functions Creative Studio''s own route calls), each with a stable per-slot idempotency key so a reload never burns a second real generation. New FreeCreativesPanel.tsx renders on the audit report right after the score-first summary: a single CTA to generate, real per-job progress (never a fabricated "ready" state while a job is still queued/running), then Download + "Connect accounts & auto-post" (linking into the existing connectors flow) once each is READY.',
  'audit',
  'Engineering',
  'N/A (customer-facing feature, not a Hermes/agent tool)',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean, real NODE_ENV=production build exits 0. New lib/audit/__tests__/free-creatives.test.ts directly tests buildFreeCreativeBriefs (a pure function, real coverage, not source-regex): no business name yields zero briefs; every brief references the real business name; the offer brief explicitly forbids inventing a service when none exists and uses a real one verbatim when one does; the educational brief is confirmed to never make a specific claim about the business. Source-level checks confirm the orchestration imports Creative Studio''s own treatment generator, uses sourceContext "creative_studio" (never "social_autopilot", the subscription-gated path), and that the panel only reports "ready" once every real job is actually terminal.',
  'REAL_EXPOSED',
  'The route/orchestration/panel could not be exercised via a live real generation within this pass (a real Gemini/image-provider call, cost/latency, and a completed real Brand Brain are all required) -- covered by direct unit tests on the pure logic plus source-level verification of the wiring instead. "Already claimed" derives from real job history rather than a dedicated flag, so a tenant who fails all 3 generations (e.g. a transient provider outage) could in principle retry within the same free-tier monthly window since their idempotency keys are stable per slot -- this is intentional (a legitimate retry should not look like a second giveaway) but is worth a live check once a real audit-to-creatives flow is walked end-to-end.',
  now(),
  'claude_session_2026-09-09'
);
