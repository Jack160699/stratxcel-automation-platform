-- Spreadsheet Operations Log (Revenue Company OS)
-- Every spreadsheet read/write is logged. Never claim success without a verified write.
-- Applied 2026-09-09.

create table if not exists public.spreadsheet_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,

  operation_type text not null check (operation_type in (''read'', ''write'', ''append'')),
  target text not null check (target in (
    ''lead_pipeline'', ''kpi_tracker'', ''content_calendar'', ''revenue_pipeline'', ''custom''
  )),
  rows_affected integer,
  provider text not null default ''local_xlsx''
    check (provider in (''local_xlsx'', ''google_sheets'')),

  file_ref text,
  sheet_id text,

  status text not null check (status in (''success'', ''failed'', ''skipped'')),
  error text,
  executed_by text,

  created_at timestamptz not null default now()
);

create index if not exists idx_spreadsheet_ops_tenant
  on public.spreadsheet_operations(tenant_id, created_at desc);

alter table public.spreadsheet_operations enable row level security;
grant select, insert on public.spreadsheet_operations to service_role;
revoke all on public.spreadsheet_operations from public, anon, authenticated;

comment on table public.spreadsheet_operations is
  ''Audit log of every spreadsheet operation. Status is truthful: success only if write confirmed.'';
