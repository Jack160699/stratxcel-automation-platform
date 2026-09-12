-- Company Offer Catalog (Revenue Company OS)
-- First-class catalog of products/services the company sells.
-- Founders register offers; Hermes never invents product facts.
-- Applied 2026-09-09 as part of the Autonomous Revenue Company OS build.

create table if not exists public.company_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  -- Core identity
  name text not null,
  description text not null,
  category text not null,
  status text not null default ''draft''
    check (status in (''draft'', ''active'', ''archived'')),

  -- Market
  target_customer text,
  geography text[],

  -- Financials
  pricing_json jsonb not null default ''{}''::jsonb,
  cost_json jsonb not null default ''{}''::jsonb,
  gross_margin_pct numeric,
  commission_pct numeric,
  sales_cycle_days integer,
  capacity integer,

  -- Sales
  eligibility text,
  approved_claims text[],
  sales_pitch text,
  objections_json jsonb not null default ''[]''::jsonb,
  fulfillment_process text,
  payment_methods text[],
  landing_page_url text,
  lead_qualification_criteria text,
  responsible_department text,

  -- Audit
  created_by uuid,
  source text not null default ''founder''
    check (source in (''founder'', ''hermes_suggested'', ''imported'')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_offers_tenant_status
  on public.company_offers(tenant_id, status);

alter table public.company_offers enable row level security;
grant select, insert, update on public.company_offers to service_role;
revoke all on public.company_offers from public, anon, authenticated;

comment on table public.company_offers is
  ''Canonical product/service catalog. Founders register offers. Hermes never invents product facts.'';
