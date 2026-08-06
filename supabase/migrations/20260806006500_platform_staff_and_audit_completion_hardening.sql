-- Additive migration: Platform Staff Bootstrap and Audit Completion Hardening (v5)
-- 1. Creates platform_admin_events table for immutable security audit trail.
-- 2. Adds bootstrap_first_platform_staff RPC for secure one-time staff initialization.
-- 3. Adds completed_by and delivered_at columns to audit_orders table.
-- 4. Replaces complete_audit_and_issue_subscription_credit_v4 with v5 enforcing:
--    - Active platform-staff actor requirement (tenant membership alone is insufficient)
--    - Immutable completed_by and audit_completed_at fields
--    - Rejection of already-completed, cancelled, refunded, or invalid audit orders
--    - Cross-tenant modification protection
--    - Immutable administrative security log entry

create table if not exists public.platform_admin_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid,
  actor_user_id uuid,
  actor_type text not null default 'system',
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.platform_admin_events enable row level security;
revoke all on public.platform_admin_events from public, anon, authenticated;
grant select, insert on public.platform_admin_events to service_role;

-- 1-Time Platform Staff Bootstrap RPC
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
  v_user_exists boolean;
  v_staff_count integer;
  v_role text;
begin
  if p_target_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_target_user_id');
  end if;

  -- 1. Check target user exists in auth.users
  select exists(select 1 from auth.users where id = p_target_user_id) into v_user_exists;
  if not v_user_exists then
    return jsonb_build_object('success', false, 'reason', 'target_user_not_found');
  end if;

  -- 2. Check if platform staff already exists
  select count(*) into v_staff_count from public.platform_staff_users where is_active = true;
  if v_staff_count > 0 then
    if p_actor_user_id is null or not exists(
      select 1 from public.platform_staff_users
      where user_id = p_actor_user_id and is_active = true and role = 'platform_owner'
    ) then
      return jsonb_build_object('success', false, 'reason', 'platform_staff_already_exists');
    end if;
  end if;

  v_role := coalesce(p_role, 'platform_owner');
  if v_role not in ('platform_owner', 'platform_admin', 'audit_reviewer', 'finance_reviewer') then
    v_role := 'platform_owner';
  end if;

  -- 3. Upsert platform staff user
  insert into public.platform_staff_users (user_id, role, is_active, created_by)
  values (p_target_user_id, v_role, true, p_actor_user_id)
  on conflict (user_id) do update
  set role = v_role, is_active = true, updated_at = now();

  -- 4. Record immutable admin event
  insert into public.platform_admin_events (
    target_user_id, actor_user_id, actor_type, action, metadata
  ) values (
    p_target_user_id,
    p_actor_user_id,
    case when p_actor_user_id is not null then 'staff_user' else 'system' end,
    'bootstrap_platform_staff',
    jsonb_build_object('assigned_role', v_role, 'first_bootstrap', (v_staff_count = 0))
  );

  return jsonb_build_object(
    'success', true,
    'target_user_id', p_target_user_id,
    'role', v_role,
    'first_bootstrap', (v_staff_count = 0)
  );
end;
$$;

revoke execute on function public.bootstrap_first_platform_staff(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_platform_staff(uuid, uuid, text) to service_role;


-- Audit Orders Hardening Columns
alter table public.audit_orders
  add column if not exists completed_by uuid references auth.users(id) on delete set null,
  add column if not exists delivered_at timestamptz;


-- Complete Audit v5 RPC
create or replace function public.complete_audit_and_issue_subscription_credit_v5(
  p_audit_order_id uuid,
  p_expected_tenant_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit record;
  v_staff record;
begin
  if p_actor_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_actor_user_id');
  end if;

  -- 1. Platform Staff Authorization Check
  select * into v_staff from public.platform_staff_users
  where user_id = p_actor_user_id and is_active = true;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'non_staff_actor');
  end if;

  -- 2. Lock Audit Order
  select * into v_audit from public.audit_orders where id = p_audit_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'audit_order_not_found');
  end if;

  -- 3. Cross-Tenant Protection
  if v_audit.tenant_id <> p_expected_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  -- 4. State & Immutability Checks
  if v_audit.status = 'completed' or v_audit.completed_by is not null then
    return jsonb_build_object('success', false, 'reason', 'audit_already_completed', 'status', v_audit.status);
  end if;

  if v_audit.status in ('cancelled', 'refunded') then
    return jsonb_build_object('success', false, 'reason', 'audit_cancelled_or_refunded', 'status', v_audit.status);
  end if;

  if v_audit.status <> 'paid' and v_audit.status <> 'in_review' then
    return jsonb_build_object('success', false, 'reason', 'invalid_audit_state', 'status', v_audit.status);
  end if;

  -- 5. Atomic Completion Update
  update public.audit_orders
  set status = 'completed',
      completed_by = p_actor_user_id,
      audit_completed_at = coalesce(audit_completed_at, now()),
      delivered_at = coalesce(delivered_at, now()),
      credit_eligible_from = coalesce(credit_eligible_from, now()),
      credit_expires_at = coalesce(credit_expires_at, now() + interval '7 days'),
      updated_at = now()
  where id = p_audit_order_id;

  -- 6. Log Immutable Security Event
  insert into public.platform_admin_events (
    target_user_id, actor_user_id, actor_type, action, metadata
  ) values (
    v_audit.user_id,
    p_actor_user_id,
    'staff_user',
    'complete_audit',
    jsonb_build_object(
      'audit_order_id', p_audit_order_id,
      'tenant_id', v_audit.tenant_id,
      'fee_cents', v_audit.audit_fee_cents,
      'staff_role', v_staff.role
    )
  );

  return jsonb_build_object(
    'success', true,
    'audit_order_id', p_audit_order_id,
    'tenant_id', v_audit.tenant_id,
    'completed_by', p_actor_user_id,
    'credit_expires_at', coalesce(v_audit.credit_expires_at, now() + interval '7 days'),
    'credit_amount_cents', coalesce(v_audit.audit_fee_cents, 99900)
  );
end;
$$;

-- Revoke execution of complete_audit_and_issue_subscription_credit_v4 from all roles
revoke execute on function public.complete_audit_and_issue_subscription_credit_v4(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- Grant execution of complete_audit_and_issue_subscription_credit_v5 strictly to service_role
revoke execute on function public.complete_audit_and_issue_subscription_credit_v5(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_audit_and_issue_subscription_credit_v5(uuid, uuid, uuid) to service_role;
