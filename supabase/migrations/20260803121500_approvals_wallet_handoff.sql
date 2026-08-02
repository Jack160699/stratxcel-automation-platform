-- Approvals: content/spend/action that requires a human sign-off before
-- Hermes (or a scheduled automation) is allowed to proceed.
create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid references missions(id) on delete cascade,
  kind text not null check (kind in ('content_publish', 'spend', 'deploy', 'other')),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  subject jsonb not null default '{}'::jsonb,
  requested_by text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table approvals enable row level security;
create index if not exists approvals_tenant_idx on approvals (tenant_id, status, created_at desc);
create policy approvals_tenant_read on approvals for select
  using (exists (select 1 from tenant_members m where m.tenant_id = approvals.tenant_id and m.user_id = (select auth.uid())));

-- Wallet: one balance-bearing account per tenant, funded by an immutable
-- ledger. wallet_accounts.balance_cents is a cache recomputed from
-- wallet_ledger_entries by application code on every write inside the same
-- transaction — never edited directly by client code — so the ledger stays
-- the source of truth and the balance column stays fast to read.
create table if not exists wallet_accounts (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  balance_cents bigint not null default 0,
  currency text not null default 'INR',
  updated_at timestamptz not null default now()
);
alter table wallet_accounts enable row level security;

create table if not exists wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entry_type text not null check (entry_type in ('credit_purchase', 'credit_bonus', 'reservation', 'reservation_release', 'debit_usage', 'refund', 'adjustment')),
  amount_cents bigint not null,
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table wallet_ledger_entries enable row level security;
create index if not exists wallet_ledger_tenant_idx on wallet_ledger_entries (tenant_id, created_at desc);

create policy wallet_accounts_tenant_read on wallet_accounts for select
  using (exists (select 1 from tenant_members m where m.tenant_id = wallet_accounts.tenant_id and m.user_id = (select auth.uid())));
create policy wallet_ledger_tenant_read on wallet_ledger_entries for select
  using (exists (select 1 from tenant_members m where m.tenant_id = wallet_ledger_entries.tenant_id and m.user_id = (select auth.uid())));

-- Human handoff: full context snapshot so a human agent (or the customer,
-- on return) never needs to reconstruct "what was Hermes trying to do."
create table if not exists human_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid references missions(id) on delete cascade,
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'RETURNED_TO_MISSION')),
  context_snapshot jsonb not null default '{}'::jsonb,
  assigned_to uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table human_handoffs enable row level security;
create index if not exists human_handoffs_tenant_idx on human_handoffs (tenant_id, status);
create policy human_handoffs_tenant_read on human_handoffs for select
  using (exists (select 1 from tenant_members m where m.tenant_id = human_handoffs.tenant_id and m.user_id = (select auth.uid())));

grant select, insert, update, delete on approvals, wallet_accounts, wallet_ledger_entries, human_handoffs to service_role;
grant select on approvals, wallet_accounts, wallet_ledger_entries, human_handoffs to authenticated;
