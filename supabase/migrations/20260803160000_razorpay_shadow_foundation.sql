-- Razorpay shadow foundation: idempotent webhook event storage (replay
-- protection), a payment state machine, and a refunds model. Additive
-- only. Live order creation, live payment-link creation, and webhook
-- settlement all stay code-disabled (see packages/payments-and-wallet's
-- RAZORPAY_INTEGRATION_MODE gate) regardless of what this migration adds —
-- this only builds the data model, it does not turn anything on.

create table if not exists razorpay_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table razorpay_webhook_events enable row level security;
create index if not exists razorpay_webhook_events_type_idx on razorpay_webhook_events (event_type, created_at desc);
-- No tenant-scoped read policy: a webhook event isn't yet known to belong
-- to a tenant until processed (the payment record it references carries
-- tenant_id) — this table is an ops/audit surface, service_role only.

create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  amount_cents bigint not null,
  currency text not null default 'INR',
  state text not null default 'CREATED' check (state in (
    'CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'
  )),
  mode text not null default 'test' check (mode in ('test', 'live')),
  reference_type text,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table payment_orders enable row level security;
create index if not exists payment_orders_tenant_idx on payment_orders (tenant_id, created_at desc);
create unique index if not exists payment_orders_provider_order_idx on payment_orders (provider, provider_order_id) where provider_order_id is not null;
create policy payment_orders_tenant_read on payment_orders for select
  using (exists (select 1 from tenant_members m where m.tenant_id = payment_orders.tenant_id and m.user_id = (select auth.uid())));

create table if not exists payment_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  payment_order_id uuid not null references payment_orders(id) on delete cascade,
  provider_refund_id text,
  amount_cents bigint not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSED', 'FAILED')),
  reason text,
  requested_by uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table payment_refunds enable row level security;
create index if not exists payment_refunds_tenant_idx on payment_refunds (tenant_id, created_at desc);
create policy payment_refunds_tenant_read on payment_refunds for select
  using (exists (select 1 from tenant_members m where m.tenant_id = payment_refunds.tenant_id and m.user_id = (select auth.uid())));

grant select, insert, update, delete on razorpay_webhook_events, payment_orders, payment_refunds to service_role;
grant select on payment_orders, payment_refunds to authenticated;
