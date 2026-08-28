-- ==============================================================================
-- Migration: 20260830000000_commercial_model_v3_rebuild.sql
-- Description: StratXcel Canonical Commercial Architecture Rebuild (v3):
--   1. Widen usage_entitlements_metric_check to include image_generation_attempts_monthly
--      and copilot_monthly_uses.
--   2. Create website_custom_quotes table with tenant-isolated RLS.
--   3. Hardened payment reconciliation for canonical services:
--      - seo: ₹2,999/mo (299,900 paise)
--      - social: ₹3,999/mo (399,900 paise) -> 28 posts/mo
--      - seo_and_social: ₹6,998/mo (699,800 paise) -> 28 posts/mo
--      - advanced_seo: ₹9,999/mo (999,900 paise)
--      - advanced_social: ₹8,499/mo (849,900 paise) -> 28 posts/mo, Autopilot, 100 image attempts
--      - advanced_growth: ₹18,498/mo (1,849,800 paise) -> 28 posts/mo, Autopilot, 100 image attempts, WhatsApp, Landing Page
--      - website_landing_page: ₹999 one-time (99,900 paise)
--      - website_standard: ₹2,999 one-time (299,900 paise)
-- ==============================================================================

-- ------------------------------------------------------------------
-- 1. Widen metric CHECK constraint
-- ------------------------------------------------------------------
alter table public.usage_entitlements
  drop constraint if exists usage_entitlements_metric_check;

alter table public.usage_entitlements
  add constraint usage_entitlements_metric_check
  check (metric = any (array[
    'social_posts',
    'meta_ad_campaigns',
    'whatsapp_contacts',
    'website_maintenance',
    'content_generation_monthly',
    'automated_content_monthly',
    'social_autopilot_automated_monthly',
    'social_autopilot_manual_monthly',
    'image_generation_attempts_monthly',
    'copilot_monthly_uses'
  ]));

-- ------------------------------------------------------------------
-- 2. Create website_custom_quotes table with tenant RLS
-- ------------------------------------------------------------------
create table if not exists public.website_custom_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid not null,
  status text not null default 'QUOTED',
  requirements text not null,
  target_pages integer not null default 8,
  integrations text[] default '{}',
  custom_notes text,
  quoted_amount_cents bigint not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_website_custom_quotes_tenant
  on public.website_custom_quotes(tenant_id, created_at desc);

alter table public.website_custom_quotes enable row level security;

drop policy if exists "website_custom_quotes_tenant_select" on public.website_custom_quotes;
create policy "website_custom_quotes_tenant_select" on public.website_custom_quotes
  for select
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = website_custom_quotes.tenant_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "website_custom_quotes_tenant_insert" on public.website_custom_quotes;
create policy "website_custom_quotes_tenant_insert" on public.website_custom_quotes
  for insert
  with check (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = website_custom_quotes.tenant_id
        and tm.user_id = auth.uid()
    )
  );

drop policy if exists "website_custom_quotes_tenant_update" on public.website_custom_quotes;
create policy "website_custom_quotes_tenant_update" on public.website_custom_quotes
  for update
  using (
    exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id = website_custom_quotes.tenant_id
        and tm.user_id = auth.uid()
    )
  );

grant select, insert, update on public.website_custom_quotes to authenticated, service_role;
