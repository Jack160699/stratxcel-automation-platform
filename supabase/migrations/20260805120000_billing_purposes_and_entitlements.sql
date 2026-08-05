-- Migration: Billing Purposes, Audit Orders, Subscriptions, Usage Entitlements and Continuation Packs
-- Enforces purpose-separated payment processing (ONLY wallet_topup grants wallet credits).

-- 1. Add payment_purpose check constraint to payment_links and payment_orders
alter table payment_links
  add column if not exists payment_purpose text not null default 'wallet_topup'
  check (payment_purpose in (
    'audit_fee',
    'subscription_payment',
    'wallet_topup',
    'project_fee',
    'invoice_payment',
    'domain_purchase',
    'domain_renewal',
    'continuation_pack'
  ));

alter table payment_orders
  add column if not exists payment_purpose text not null default 'wallet_topup'
  check (payment_purpose in (
    'audit_fee',
    'subscription_payment',
    'wallet_topup',
    'project_fee',
    'invoice_payment',
    'domain_purchase',
    'domain_renewal',
    'continuation_pack'
  ));

-- 2. Audit Orders table (Business Growth Audit ₹999)
create table if not exists audit_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  business_name text not null,
  industry text,
  website_url text,
  social_links jsonb not null default '[]'::jsonb,
  goals text,
  audit_fee_cents bigint not null default 99900, -- ₹999.00
  payment_link_id uuid references payment_links(id) on delete set null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'in_review', 'completed')),
  credited_towards_subscription_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  credit_expires_at timestamptz not null default (now() + interval '7 days')
);

alter table audit_orders enable row level security;
create index if not exists audit_orders_tenant_idx on audit_orders (tenant_id, created_at desc);
create policy audit_orders_tenant_read on audit_orders for select
  using (exists (select 1 from tenant_members m where m.tenant_id = audit_orders.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on audit_orders to service_role;
grant select on audit_orders to authenticated;

-- 3. Subscriptions table (Launch ₹9499/mo, Growth ₹18999/mo, Custom Growth starting ₹23999/mo)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan_tier text not null check (plan_tier in ('launch', 'growth', 'custom_growth')),
  price_cents bigint not null, -- GST inclusive price in cents
  audit_credit_applied_cents bigint not null default 0,
  audit_order_id uuid references audit_orders(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'past_due', 'paused', 'cancelled')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  paid_months_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;
create index if not exists subscriptions_tenant_idx on subscriptions (tenant_id, created_at desc);
create policy subscriptions_tenant_read on subscriptions for select
  using (exists (select 1 from tenant_members m where m.tenant_id = subscriptions.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on subscriptions to service_role;
grant select on subscriptions to authenticated;

-- 4. Usage Entitlements and Counters table
create table if not exists usage_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete cascade,
  metric text not null check (metric in ('social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance')),
  limit_amount integer not null,
  current_usage integer not null default 0,
  notification_sent_80 boolean not null default false,
  notification_sent_90 boolean not null default false,
  notification_sent_100 boolean not null default false,
  is_paused boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table usage_entitlements enable row level security;
create index if not exists usage_entitlements_tenant_idx on usage_entitlements (tenant_id);
create policy usage_entitlements_tenant_read on usage_entitlements for select
  using (exists (select 1 from tenant_members m where m.tenant_id = usage_entitlements.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on usage_entitlements to service_role;
grant select on usage_entitlements to authenticated;

-- 5. Continuation Packs table (for explicit extra volume purchases when 100% limit is reached)
create table if not exists continuation_packs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete cascade,
  metric text not null,
  extra_units integer not null,
  price_cents bigint not null,
  payment_link_id uuid references payment_links(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'applied')),
  created_at timestamptz not null default now()
);

alter table continuation_packs enable row level security;
create index if not exists continuation_packs_tenant_idx on continuation_packs (tenant_id, created_at desc);
create policy continuation_packs_tenant_read on continuation_packs for select
  using (exists (select 1 from tenant_members m where m.tenant_id = continuation_packs.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on continuation_packs to service_role;
grant select on continuation_packs to authenticated;
