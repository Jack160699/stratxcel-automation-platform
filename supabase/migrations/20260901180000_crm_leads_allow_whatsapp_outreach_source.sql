-- Widen crm_leads.source to allow 'whatsapp_outreach' -- a lead created by the
-- Boss/staff WhatsApp Agent proactively contacting an external party (sales,
-- partnership, HR, etc.), distinct from 'whatsapp' (an inbound customer/
-- prospect who messaged in first). Additive only: existing values unchanged,
-- no data migration needed. Applied live via Supabase MCP on 2026-09-01;
-- this file makes that change reproducible from a fresh database.
alter table public.crm_leads drop constraint crm_leads_source_check;
alter table public.crm_leads add constraint crm_leads_source_check
  check (source = any (array['whatsapp'::text, 'website_form'::text, 'manual'::text, 'import'::text, 'whatsapp_outreach'::text]));
