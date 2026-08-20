-- Migration: Website Factory Schema Extension
-- Extends existing site_projects/domains for the full AI Website Factory lifecycle.
-- Additive only — no destructive changes to existing columns or constraints.

-- ============================================================
-- 1. SITE_PROJECTS — additive columns for Website Factory
-- ============================================================

alter table site_projects
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists business_type text,
  add column if not exists website_type text not null default 'BUSINESS_WEBSITE'
    check (website_type in ('LANDING_PAGE', 'BUSINESS_WEBSITE', 'ECOMMERCE', 'SERVICE_BUSINESS', 'AI_BUSINESS')),
  add column if not exists generation_status text not null default 'PENDING'
    check (generation_status in ('PENDING', 'GENERATING', 'GENERATED', 'FAILED')),
  add column if not exists deployment_status text not null default 'NOT_STARTED'
    check (deployment_status in (
      'NOT_STARTED', 'PREVIEW_DEPLOYED', 'DEPLOYING', 'DNS_PENDING',
      'SSL_PENDING', 'QA_RUNNING', 'LIVE', 'FAILED', 'SUSPENDED'
    )),
  add column if not exists plan text,
  add column if not exists prompt text,
  add column if not exists hosting_project_reference text,
  add column if not exists repository_reference text,
  add column if not exists domain_id uuid references domains(id) on delete set null,
  add column if not exists ssl_status text not null default 'NOT_STARTED'
    check (ssl_status in ('NOT_STARTED', 'SSL_PENDING', 'SSL_PROVISIONING', 'SSL_ACTIVE', 'SSL_FAILED')),
  add column if not exists qa_status text not null default 'NOT_STARTED'
    check (qa_status in ('NOT_STARTED', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED')),
  add column if not exists qa_results jsonb not null default '{}'::jsonb,
  add column if not exists theme_config jsonb not null default '{}'::jsonb,
  add column if not exists package_tier text;

-- Widen status check to include the complete Website Factory lifecycle.
-- Preserves all existing values and adds new ones.
alter table site_projects drop constraint if exists site_projects_status_check;
alter table site_projects add constraint site_projects_status_check
  check (status in (
    'draft', 'preview', 'in_revision', 'approved', 'published',
    'generating', 'preview_ready', 'revision_requested', 'deploying', 'live', 'failed', 'archived',
    'approval_required', 'payment_pending', 'dns_pending', 'ssl_pending', 'qa_running', 'suspended'
  ));

create index if not exists site_projects_owner_idx on site_projects (owner_user_id) where owner_user_id is not null;
create index if not exists site_projects_domain_idx on site_projects (domain_id) where domain_id is not null;
create index if not exists site_projects_deployment_status_idx on site_projects (deployment_status) where deployment_status not in ('NOT_STARTED', 'LIVE');

-- ============================================================
-- 2. DOMAINS — additive columns for richer lifecycle
-- ============================================================

alter table domains
  add column if not exists availability_status text
    check (availability_status is null or availability_status in ('AVAILABLE', 'UNAVAILABLE', 'PREMIUM', 'INVALID', 'UNSUPPORTED')),
  add column if not exists registration_period_years integer not null default 1,
  add column if not exists tax_amount_cents bigint not null default 0,
  add column if not exists total_amount_cents bigint not null default 0;

-- Widen domain status to include full lifecycle.
alter table domains drop constraint if exists domains_status_check;
alter table domains add constraint domains_status_check
  check (status in (
    'pending_payment', 'paid_pending_registration', 'registering', 'active',
    'failed', 'expired', 'transferred_out',
    'renewal_pending_payment', 'renewal_paid_pending_provider',
    'checking_availability', 'available', 'unavailable'
  ));

-- ============================================================
-- 3. WEBSITE_AGENTS — AI business agent per website project
-- ============================================================

create table if not exists website_agents (
  id uuid primary key default gen_random_uuid(),
  site_project_id uuid not null references site_projects(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null default 'AI Assistant',
  system_instructions text not null default '',
  business_context jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  model text not null default 'gemini-3.6-flash',
  allowed_actions text[] not null default '{answer_questions,recommend_products,capture_leads,direct_to_checkout}'::text[],
  escalation_rules jsonb not null default '{"maxTurns": 10, "escalateOnUnknown": true}'::jsonb,
  greeting_message text not null default 'Hi! How can I help you today?',
  widget_config jsonb not null default '{"position": "bottom-right", "primaryColor": "#000000", "expanded": false}'::jsonb,
  conversation_count integer not null default 0,
  leads_captured integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table website_agents enable row level security;
create unique index if not exists website_agents_site_project_unique on website_agents (site_project_id);
create index if not exists website_agents_tenant_idx on website_agents (tenant_id);
create policy website_agents_tenant_read on website_agents for select
  using (exists (select 1 from tenant_members m where m.tenant_id = website_agents.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on website_agents to service_role;
grant select on website_agents to authenticated;

-- ============================================================
-- 4. WEBSITE_USAGE_TRACKING — cost tracking per project
-- ============================================================

create table if not exists website_usage_tracking (
  id uuid primary key default gen_random_uuid(),
  site_project_id uuid not null references site_projects(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null check (event_type in (
    'ai_generation', 'ai_edit', 'ai_agent_conversation',
    'image_generation', 'deployment', 'domain_registration',
    'domain_renewal', 'qa_run'
  )),
  ai_input_tokens integer,
  ai_output_tokens integer,
  estimated_cost_usd numeric(10, 6),
  provider text,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table website_usage_tracking enable row level security;
create index if not exists website_usage_tenant_project_idx on website_usage_tracking (tenant_id, site_project_id, created_at desc);
create policy website_usage_tracking_tenant_read on website_usage_tracking for select
  using (exists (select 1 from tenant_members m where m.tenant_id = website_usage_tracking.tenant_id and m.user_id = (select auth.uid())));
grant select, insert on website_usage_tracking to service_role;
grant select on website_usage_tracking to authenticated;

-- ============================================================
-- 5. ECOMMERCE FOUNDATION — products, categories, orders
-- ============================================================

create table if not exists website_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid not null references site_projects(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  price_cents bigint not null,
  compare_at_price_cents bigint,
  currency text not null default 'INR',
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  images jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  inventory_count integer not null default 0,
  track_inventory boolean not null default false,
  category_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table website_products enable row level security;
create unique index if not exists website_products_slug_per_site on website_products (site_project_id, slug);
create index if not exists website_products_tenant_site_idx on website_products (tenant_id, site_project_id);
create policy website_products_tenant_read on website_products for select
  using (exists (select 1 from tenant_members m where m.tenant_id = website_products.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on website_products to service_role;
grant select on website_products to authenticated;

create table if not exists website_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references website_products(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sku text,
  price_cents bigint not null,
  compare_at_price_cents bigint,
  inventory_count integer not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table website_product_variants enable row level security;
create index if not exists website_product_variants_product_idx on website_product_variants (product_id);
create policy website_product_variants_tenant_read on website_product_variants for select
  using (exists (select 1 from tenant_members m where m.tenant_id = website_product_variants.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on website_product_variants to service_role;
grant select on website_product_variants to authenticated;

create table if not exists website_product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid not null references site_projects(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  parent_id uuid references website_product_categories(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table website_product_categories enable row level security;
create unique index if not exists website_product_categories_slug_per_site on website_product_categories (site_project_id, slug);
create policy website_product_categories_tenant_read on website_product_categories for select
  using (exists (select 1 from tenant_members m where m.tenant_id = website_product_categories.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on website_product_categories to service_role;
grant select on website_product_categories to authenticated;

-- Wire up category FK now that the table exists.
alter table website_products
  add constraint website_products_category_fk
  foreign key (category_id) references website_product_categories(id) on delete set null;

create table if not exists website_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid not null references site_projects(id) on delete cascade,
  order_number text not null,
  customer_email text not null,
  customer_name text,
  customer_phone text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  items jsonb not null default '[]'::jsonb,
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  shipping_cents bigint not null default 0,
  total_cents bigint not null default 0,
  currency text not null default 'INR',
  payment_reference text,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded', 'partially_refunded')),
  shipping_address jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table website_orders enable row level security;
create unique index if not exists website_orders_number_per_site on website_orders (site_project_id, order_number);
create index if not exists website_orders_tenant_site_idx on website_orders (tenant_id, site_project_id, created_at desc);
create policy website_orders_tenant_read on website_orders for select
  using (exists (select 1 from tenant_members m where m.tenant_id = website_orders.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on website_orders to service_role;
grant select on website_orders to authenticated;

create table if not exists website_discount_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid not null references site_projects(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount')),
  discount_value integer not null,
  min_order_cents bigint,
  max_uses integer,
  used_count integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table website_discount_codes enable row level security;
create unique index if not exists website_discount_codes_code_per_site on website_discount_codes (site_project_id, code);
create policy website_discount_codes_tenant_read on website_discount_codes for select
  using (exists (select 1 from tenant_members m where m.tenant_id = website_discount_codes.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on website_discount_codes to service_role;
grant select on website_discount_codes to authenticated;

-- ============================================================
-- 6. WEBSITE FACTORY DEPLOYMENT RPC
-- Atomic state transition for the deployment pipeline.
-- ============================================================

create or replace function public.transition_website_deployment(
  p_site_project_id uuid,
  p_tenant_id uuid,
  p_from_status text,
  p_to_status text,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project record;
begin
  select * into v_project from site_projects where id = p_site_project_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'site_project_not_found');
  end if;

  if v_project.tenant_id <> p_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  -- Idempotency: if already at the target status, return success without mutation.
  if v_project.deployment_status = p_to_status then
    return jsonb_build_object('success', true, 'idempotent', true, 'deployment_status', p_to_status);
  end if;

  -- Verify we're transitioning from the expected state.
  if v_project.deployment_status <> p_from_status then
    return jsonb_build_object(
      'success', false,
      'reason', 'unexpected_current_status',
      'expected', p_from_status,
      'actual', v_project.deployment_status
    );
  end if;

  update site_projects
  set deployment_status = p_to_status,
      hosting_project_reference = coalesce(p_metadata->>'hosting_project_reference', hosting_project_reference),
      production_url = coalesce(p_metadata->>'production_url', production_url),
      ssl_status = coalesce(p_metadata->>'ssl_status', ssl_status),
      qa_status = coalesce(p_metadata->>'qa_status', qa_status),
      qa_results = case when p_metadata ? 'qa_results' then (p_metadata->'qa_results') else qa_results end,
      published_at = case when p_to_status = 'LIVE' then now() else published_at end,
      status = case
        when p_to_status = 'LIVE' then 'live'
        when p_to_status = 'FAILED' then 'failed'
        when p_to_status = 'DEPLOYING' then 'deploying'
        when p_to_status = 'DNS_PENDING' then 'dns_pending'
        when p_to_status = 'SSL_PENDING' then 'ssl_pending'
        when p_to_status = 'QA_RUNNING' then 'qa_running'
        else status
      end,
      updated_at = now()
  where id = p_site_project_id;

  return jsonb_build_object(
    'success', true,
    'site_project_id', p_site_project_id,
    'from_status', p_from_status,
    'to_status', p_to_status
  );
end;
$$;

revoke all on function public.transition_website_deployment(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.transition_website_deployment(uuid, uuid, text, text, jsonb, text) to service_role;
