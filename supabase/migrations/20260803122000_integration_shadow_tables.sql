-- Shadow-mode storage for the WhatsApp/Razorpay/CRM migration boundary.
-- These tables exist so lib/integrations adapters have somewhere real to
-- write to in "shadow" mode (record what would have happened) without ever
-- calling a live provider. They are new, empty, tenant-scoped tables —
-- entirely separate from whatever ai-automation-system's own database uses,
-- so this migration cannot collide with or affect the legacy system.

create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null check (source in ('whatsapp', 'website_form', 'manual', 'import')),
  contact_name text,
  contact_phone text,
  contact_email text,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table crm_leads enable row level security;
create index if not exists crm_leads_tenant_idx on crm_leads (tenant_id, created_at desc);
create policy crm_leads_tenant_read on crm_leads for select
  using (exists (select 1 from tenant_members m where m.tenant_id = crm_leads.tenant_id and m.user_id = (select auth.uid())));

create table if not exists whatsapp_shadow_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid references crm_leads(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound_shadow')),
  body text not null,
  would_send boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table whatsapp_shadow_messages enable row level security;
create index if not exists whatsapp_shadow_tenant_idx on whatsapp_shadow_messages (tenant_id, created_at desc);
create policy whatsapp_shadow_tenant_read on whatsapp_shadow_messages for select
  using (exists (select 1 from tenant_members m where m.tenant_id = whatsapp_shadow_messages.tenant_id and m.user_id = (select auth.uid())));

-- Razorpay orders created via the TEST key pair only (enforced in
-- lib/integrations/razorpay's adapter, not by this table) get recorded
-- here so wallet ledger reconciliation can be tested end-to-end before any
-- live key ever touches this codebase.
create table if not exists payment_shadow_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null default 'razorpay_test',
  provider_order_id text,
  amount_cents bigint not null,
  currency text not null default 'INR',
  status text not null default 'CREATED' check (status in ('CREATED', 'PAID', 'FAILED', 'CANCELLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table payment_shadow_orders enable row level security;
create index if not exists payment_shadow_orders_tenant_idx on payment_shadow_orders (tenant_id, created_at desc);
create policy payment_shadow_orders_tenant_read on payment_shadow_orders for select
  using (exists (select 1 from tenant_members m where m.tenant_id = payment_shadow_orders.tenant_id and m.user_id = (select auth.uid())));

grant select, insert, update, delete on crm_leads, whatsapp_shadow_messages, payment_shadow_orders to service_role;
grant select on crm_leads, whatsapp_shadow_messages, payment_shadow_orders to authenticated;
