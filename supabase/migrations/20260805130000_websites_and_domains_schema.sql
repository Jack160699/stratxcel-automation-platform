-- Migration: Websites and Provider-Neutral Domain Management System
-- Stores controlled 5-page template website projects, revisions, domain registrations with legal registrant details, DNS records, and Vercel domain attachment state.

-- 1. Site Projects table (Controlled 5-page template builder)
create table if not exists site_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null unique,
  template_id text not null default 'modern-business-5page',
  status text not null default 'draft' check (status in ('draft', 'preview', 'in_revision', 'approved', 'published')),
  preview_subdomain text not null unique, -- e.g. business-name.stratxcel.site
  custom_domain text,
  pages jsonb not null default '[]'::jsonb, -- Array of 5 pages: Home, Services, About, Reviews, Contact
  revision_notes text,
  revision_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table site_projects enable row level security;
create index if not exists site_projects_tenant_idx on site_projects (tenant_id, created_at desc);
create policy site_projects_tenant_read on site_projects for select
  using (exists (select 1 from tenant_members m where m.tenant_id = site_projects.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on site_projects to service_role;
grant select on site_projects to authenticated;

-- 2. Domains table (Provider-neutral domain registrar system with legal client ownership)
create table if not exists domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  domain_name text not null unique,
  provider text not null default 'resellerclub', -- 'resellerclub', 'sandbox', etc.
  provider_domain_id text,
  
  -- Legal Client Registrant Ownership Details (Mandatory Rule: Beneficial ownership belongs to client)
  registrant_name text not null,
  registrant_email text not null,
  registrant_phone text not null,
  registrant_organization text,
  registrant_address text,
  registrant_city text,
  registrant_state text,
  registrant_country text not null default 'IN',
  registrant_postal_code text,
  
  -- Lifecycle & Domain Status
  status text not null default 'pending_payment' check (status in ('pending_payment', 'registering', 'active', 'failed', 'expired', 'transferred_out')),
  purchase_price_cents bigint not null,
  renewal_price_cents bigint not null,
  payment_link_id uuid references payment_links(id) on delete set null,
  
  -- Hosting & DNS Attachment State
  dns_configured boolean not null default false,
  vercel_attached boolean not null default false,
  vercel_ssl_active boolean not null default false,
  site_project_id uuid references site_projects(id) on delete set null,
  
  -- Website Export Unlock (Unlocked after 3 paid subscription months)
  paid_subscription_months_count integer not null default 0,
  export_unlocked boolean not null default false,
  
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table domains enable row level security;
create index if not exists domains_tenant_idx on domains (tenant_id, created_at desc);
create policy domains_tenant_read on domains for select
  using (exists (select 1 from tenant_members m where m.tenant_id = domains.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on domains to service_role;
grant select on domains to authenticated;
