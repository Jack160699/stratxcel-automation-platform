-- Audit UX completion: cancel leftover Audit emails, store a tenant-scoped
-- CUSTOMER_WHATSAPP_DELIVERY_DESTINATION, and persist truthful WhatsApp
-- outbound evidence. Additive only — no deletes of users/tenants/payments.

-- ============================================================
-- 1. Cancel pending Audit customer emails so they cannot send later
-- ============================================================
update public.email_outbox
set
  status = 'CANCELLED',
  last_error_code = 'AUDIT_EMAIL_REMOVED',
  last_error_safe = 'Audit customer email delivery was removed. This job will never send.',
  lease_owner = null,
  lease_expires_at = null,
  updated_at = now()
where event_type = 'AUDIT_DELIVERED'
  and status in ('PENDING', 'PROCESSING', 'RETRY_WAIT', 'WAITING_CONFIGURATION');

-- ============================================================
-- 2. Customer WhatsApp delivery destination (not a WABA connection)
-- ============================================================
create table if not exists public.audit_whatsapp_destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  lead_id uuid not null references public.crm_leads(id) on delete restrict,
  e164 text not null,
  country_iso text not null,
  national_number text not null,
  consent_opted_in boolean not null default false,
  consent_source text,
  consent_captured_at timestamptz,
  consent_withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint audit_whatsapp_destinations_e164_check check (e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint audit_whatsapp_destinations_country_check check (country_iso ~ '^[A-Z]{2}$')
);

alter table public.audit_whatsapp_destinations enable row level security;

create unique index if not exists audit_whatsapp_destinations_tenant_uidx
  on public.audit_whatsapp_destinations (tenant_id);

create index if not exists audit_whatsapp_destinations_lead_idx
  on public.audit_whatsapp_destinations (lead_id);

drop policy if exists audit_whatsapp_destinations_tenant_read on public.audit_whatsapp_destinations;
create policy audit_whatsapp_destinations_tenant_read
  on public.audit_whatsapp_destinations
  for select
  using (
    exists (
      select 1 from public.tenant_members m
      where m.tenant_id = audit_whatsapp_destinations.tenant_id
        and m.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.audit_whatsapp_destinations to service_role;
grant select on public.audit_whatsapp_destinations to authenticated;
revoke all on public.audit_whatsapp_destinations from public, anon;

comment on table public.audit_whatsapp_destinations is
  'CUSTOMER_WHATSAPP_DELIVERY_DESTINATION — the number a customer asked Stratxcel to send their Audit to. This is not a WABA connection.';

-- ============================================================
-- 3. Truthful WhatsApp outbound evidence on delivery events
-- ============================================================
alter table public.audit_delivery_events
  add column if not exists provider_message_id text,
  add column if not exists outbound_message_id text,
  add column if not exists destination_masked text;

alter table public.audit_delivery_events
  drop constraint if exists audit_delivery_events_status_check;

alter table public.audit_delivery_events
  add constraint audit_delivery_events_status_check
  check (status in (
    'queued',
    'sending',
    'sent',
    'delivered',
    'skipped',
    'failed',
    'not_configured',
    'no_destination',
    'no_consent'
  ));
