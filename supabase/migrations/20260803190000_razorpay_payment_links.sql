-- Additive migration for Razorpay Payment Links.
-- Stores Payment Link metadata, customer details, expiry, reference IDs,
-- short URLs, and live/shadow status transitions.

create table if not exists payment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_link_id text,
  reference_id text not null unique,
  amount_cents bigint not null,
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created', 'paid', 'partially_paid', 'expired', 'cancelled')),
  mode text not null default 'test' check (mode in ('test', 'live')),
  short_url text,
  description text,
  customer_name text,
  customer_email text,
  customer_phone text,
  expire_by timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  provider_payment_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payment_links enable row level security;
create index if not exists payment_links_tenant_idx on payment_links (tenant_id, created_at desc);
create unique index if not exists payment_links_provider_link_idx on payment_links (provider, provider_link_id) where provider_link_id is not null;

create policy payment_links_tenant_read on payment_links for select
  using (exists (select 1 from tenant_members m where m.tenant_id = payment_links.tenant_id and m.user_id = (select auth.uid())));

grant select, insert, update, delete on payment_links to service_role;
grant select on payment_links to authenticated;
