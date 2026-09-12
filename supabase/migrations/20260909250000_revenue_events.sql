-- Revenue Events (Revenue Company OS)
-- Durable record of every material revenue event. Written on verified outcomes only.
-- Applied 2026-09-09.

create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,

  type text not null check (type in (
    ''lead_qualified'',
    ''proposal_sent'',
    ''deal_won'',
    ''payment_received'',
    ''fulfillment_started'',
    ''fulfillment_completed'',
    ''deal_lost''
  )),

  lead_id uuid references public.crm_leads(id) on delete set null,
  offer_id uuid references public.company_offers(id) on delete set null,
  revenue_mission_id uuid references public.revenue_missions(id) on delete set null,
  mission_id uuid references public.missions(id) on delete set null,

  amount_cents bigint,
  currency text default ''INR'',
  payment_reference text,
  agent_attribution text,

  metadata jsonb not null default ''{}''::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_revenue_events_tenant
  on public.revenue_events(tenant_id, type, created_at desc);
create index if not exists idx_revenue_events_mission
  on public.revenue_events(revenue_mission_id) where revenue_mission_id is not null;
create index if not exists idx_revenue_events_lead
  on public.revenue_events(lead_id) where lead_id is not null;

alter table public.revenue_events enable row level security;
grant select, insert on public.revenue_events to service_role;
revoke all on public.revenue_events from public, anon, authenticated;

comment on table public.revenue_events is
  ''Durable revenue event log. Never fabricated. Written only on verified outcomes.'';
