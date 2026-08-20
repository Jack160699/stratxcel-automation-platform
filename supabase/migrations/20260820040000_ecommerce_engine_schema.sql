-- Migration: Website Factory E-Commerce Engine Schema Extension
-- Provides robust, scalable, multi-tenant e-commerce backend tables.
-- Additive only — enforces strict RLS, foreign keys to tenants & site_projects.

-- ============================================================
-- 1. ECOMMERCE CATEGORIES & COLLECTIONS
-- ============================================================

create table if not exists ecommerce_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid references site_projects(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, site_project_id, slug)
);

create table if not exists ecommerce_collections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid references site_projects(id) on delete cascade,
  title text not null,
  slug text not null,
  description text,
  banner_image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, site_project_id, slug)
);

-- ============================================================
-- 2. ECOMMERCE PRODUCTS & VARIANTS
-- ============================================================

create table if not exists ecommerce_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid references site_projects(id) on delete cascade,
  category_id uuid references ecommerce_categories(id) on delete set null,
  collection_id uuid references ecommerce_collections(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  short_description text,
  status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  brand text,
  tags text[] default '{}',
  sku text,
  price_cents bigint not null check (price_cents >= 0),
  compare_at_price_cents bigint check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  currency text not null default 'INR',
  tax_rate_percentage numeric(5, 2) not null default 18.00,
  images jsonb not null default '[]'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, site_project_id, slug)
);

create table if not exists ecommerce_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references ecommerce_products(id) on delete cascade,
  sku text not null,
  title text not null,
  options jsonb not null default '{}'::jsonb, -- e.g. {"size": "XL", "color": "Black"}
  price_override_cents bigint check (price_override_cents is null or price_override_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, sku)
);

-- ============================================================
-- 3. INVENTORY & RESERVATIONS
-- ============================================================

create table if not exists ecommerce_inventory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references ecommerce_products(id) on delete cascade,
  variant_id uuid references ecommerce_variants(id) on delete cascade,
  available_quantity integer not null default 0 check (available_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  sold_quantity integer not null default 0 check (sold_quantity >= 0),
  low_stock_threshold integer not null default 5,
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, variant_id)
);

create table if not exists ecommerce_inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references ecommerce_products(id) on delete cascade,
  variant_id uuid references ecommerce_variants(id) on delete cascade,
  cart_id text,
  quantity integer not null check (quantity > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. CARTS & ITEMS
-- ============================================================

create table if not exists ecommerce_carts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid references site_projects(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  session_token text not null,
  currency text not null default 'INR',
  discount_code text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ecommerce_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references ecommerce_carts(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references ecommerce_products(id) on delete cascade,
  variant_id uuid references ecommerce_variants(id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id, variant_id)
);

-- ============================================================
-- 5. DISCOUNTS & PROMOTIONS
-- ============================================================

create table if not exists ecommerce_discounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid references site_projects(id) on delete cascade,
  code text not null,
  type text not null check (type in ('PERCENTAGE', 'FIXED_AMOUNT')),
  value numeric(10, 2) not null check (value > 0),
  min_cart_value_cents bigint not null default 0,
  max_uses integer,
  uses_count integer not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, site_project_id, code)
);

-- ============================================================
-- 6. ORDERS & ORDER ITEMS
-- ============================================================

create table if not exists ecommerce_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  site_project_id uuid references site_projects(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete set null,
  guest_email text,
  guest_phone text,
  status text not null default 'PAYMENT_PENDING' check (
    status in ('PAYMENT_PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED', 'PAYMENT_FAILED')
  ),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  currency text not null default 'INR',
  payment_provider text default 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  shipping_address jsonb not null default '{}'::jsonb,
  billing_address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ecommerce_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references ecommerce_orders(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid references ecommerce_products(id) on delete set null,
  variant_id uuid references ecommerce_variants(id) on delete set null,
  product_name text not null,
  variant_title text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null,
  total_price_cents bigint not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. REFUNDS
-- ============================================================

create table if not exists ecommerce_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references ecommerce_orders(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  reason text,
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED')),
  provider_refund_id text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

alter table ecommerce_categories enable row level security;
alter table ecommerce_collections enable row level security;
alter table ecommerce_products enable row level security;
alter table ecommerce_variants enable row level security;
alter table ecommerce_inventory enable row level security;
alter table ecommerce_inventory_reservations enable row level security;
alter table ecommerce_carts enable row level security;
alter table ecommerce_cart_items enable row level security;
alter table ecommerce_discounts enable row level security;
alter table ecommerce_orders enable row level security;
alter table ecommerce_order_items enable row level security;
alter table ecommerce_refunds enable row level security;

-- Public can view active products, categories, collections
create policy "Public can view active categories" on ecommerce_categories
  for select using (is_active = true);

create policy "Public can view active collections" on ecommerce_collections
  for select using (is_active = true);

create policy "Public can view active products" on ecommerce_products
  for select using (status = 'ACTIVE');

create policy "Public can view active variants" on ecommerce_variants
  for select using (is_active = true);

-- Tenant isolation policies for administration
create policy "Tenants can manage their own categories" on ecommerce_categories
  for all using (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

create policy "Tenants can manage their own collections" on ecommerce_collections
  for all using (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

create policy "Tenants can manage their own products" on ecommerce_products
  for all using (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

create policy "Tenants can manage their own variants" on ecommerce_variants
  for all using (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

create policy "Tenants can manage their own inventory" on ecommerce_inventory
  for all using (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

create policy "Tenants can view and manage their own orders" on ecommerce_orders
  for all using (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

create policy "Tenants can view and manage order items" on ecommerce_order_items
  for all using (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

create policy "Tenants can view and manage refunds" on ecommerce_refunds
  for all using (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);
