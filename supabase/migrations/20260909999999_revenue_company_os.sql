-- =============================================================================
-- STRATXCEL AUTONOMOUS REVENUE COMPANY OS CONSOLIDATED MIGRATION
-- =============================================================================
-- Applied to support autonomous company operations:
-- 1. company_offers: Canonical catalog of products/services
-- 2. revenue_missions: Executive revenue objectives linked to offers & tasks
-- 3. crm_lead_events: Immutable audit trail of lead lifecycle state transitions
-- 4. revenue_events: Verified commercial revenue and payment ledger
-- 5. spreadsheet_operations: Audit log of real Excel/Google Sheets operations
-- =============================================================================

-- 1. COMPANY OFFERS
create table if not exists public.company_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- Core identity
  name text not null,
  description text not null,
  category text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),

  -- Market & Economics
  target_customer text,
  geography text[],
  pricing_json jsonb not null default '{}'::jsonb,
  cost_json jsonb not null default '{}'::jsonb,
  gross_margin_pct numeric,
  commission_pct numeric,
  sales_cycle_days integer,
  capacity integer,

  -- Sales & Delivery
  eligibility text,
  approved_claims text[],
  sales_pitch text,
  objections_json jsonb not null default '[]'::jsonb,
  fulfillment_process text,
  payment_methods text[],
  landing_page_url text,
  lead_qualification_criteria text,
  responsible_department text,

  -- Provenance & Audit
  created_by uuid,
  source text not null default 'founder'
    check (source in ('founder', 'hermes_suggested', 'imported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_offers_tenant_status
  on public.company_offers(tenant_id, status);

alter table public.company_offers enable row level security;
grant select, insert, update, delete on public.company_offers to service_role;
revoke all on public.company_offers from public, anon, authenticated;

comment on table public.company_offers is
  'Canonical product/service catalog. Founders register offers. Hermes never invents product facts.';

-- 2. REVENUE MISSIONS
create table if not exists public.revenue_missions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  offer_id uuid references public.company_offers(id) on delete set null,

  objective text not null,
  target_revenue_cents bigint,
  target_leads integer,
  market text,
  audience text,
  geography text[],
  deadline timestamptz,
  budget_cents bigint,
  assigned_agents text[],

  channels_json jsonb not null default '[]'::jsonb,
  kpis_json jsonb not null default '[]'::jsonb,
  pipeline_json jsonb not null default '[]'::jsonb,
  next_actions_json jsonb not null default '[]'::jsonb,

  revenue_cents bigint not null default 0,
  costs_cents bigint not null default 0,
  margin_pct numeric,

  current_state text not null default 'PLANNING'
    check (current_state in ('PLANNING', 'RESEARCHING', 'ACQUIRING', 'QUALIFYING', 'SELLING', 'FULFILLING', 'EVALUATING', 'COMPLETED', 'PAUSED')),

  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_revenue_missions_tenant
  on public.revenue_missions(tenant_id, status, created_at desc);
create index if not exists idx_revenue_missions_offer
  on public.revenue_missions(offer_id) where offer_id is not null;

alter table public.revenue_missions enable row level security;
grant select, insert, update, delete on public.revenue_missions to service_role;
revoke all on public.revenue_missions from public, anon, authenticated;

comment on table public.revenue_missions is
  'First-class revenue objectives. Hermes CEO orchestrates plan -> leads -> sales -> revenue loop.';

-- 3. CRM LEAD EVENTS (AUDIT LEDGER)
create table if not exists public.crm_lead_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,

  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  actor_agent text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_lead_events_lead
  on public.crm_lead_events(lead_id, created_at asc);
create index if not exists idx_crm_lead_events_tenant
  on public.crm_lead_events(tenant_id, created_at desc);

alter table public.crm_lead_events enable row level security;
grant select, insert on public.crm_lead_events to service_role;
revoke all on public.crm_lead_events from public, anon, authenticated;

comment on table public.crm_lead_events is
  'Immutable audit trail for every lead status transition, outreach touchpoint, and conversion.';

-- 4. REVENUE EVENTS (FINANCIAL LEDGER)
create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  offer_id uuid references public.company_offers(id) on delete set null,

  amount_cents bigint not null,
  currency text not null default 'INR',
  type text not null check (type in ('PAYMENT_RECEIVED', 'INVOICE_ISSUED', 'REFUND_PROCESSED', 'REVENUE_ACCRUED')),
  payment_method text,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  recorded_by text not null default 'finance_recorder',
  created_at timestamptz not null default now()
);

create index if not exists idx_revenue_events_tenant
  on public.revenue_events(tenant_id, created_at desc);

alter table public.revenue_events enable row level security;
grant select, insert on public.revenue_events to service_role;
revoke all on public.revenue_events from public, anon, authenticated;

comment on table public.revenue_events is
  'Verified commercial revenue transactions and payment events. Audited against real ledgers.';

-- 5. SPREADSHEET OPERATIONS
create table if not exists public.spreadsheet_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,

  operation_type text not null check (operation_type in ('write', 'read', 'sync', 'export')),
  target text not null,
  provider text not null default 'local_xlsx',
  rows_affected integer not null default 0,
  file_ref text,
  status text not null check (status in ('success', 'failed', 'skipped')),
  error text,
  executed_by text not null default 'excel_writer',
  created_at timestamptz not null default now()
);

create index if not exists idx_spreadsheet_operations_tenant
  on public.spreadsheet_operations(tenant_id, created_at desc);

alter table public.spreadsheet_operations enable row level security;
grant select, insert on public.spreadsheet_operations to service_role;
revoke all on public.spreadsheet_operations from public, anon, authenticated;

comment on table public.spreadsheet_operations is
  'Audit log of real spreadsheet operations. Only successful writes are logged as success.';
