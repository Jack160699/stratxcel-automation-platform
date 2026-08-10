-- Social Package Autopilot: recurring queue producer support.
--
-- Additive only — extends the standing-authorization/queue-item tables from
-- 20260810190000_social_package_autopilot_authorization.sql (never edited in
-- place) with the columns/constraints a real recurring producer needs:
-- service-period lifecycle, distribution/scheduling policy, media-type and
-- content-unit tracking for counting semantics, a producer health log, and
-- two hardening fixes to the existing claim/settle RPCs (tenant-bound
-- destination account check; counting-policy-aware entitlement settlement).

-- 1. Bind a connected social account to the client tenant it serves. Nullable
--    and unrelated to owner_id/RLS on social_accounts (unchanged — still
--    owner_id-scoped for the existing staff-run Social Autopilot tool); this
--    is purely how the package producer resolves "which of our connected
--    accounts is this tenant's Instagram" and how claim_social_package_post
--    now asserts a destination never silently drifts to another tenant's
--    account (Section 42/43/97 of the release-candidate brief).
alter table social_accounts add column if not exists tenant_id uuid references tenants(id) on delete set null;
create index if not exists social_accounts_tenant_idx on social_accounts (tenant_id) where tenant_id is not null;

-- 2. Service-period lifecycle + distribution/scheduling/counting policy on
--    the standing authorization. One authorization row persists across
--    renewals (entitlement_id is stable, unique(tenant_id,metric)); period
--    columns are how THIS feature tracks "current service period" without
--    depending on usage_entitlements.current_usage, which is not reset per
--    billing period today.
alter table social_autopilot_authorizations
  add column if not exists period_number integer not null default 1,
  add column if not exists period_target_units integer not null default 0 check (period_target_units >= 0),
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists max_posts_per_day integer not null default 1 check (max_posts_per_day > 0),
  add column if not exists preparation_horizon_days integer not null default 5 check (preparation_horizon_days > 0),
  add column if not exists late_item_policy text not null default 'RESCHEDULE_NEXT_SLOT'
    check (late_item_policy in ('RESCHEDULE_NEXT_SLOT', 'SKIP', 'PUBLISH_IF_WITHIN_GRACE_WINDOW')),
  add column if not exists grace_window_minutes integer not null default 60 check (grace_window_minutes >= 0),
  add column if not exists counting_policy text not null default 'PLATFORM_PUBLISH'
    check (counting_policy in ('CONTENT_UNIT', 'PLATFORM_PUBLISH')),
  add column if not exists skip_policy text not null default 'SKIP_REPLACED'
    check (skip_policy in ('SKIP_COUNTS', 'SKIP_REPLACED'));

-- A package that cannot safely fit its remaining entitlement into the
-- remaining service-period window (Section 19) needs a real state distinct
-- from ACTIVE — never "silently keep trying" or "burst publish".
alter table social_autopilot_authorizations drop constraint if exists social_autopilot_authorizations_state_check;
alter table social_autopilot_authorizations add constraint social_autopilot_authorizations_state_check
  check (state in ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'NEEDS_ATTENTION'));

-- 3. Queue items: a PLANNED slot (service-plan layer, Section 16) exists
--    before any content is prepared, so variant_id must become optional —
--    the preparation step fills it in once the item enters the preparation
--    horizon. period_number scopes sequence numbers per service period
--    (renewal starts a fresh 1..N rather than colliding with prior periods).
--    content_unit_key + counted implement counting_policy: for CONTENT_UNIT,
--    only the first settled destination for a given content unit increments
--    the shared entitlement; PLATFORM_PUBLISH increments every destination.
alter table social_autopilot_queue_items alter column variant_id drop not null;
alter table social_autopilot_queue_items
  add column if not exists period_number integer not null default 1,
  add column if not exists content_pillar text,
  add column if not exists media_type text check (media_type in ('image', 'carousel', 'reel', 'video', 'text')),
  add column if not exists content_unit_key text,
  add column if not exists counted boolean not null default false,
  add column if not exists quota_consumed boolean not null default false,
  add column if not exists last_notification jsonb;

create unique index if not exists social_autopilot_queue_items_period_sequence_key
  on social_autopilot_queue_items (authorization_id, period_number, package_sequence);
create index if not exists social_autopilot_queue_items_due_idx
  on social_autopilot_queue_items (status, scheduled_at) where status in ('PREPARED', 'SCHEDULED');
create index if not exists social_autopilot_queue_items_content_unit_idx
  on social_autopilot_queue_items (authorization_id, content_unit_key) where content_unit_key is not null;

-- 4. Producer health log — what admin operability (Section 51) reads. One
--    row per producer batch invocation; service-role only, matching every
--    other background-worker-authored table in this schema.
create table if not exists social_autopilot_producer_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  tenants_processed integer not null default 0,
  items_planned integer not null default 0,
  items_prepared integer not null default 0,
  items_blocked integer not null default 0,
  failures jsonb not null default '[]'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now()
);
alter table social_autopilot_producer_runs enable row level security;
grant select on social_autopilot_producer_runs to authenticated;
grant all on social_autopilot_producer_runs to service_role;
create policy social_autopilot_producer_runs_staff_read on social_autopilot_producer_runs for select to authenticated
  using (exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

-- 5. Register the package producer as a first-class worker type so it shows
--    up in the existing worker-health infrastructure (packages/queue/src)
--    instead of a bespoke parallel health mechanism.
alter table worker_heartbeats drop constraint if exists worker_heartbeats_worker_type_check;
alter table worker_heartbeats add constraint worker_heartbeats_worker_type_check
  check (worker_type in ('mission-worker', 'whatsapp-worker', 'hermes-gateway', 'package-autopilot-worker'));

-- 6. Hardening: claim_social_package_post now also asserts the destination
--    account is bound to the SAME tenant as the queue item (Section 42/43/97)
--    — previously only owner_id + status='CONNECTED' were checked, so an
--    account bound to (or later rebound to) a different tenant could still
--    be claimed for this one. CREATE OR REPLACE, same signature/ACL as the
--    original — never edits the already-applied migration file.
create or replace function claim_social_package_post(p_queue_item_id uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item social_autopilot_queue_items%rowtype; v_auth social_autopilot_authorizations%rowtype; v_sub subscriptions%rowtype; v_ent usage_entitlements%rowtype; v_platform text; v_account_tenant uuid; v_shadow boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then return jsonb_build_object('allowed',false,'reason','service_role_required'); end if;
  select * into v_item from social_autopilot_queue_items where id=p_queue_item_id for update;
  if not found then return jsonb_build_object('allowed',false,'reason','queue_item_not_found'); end if;
  if v_item.status not in ('PREPARED','SCHEDULED') then return jsonb_build_object('allowed',false,'reason','already_claimed_or_not_ready'); end if;
  if v_item.variant_id is null then return jsonb_build_object('allowed',false,'reason','not_prepared'); end if;
  select * into v_auth from social_autopilot_authorizations where id=v_item.authorization_id and tenant_id=v_item.tenant_id for update;
  if not found or v_auth.state <> 'ACTIVE' or v_auth.publishing_mode <> 'AUTO_PUBLISH' or v_auth.starts_at > now() or (v_auth.ends_at is not null and v_auth.ends_at <= now()) then return jsonb_build_object('allowed',false,'reason','standing_authorization_inactive'); end if;
  select * into v_sub from subscriptions where id=v_auth.subscription_id and tenant_id=v_auth.tenant_id;
  if not found or v_sub.status <> 'active' or v_sub.current_period_end <= now() then return jsonb_build_object('allowed',false,'reason','subscription_inactive'); end if;
  select * into v_ent from usage_entitlements where id=v_auth.entitlement_id and tenant_id=v_auth.tenant_id and subscription_id=v_auth.subscription_id and metric='social_posts' for update;
  if not found or v_ent.is_paused or v_ent.current_usage >= v_ent.limit_amount then return jsonb_build_object('allowed',false,'reason','entitlement_paused_or_exhausted'); end if;
  select lower(a.platform), a.tenant_id into v_platform, v_account_tenant from social_accounts a where a.id=v_item.account_id and a.owner_id=v_item.owner_id and a.status='CONNECTED';
  if v_platform is null or not (v_platform = any(select lower(x) from unnest(v_auth.allowed_platforms) x)) then return jsonb_build_object('allowed',false,'reason','destination_outside_scope'); end if;
  if v_account_tenant is distinct from v_item.tenant_id then return jsonb_build_object('allowed',false,'reason','destination_account_tenant_mismatch'); end if;
  select coalesce(s.shadow_mode,true) into v_shadow from social_automation_settings s where s.owner_id=v_item.owner_id;
  update social_autopilot_queue_items set status='EXECUTING',claimed_at=now(),updated_at=now() where id=v_item.id;
  return jsonb_build_object('allowed',true,'reason','authorized','queue_item_id',v_item.id,'tenant_id',v_item.tenant_id,'owner_id',v_item.owner_id,'account_id',v_item.account_id,'variant_id',v_item.variant_id,'shadow_mode',coalesce(v_shadow,true));
end $$;

-- 7. Hardening: settle_social_package_post now honors counting_policy
--    (CONTENT_UNIT vs PLATFORM_PUBLISH) instead of always incrementing once
--    per queue item, and marks skip outcomes' quota effect per skip_policy.
--    Idempotency (already-terminal short-circuit) and the atomic
--    current_usage<limit_amount guard are unchanged from the original.
create or replace function settle_social_package_post(p_queue_item_id uuid,p_outcome text,p_publishing_job_id uuid default null,p_error text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_item social_autopilot_queue_items%rowtype; v_auth social_autopilot_authorizations%rowtype; v_already_counted boolean; v_should_count boolean; v_should_settle_quota boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service role required'; end if;
  if p_outcome not in ('PUBLISHED','FAILED','SKIPPED','SHADOW_COMPLETED') then raise exception 'invalid outcome'; end if;
  select * into v_item from social_autopilot_queue_items where id=p_queue_item_id for update;
  if not found then raise exception 'queue item not found'; end if;
  if v_item.status in ('PUBLISHED','FAILED','SKIPPED','SHADOW_COMPLETED') then return jsonb_build_object('settled',false,'already_settled',true); end if;
  if v_item.status <> 'EXECUTING' then raise exception 'queue item not claimed'; end if;
  select * into v_auth from social_autopilot_authorizations where id=v_item.authorization_id for update;

  v_should_count := false;
  v_should_settle_quota := false;

  if p_outcome = 'PUBLISHED' then
    if v_auth.counting_policy = 'CONTENT_UNIT' and v_item.content_unit_key is not null then
      select exists(
        select 1 from social_autopilot_queue_items
        where authorization_id = v_item.authorization_id
          and content_unit_key = v_item.content_unit_key
          and id <> v_item.id
          and counted = true
      ) into v_already_counted;
      v_should_count := not coalesce(v_already_counted, false);
    else
      v_should_count := true;
    end if;
    v_should_settle_quota := v_should_count;
  elsif p_outcome = 'SKIPPED' then
    -- SKIP_COUNTS: a skipped slot still consumes package quota (the client
    -- was offered N delivered opportunities, not N guaranteed posts).
    -- SKIP_REPLACED: it does not — the producer must plan a replacement.
    v_should_settle_quota := (v_auth.skip_policy = 'SKIP_COUNTS');
  end if;

  update social_autopilot_queue_items
    set status=p_outcome, publishing_job_id=p_publishing_job_id, last_error=p_error,
        settled_at=now(), updated_at=now(), counted=v_should_count, quota_consumed=v_should_settle_quota
    where id=v_item.id;

  if v_should_settle_quota then
    update usage_entitlements set current_usage=current_usage+1,updated_at=now()
      where id=v_auth.entitlement_id and current_usage < limit_amount;
  end if;

  return jsonb_build_object('settled',true,'already_settled',false,'counted',v_should_count,'quota_consumed',v_should_settle_quota);
end $$;

revoke all on function claim_social_package_post(uuid) from public,anon,authenticated;
revoke all on function settle_social_package_post(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function claim_social_package_post(uuid) to service_role;
grant execute on function settle_social_package_post(uuid,text,uuid,text) to service_role;
