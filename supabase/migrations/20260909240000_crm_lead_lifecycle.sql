-- CRM Lead Lifecycle (Revenue Company OS)
-- Expands crm_leads.status to full lifecycle, adds provenance fields,
-- and creates crm_lead_events for immutable audit trail.
-- Applied 2026-09-09.

-- Step 1: Drop old status CHECK constraint
alter table public.crm_leads
  drop constraint if exists crm_leads_status_check;

-- Step 2: Migrate existing NEW rows to DISCOVERED
update public.crm_leads set status = ''DISCOVERED'' where status = ''NEW'';

-- Step 3: Add new constraint with full lifecycle
alter table public.crm_leads
  add constraint crm_leads_status_check
  check (status in (
    ''DISCOVERED'', ''ENRICHED'', ''VERIFIED'', ''QUALIFIED'',
    ''CONTACTED'', ''RESPONDED'', ''INTERESTED'', ''PROPOSAL'',
    ''WON'', ''LOST''
  ));

-- Step 4: Widen source CHECK to include hermes_research
alter table public.crm_leads
  drop constraint if exists crm_leads_source_check;
alter table public.crm_leads
  add constraint crm_leads_source_check
  check (source in (
    ''whatsapp'', ''website_form'', ''manual'', ''import'',
    ''whatsapp_outreach'', ''hermes_research''
  ));

-- Step 5: Add provenance and revenue fields
alter table public.crm_leads
  add column if not exists source_url text,
  add column if not exists company_name text,
  add column if not exists designation text,
  add column if not exists market_segment text,
  add column if not exists icp_match_score integer check (icp_match_score between 0 and 100),
  add column if not exists confidence text default ''UNKNOWN''
    check (confidence in (''UNKNOWN'', ''LOW'', ''MEDIUM'', ''HIGH'', ''VERIFIED'')),
  add column if not exists offer_id uuid references public.company_offers(id) on delete set null,
  add column if not exists revenue_mission_id uuid references public.revenue_missions(id) on delete set null,
  add column if not exists last_outreach_at timestamptz,
  add column if not exists proposal_amount_cents bigint;

-- Step 6: Lead events table (immutable audit trail of every lifecycle transition)
create table if not exists public.crm_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default ''{}''::jsonb,
  actor_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_lead_events_lead
  on public.crm_lead_events(lead_id, created_at desc);
create index if not exists idx_crm_lead_events_tenant
  on public.crm_lead_events(tenant_id, created_at desc);

alter table public.crm_lead_events enable row level security;
grant select, insert on public.crm_lead_events to service_role;
revoke all on public.crm_lead_events from public, anon, authenticated;

comment on table public.crm_lead_events is
  ''Immutable audit trail of every CRM lead lifecycle transition. Written by agents; never updated.'';
