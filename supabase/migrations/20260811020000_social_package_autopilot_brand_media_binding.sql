alter table social_brand_profiles add column if not exists tenant_id uuid references tenants(id) on delete set null;
create unique index if not exists social_brand_profiles_tenant_key on social_brand_profiles(tenant_id) where tenant_id is not null;
alter table social_media_assets add column if not exists tenant_id uuid references tenants(id) on delete set null;
create index if not exists social_media_assets_tenant_idx on social_media_assets(tenant_id, created_at desc) where tenant_id is not null;

alter table social_autopilot_authorizations add column if not exists brand_profile_id uuid references social_brand_profiles(id) on delete restrict;
alter table social_autopilot_authorizations add column if not exists package_composition jsonb not null default '{"items":[{"mediaType":"text","quantity":1}]}'::jsonb;
alter table social_autopilot_authorizations add column if not exists scheduler_mode text not null default 'VERCEL' check (scheduler_mode in ('VERCEL','SUPABASE'));
alter table social_autopilot_queue_items add column if not exists content_master_id uuid references content_master(id) on delete set null;

create or replace function validate_social_package_brand_binding(p_authorization_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from social_autopilot_authorizations a join social_brand_profiles b on b.id=a.brand_profile_id and b.tenant_id=a.tenant_id where a.id=p_authorization_id and a.brand_profile_id is not null)
$$;
revoke all on function validate_social_package_brand_binding(uuid) from public,anon,authenticated;
grant execute on function validate_social_package_brand_binding(uuid) to service_role;
