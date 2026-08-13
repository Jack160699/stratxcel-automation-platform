-- PII: customer WhatsApp delivery numbers are read only through service_role
-- APIs (masked for customers). Authenticated clients must not SELECT e164.
revoke all on public.audit_whatsapp_destinations from public, anon, authenticated;
grant select, insert, update, delete on public.audit_whatsapp_destinations to service_role;
