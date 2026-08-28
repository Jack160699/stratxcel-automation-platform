-- ============================================================================
-- Migration: 20260829000000_festival_calendar_rules.sql
-- Description: Durable festival calendar rules architecture & tenant override engine
-- ============================================================================

create table if not exists festival_calendar_rules (
  id uuid primary key default gen_random_uuid(),
  festival_id text unique not null,
  festival_name text not null,
  region text not null default 'all_india',
  tradition_calendar text not null, -- 'hindu_panchangam', 'islamic_hijri', 'gregorian_fixed', 'regional_solar', 'national_gazetted'
  calculation_method text not null, -- 'fixed_gregorian', 'lunar_hindu_panchangam', 'lunar_islamic_hijri', 'solar_sankranti', 'movable_rule', 'business_custom'
  observance_rules jsonb not null default '{}'::jsonb,
  timezone text not null default 'Asia/Kolkata',
  start_window_days int not null default 3,
  end_window_days int not null default 0,
  confidence_source text not null default 'stratxcel_canonical_calendar_v1',
  effective_year_range int4range not null default int4range(2025, 2035, '[]'),
  override_support boolean not null default true,
  active_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table festival_calendar_rules enable row level security;

-- Read policy: Authenticated users & tenant members can read canonical festival rules
create policy festival_calendar_rules_read on festival_calendar_rules
  for select
  to authenticated
  using (true);

-- Service role full access
create policy festival_calendar_rules_service_role on festival_calendar_rules
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- Table: social_festival_manual_overrides
-- Tenant-scoped manual overrides taking precedence over automated calculations
-- ============================================================================

create table if not exists social_festival_manual_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  festival_id text not null,
  year int not null,
  override_date date not null,
  notes text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, festival_id, year)
);

alter table social_festival_manual_overrides enable row level security;

-- Tenant Isolation: Members of a tenant can read their own tenant overrides
create policy social_festival_manual_overrides_select on social_festival_manual_overrides
  for select
  to authenticated
  using (
    exists (
      select 1 from tenant_members
      where tenant_members.tenant_id = social_festival_manual_overrides.tenant_id
      and tenant_members.user_id = auth.uid()
    )
  );

-- Tenant Isolation: Admin/Owner members of a tenant can insert/update overrides
create policy social_festival_manual_overrides_write on social_festival_manual_overrides
  for all
  to authenticated
  using (
    exists (
      select 1 from tenant_members
      where tenant_members.tenant_id = social_festival_manual_overrides.tenant_id
      and tenant_members.user_id = auth.uid()
      and tenant_members.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from tenant_members
      where tenant_members.tenant_id = social_festival_manual_overrides.tenant_id
      and tenant_members.user_id = auth.uid()
      and tenant_members.role in ('owner', 'admin')
    )
  );

-- Service role full access
create policy social_festival_manual_overrides_service_role on social_festival_manual_overrides
  for all
  to service_role
  using (true)
  with check (true);

-- Seed canonical festival rules
insert into festival_calendar_rules (
  festival_id, festival_name, region, tradition_calendar, calculation_method, timezone, start_window_days, end_window_days, confidence_source
) values
  ('republic_day', 'Republic Day', 'all_india', 'national_gazetted', 'fixed_gregorian', 'Asia/Kolkata', 3, 0, 'national_gazette_india'),
  ('independence_day', 'Independence Day', 'all_india', 'national_gazetted', 'fixed_gregorian', 'Asia/Kolkata', 3, 0, 'national_gazette_india'),
  ('gandhi_jayanti', 'Gandhi Jayanti', 'all_india', 'national_gazetted', 'fixed_gregorian', 'Asia/Kolkata', 3, 0, 'national_gazette_india'),
  ('diwali', 'Diwali / Deepavali', 'all_india', 'hindu_panchangam', 'lunar_hindu_panchangam', 'Asia/Kolkata', 5, 1, 'panchangam_amanta_kartika_amavasya'),
  ('holi', 'Holi', 'all_india', 'hindu_panchangam', 'lunar_hindu_panchangam', 'Asia/Kolkata', 4, 0, 'panchangam_phalguna_purnima'),
  ('dussehra', 'Dussehra / Vijayadashami', 'all_india', 'hindu_panchangam', 'lunar_hindu_panchangam', 'Asia/Kolkata', 4, 0, 'panchangam_ashvina_shukla_dashami'),
  ('raksha_bandhan', 'Raksha Bandhan', 'all_india', 'hindu_panchangam', 'lunar_hindu_panchangam', 'Asia/Kolkata', 4, 0, 'panchangam_shravana_purnima'),
  ('janmashtami', 'Krishna Janmashtami', 'all_india', 'hindu_panchangam', 'lunar_hindu_panchangam', 'Asia/Kolkata', 3, 0, 'panchangam_bhadrapada_krishna_ashtami'),
  ('eid_ul_fitr', 'Eid ul-Fitr', 'all_india', 'islamic_hijri', 'lunar_islamic_hijri', 'Asia/Kolkata', 4, 1, 'hijri_1_shawwal_moon_sighting'),
  ('eid_al_adha', 'Eid al-Adha / Bakrid', 'all_india', 'islamic_hijri', 'lunar_islamic_hijri', 'Asia/Kolkata', 4, 1, 'hijri_10_dhu_al_hijjah'),
  ('makar_sankranti', 'Makar Sankranti / Pongal', 'all_india', 'regional_solar', 'solar_sankranti', 'Asia/Kolkata', 3, 0, 'surya_siddhanta_makara_sankranti'),
  ('christmas', 'Christmas', 'all_india', 'gregorian_fixed', 'fixed_gregorian', 'Asia/Kolkata', 5, 0, 'gregorian_dec_25'),
  ('new_year', 'New Year', 'all_india', 'gregorian_fixed', 'fixed_gregorian', 'Asia/Kolkata', 4, 0, 'gregorian_jan_01')
on conflict (festival_id) do update set
  festival_name = excluded.festival_name,
  calculation_method = excluded.calculation_method,
  updated_at = now();
