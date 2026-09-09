-- Revenue Missions (Revenue Company OS)
-- First-class revenue objectives linked to offers and the missions system.
-- Applied 2026-09-09.

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

  kpis_json jsonb not null default ''[]''::jsonb,
  pipeline_json jsonb not null default ''[]''::jsonb,
  next_actions_json jsonb not null default ''[]''::jsonb,

  revenue_cents bigint not null default 0,
  costs_cents bigint not null default 0,
  margin_pct numeric,

  current_state text not null default ''PLANNING''
    check (current_state in (''PLANNING'', ''RESEARCHING'', ''ACQUIRING'', ''QUALIFYING'', ''SELLING'', ''FULFILLING'', ''EVALUATING'', ''COMPLETED'', ''PAUSED'')),

  status text not null default ''active''
    check (status in (''active'', ''paused'', ''completed'', ''cancelled'')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_revenue_missions_tenant
  on public.revenue_missions(tenant_id, status, created_at desc);
create index if not exists idx_revenue_missions_offer
  on public.revenue_missions(offer_id) where offer_id is not null;

alter table public.revenue_missions enable row level security;
grant select, insert, update on public.revenue_missions to service_role;
revoke all on public.revenue_missions from public, anon, authenticated;

comment on table public.revenue_missions is
  ''First-class revenue objectives. Hermes CEO orchestrates plan → leads → sales → revenue loop.'';
