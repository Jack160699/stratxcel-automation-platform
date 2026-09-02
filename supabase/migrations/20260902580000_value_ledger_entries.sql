-- Fixes ValueLedgerService (lib/reporting/value-ledger.ts) from an
-- in-memory array to real, Postgres-backed persistence -- found unwired
-- during the final rescan (Update 60). Every method was already async, so
-- no caller signature changed, only the storage backend. Applied live via
-- Supabase MCP on 2026-09-02; this file makes the table reproducible from
-- a fresh database.

create table if not exists public.value_ledger_entries (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_month text not null,
  plan_id uuid,
  service_key text not null,
  mission_id uuid,
  deliverable_title text not null,
  deliverable_summary text not null,
  artifact_ref text,
  result_metric text,
  result_value text,
  customer_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_value_ledger_entries_tenant_cycle on public.value_ledger_entries(tenant_id, cycle_month);

alter table public.value_ledger_entries enable row level security;
grant select, insert on public.value_ledger_entries to service_role;
revoke all on public.value_ledger_entries from public, anon, authenticated;
