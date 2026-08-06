-- Additive hardening for verified platform-staff bootstrap and completed-audit immutability.

create or replace function public.bootstrap_first_platform_staff(
  p_target_user_id uuid,
  p_actor_user_id uuid default null,
  p_role text default 'platform_owner'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('bootstrap_first_platform_staff', 0));

  if p_target_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_target_user_id');
  end if;
  if p_actor_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_bootstrap_actor_or_source');
  end if;
  if p_role is null or p_role not in ('platform_owner', 'platform_admin', 'audit_reviewer', 'finance_reviewer') then
    return jsonb_build_object('success', false, 'reason', 'invalid_platform_staff_role');
  end if;
  if not exists (
    select 1 from auth.users
    where id = p_target_user_id
      and coalesce(email_confirmed_at, phone_confirmed_at) is not null
  ) then
    return jsonb_build_object('success', false, 'reason', 'target_user_missing_or_unverified');
  end if;
  if not exists (
    select 1 from auth.users
    where id = p_actor_user_id
      and coalesce(email_confirmed_at, phone_confirmed_at) is not null
  ) then
    return jsonb_build_object('success', false, 'reason', 'bootstrap_actor_missing_or_unverified');
  end if;

  select count(*) into v_staff_count from public.platform_staff_users where is_active;
  if v_staff_count = 0 then
    if p_role <> 'platform_owner' then
      return jsonb_build_object('success', false, 'reason', 'first_staff_must_be_platform_owner');
    end if;
  elsif not exists (
    select 1 from public.platform_staff_users
    where user_id = p_actor_user_id and is_active and role = 'platform_owner'
  ) then
    return jsonb_build_object('success', false, 'reason', 'active_platform_owner_required');
  end if;

  insert into public.platform_staff_users(user_id, role, is_active, created_by)
  values (p_target_user_id, p_role, true, p_actor_user_id)
  on conflict (user_id) do update
    set role = excluded.role, is_active = true, updated_at = now();

  insert into public.platform_admin_events(target_user_id, actor_user_id, actor_type, action, metadata)
  values (
    p_target_user_id, p_actor_user_id, 'verified_auth_user', 'assign_platform_staff',
    jsonb_build_object('assigned_role', p_role, 'first_bootstrap', v_staff_count = 0, 'source', 'service_role_bootstrap_rpc')
  );
  return jsonb_build_object('success', true, 'target_user_id', p_target_user_id, 'role', p_role, 'first_bootstrap', v_staff_count = 0);
end;
$$;

revoke execute on function public.bootstrap_first_platform_staff(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_platform_staff(uuid, uuid, text) to service_role;

create or replace function public.prevent_completed_audit_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.audit_completed_at is not null and (
    new.completed_by is distinct from old.completed_by or
    new.audit_completed_at is distinct from old.audit_completed_at or
    new.delivered_at is distinct from old.delivered_at or
    new.audit_fee_cents is distinct from old.audit_fee_cents or
    new.credit_eligible_from is distinct from old.credit_eligible_from or
    new.credit_expires_at is distinct from old.credit_expires_at
  ) then
    raise exception 'completed audit fields are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists audit_orders_completed_fields_immutable on public.audit_orders;
create trigger audit_orders_completed_fields_immutable
before update on public.audit_orders
for each row execute function public.prevent_completed_audit_rewrite();

revoke all on public.platform_admin_events from public, anon, authenticated;
revoke update, delete, truncate on public.platform_admin_events from service_role;
grant select, insert on public.platform_admin_events to service_role;

create or replace function public.prevent_platform_admin_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'platform_admin_events are immutable';
end;
$$;

drop trigger if exists platform_admin_events_immutable on public.platform_admin_events;
create trigger platform_admin_events_immutable
before update or delete on public.platform_admin_events
for each row execute function public.prevent_platform_admin_event_mutation();

comment on trigger platform_admin_events_immutable on public.platform_admin_events is
  'Formal correction requires database-owner change control and a new compensating event; application roles, including service_role, cannot rewrite history.';
comment on trigger audit_orders_completed_fields_immutable on public.audit_orders is
  'Formal correction requires database-owner change control, documented trigger suspension, correction, and a compensating platform_admin_event.';
