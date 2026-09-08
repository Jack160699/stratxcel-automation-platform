-- Registers the WhatsApp audit-delivery simplification and a real
-- client/server payload-shape bug fix (Final Customer Experience Repair
-- mission, Section 3). Applied live via Supabase MCP; this file makes it
-- reproducible from a fresh database.

insert into public.capability_registry (
  capability_key, name, description, category, department,
  agent_tool_name, read_write, tenant_scope, cost_profile, risk, verification_method,
  status, status_notes, last_verified_at, last_verified_by
) values (
  'capability:audit_whatsapp_send_direct',
  'Send Audit to WhatsApp is a direct action when already connected -- no extra choice/dialog -- and a real client/server payload-shape bug is fixed',
  'Final Customer Experience Repair, Section 3: remove the unnecessary "Send audit to WhatsApp" choice; make it a direct, simple action when WhatsApp is available. Investigated app/app/audit/AuditHubClient.tsx: clicking the header''s "Send to WhatsApp" always opened a Modal, even when a destination was already known (waMasked truthy) -- an unnecessary extra step. Fixed: onWhatsApp now calls handleSendWhatsApp() directly (no payload, no dialog) when waMasked is already set; the dialog now only opens for genuine first-time number entry. Real bug found and fixed in the same flow: handleSendWhatsApp POSTed a FLAT {nationalNumber, countryIso, consent} body to /api/platform/audit/report/whatsapp, but that route only ever reads a NESTED body.destination.nationalNumber -- so body.destination was always undefined server-side regardless of what the customer typed. A brand-new customer entering their WhatsApp number for the very first time here had that number silently dropped every time, always falling through to the route''s "use existing stored destination" branch, which correctly returned NO_DESTINATION since none existed yet -- meaning first-time number entry through this exact screen has never actually worked. Fixed the client to send the real nested shape the route already expects; the new direct-send path (an omitted payload) correctly reuses the route''s own pre-existing existing-destination fallback with zero server changes needed.',
  'audit',
  'Engineering',
  'N/A (customer-facing UI, not a Hermes/agent tool)',
  'read_write',
  'tenant',
  'free',
  'low_mutation',
  'tsc --noEmit clean, lint clean, real NODE_ENV=production build exits 0. Existing lib/audit/__tests__/audit-v1-experience.test.ts (source-checks on both the route and AuditHubClient/VisualAuditReport) passes unmodified. New lib/audit/__tests__/whatsapp-send-simplification.test.ts locks in: the direct-send trigger when already connected; the removed two-choice (number/consent) dialog state; the fixed nested destination payload shape (compared directly against the route''s own body.destination?.nationalNumber read); that the route''s existing-destination fallback branch is still in place for the empty-body direct-send case; that first-time setup still sends the real typed destination unchanged.',
  'REAL_EXPOSED',
  'Section 6 (WhatsApp country-code UX) was verified as part of this same investigation and left unchanged -- already defaults to India (WHATSAPP_CALLING_COUNTRIES lists it first; initialData falls back to "IN"), already lets the customer type only the national number, already allows changing the country. No real gap found there.',
  now(),
  'claude_session_2026-09-09'
);
