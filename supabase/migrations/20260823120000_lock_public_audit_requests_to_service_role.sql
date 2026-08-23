-- Security fix: public_audit_requests was granted broad `authenticated`
-- SELECT/UPDATE with `USING (true)` policies, intended to be "gated at the
-- API/RPC layer for platform admin" — but that app-layer gate never actually
-- existed (app/api/platform/audit-requests/route.ts only checked
-- "is logged in", not platform-staff role), AND even with the app route
-- fixed, any authenticated Supabase user (i.e. any signed-up customer) could
-- read and modify every row directly via PostgREST
-- (`${SUPABASE_URL}/rest/v1/public_audit_requests`) using nothing but their
-- own session JWT and the public anon key, bypassing the Next.js app
-- entirely. This table holds prospect PII (business_name, contact_email,
-- contact_phone, goals, internal_notes, converted_tenant_id) for every
-- visitor who ever submitted the public free-audit form.
--
-- Both API routes that touch this table (app/api/public/audit-requests and
-- app/api/platform/audit-requests) already exclusively use the service-role
-- client, so the `authenticated` grant/policies below serve no legitimate
-- purpose and are simply revoked, matching the service-role-only pattern
-- already used for whatsapp_otp_verifications and business_evidence.

drop policy if exists public_audit_requests_auth_read on public_audit_requests;
drop policy if exists public_audit_requests_auth_update on public_audit_requests;

revoke select, update on public_audit_requests from authenticated;
