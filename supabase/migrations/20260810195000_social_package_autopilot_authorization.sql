create table if not exists social_autopilot_authorizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_user_id uuid not null,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  entitlement_id uuid not null references usage_entitlements(id) on delete cascade,
  publishing_mode text not null check (publishing_mode in ('AUTO_PUBLISH','REVIEW_BEFORE_PUBLISH')),
  state text not null default 'ACTIVE' check (state in ('ACTIVE','PAUSED','CANCELLED','EXPIRED')),
  allowed_platforms text[] not null default '{}',
  content_scope jsonb not null default '{"metric":"social_posts"}'::jsonb,
  activated_at timestamptz not null default now(),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, subscription_id, entitlement_id)
);

create table if not exists social_autopilot_queue_items (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references social_autopilot_authorizations(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  owner_id uuid not null,
  variant_id uuid not null references content_variants(id) on delete cascade,
  account_id uuid not null references social_accounts(id) on delete cascade,
  package_sequence integer not null check (package_sequence > 0),
  scheduled_at timestamptz not null,
  status text not null default 'PLANNED' check (status in ('PLANNED','PREPARED','REVIEW_REQUIRED','SCHEDULED','EXECUTING','PUBLISHED','FAILED','SKIPPED','SHADOW_COMPLETED','BLOCKED')),
  publishing_job_id uuid references social_publishing_jobs(id) on delete set null,
  last_error text,
  claimed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (authorization_id, package_sequence),
  unique (authorization_id, variant_id)
);

alter table social_autopilot_authorizations enable row level security;
alter table social_autopilot_queue_items enable row level security;
create policy social_autopilot_authorizations_tenant_read on social_autopilot_authorizations for select to authenticated
  using (client_user_id = (select auth.uid()) and exists (select 1 from tenant_members m where m.tenant_id = social_autopilot_authorizations.tenant_id and m.user_id = (select auth.uid())));
create policy social_autopilot_queue_items_tenant_read on social_autopilot_queue_items for select to authenticated
  using (exists (select 1 from social_autopilot_authorizations a where a.id = authorization_id and a.client_user_id = (select auth.uid()) and a.tenant_id = social_autopilot_queue_items.tenant_id));
grant select on social_autopilot_authorizations, social_autopilot_queue_items to authenticated;
grant all on social_autopilot_authorizations, social_autopilot_queue_items to service_role;

create or replace function claim_social_package_post(p_queue_item_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item social_autopilot_queue_items%rowtype; v_auth social_autopilot_authorizations%rowtype; v_sub subscriptions%rowtype; v_ent usage_entitlements%rowtype; v_platform text; v_shadow boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then return jsonb_build_object('allowed',false,'reason','service_role_required'); end if;
  select * into v_item from social_autopilot_queue_items where id=p_queue_item_id for update;
  if not found then return jsonb_build_object('allowed',false,'reason','queue_item_not_found'); end if;
  if v_item.status not in ('PREPARED','SCHEDULED') then return jsonb_build_object('allowed',false,'reason','already_claimed_or_not_ready'); end if;
  select * into v_auth from social_autopilot_authorizations where id=v_item.authorization_id and tenant_id=v_item.tenant_id for update;
  if not found or v_auth.state <> 'ACTIVE' or v_auth.publishing_mode <> 'AUTO_PUBLISH' or v_auth.starts_at > now() or (v_auth.ends_at is not null and v_auth.ends_at <= now()) then return jsonb_build_object('allowed',false,'reason','standing_authorization_inactive'); end if;
  select * into v_sub from subscriptions where id=v_auth.subscription_id and tenant_id=v_auth.tenant_id;
  if not found or v_sub.status <> 'active' or v_sub.current_period_end <= now() then return jsonb_build_object('allowed',false,'reason','subscription_inactive'); end if;
  select * into v_ent from usage_entitlements where id=v_auth.entitlement_id and tenant_id=v_auth.tenant_id and subscription_id=v_auth.subscription_id and metric='social_posts' for update;
  if not found or v_ent.is_paused or v_ent.current_usage >= v_ent.limit_amount then return jsonb_build_object('allowed',false,'reason','entitlement_paused_or_exhausted'); end if;
  select lower(a.platform) into v_platform from social_accounts a where a.id=v_item.account_id and a.owner_id=v_item.owner_id and a.status='CONNECTED';
  if v_platform is null or not (v_platform = any(select lower(x) from unnest(v_auth.allowed_platforms) x)) then return jsonb_build_object('allowed',false,'reason','destination_outside_scope'); end if;
  select coalesce(s.shadow_mode,true) into v_shadow from social_automation_settings s where s.owner_id=v_item.owner_id;
  update social_autopilot_queue_items set status='EXECUTING',claimed_at=now(),updated_at=now() where id=v_item.id;
  return jsonb_build_object('allowed',true,'reason','authorized','queue_item_id',v_item.id,'tenant_id',v_item.tenant_id,'owner_id',v_item.owner_id,'account_id',v_item.account_id,'variant_id',v_item.variant_id,'shadow_mode',coalesce(v_shadow,true));
end $$;

create or replace function settle_social_package_post(p_queue_item_id uuid,p_outcome text,p_publishing_job_id uuid default null,p_error text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item social_autopilot_queue_items%rowtype; v_auth social_autopilot_authorizations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required'; end if;
  if p_outcome not in ('PUBLISHED','FAILED','SKIPPED','SHADOW_COMPLETED') then raise exception 'invalid outcome'; end if;
  select * into v_item from social_autopilot_queue_items where id=p_queue_item_id for update;
  if not found then raise exception 'queue item not found'; end if;
  if v_item.status in ('PUBLISHED','FAILED','SKIPPED','SHADOW_COMPLETED') then return jsonb_build_object('settled',false,'already_settled',true); end if;
  if v_item.status <> 'EXECUTING' then raise exception 'queue item not claimed'; end if;
  select * into v_auth from social_autopilot_authorizations where id=v_item.authorization_id;
  update social_autopilot_queue_items set status=p_outcome,publishing_job_id=p_publishing_job_id,last_error=p_error,settled_at=now(),updated_at=now() where id=v_item.id;
  if p_outcome='PUBLISHED' then update usage_entitlements set current_usage=current_usage+1,updated_at=now() where id=v_auth.entitlement_id and current_usage < limit_amount; end if;
  return jsonb_build_object('settled',true,'already_settled',false);
end $$;
revoke all on function claim_social_package_post(uuid) from public,anon,authenticated;
revoke all on function settle_social_package_post(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function claim_social_package_post(uuid) to service_role;
grant execute on function settle_social_package_post(uuid,text,uuid,text) to service_role;
