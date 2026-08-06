\set ON_ERROR_STOP on

DO $$
DECLARE
  v_bootstrap text := pg_get_functiondef('public.bootstrap_first_platform_staff(uuid,uuid,text)'::regprocedure);
  v_guard text := pg_get_functiondef('public.prevent_completed_audit_rewrite()'::regprocedure);
BEGIN
  if v_bootstrap !~ 'pg_advisory_xact_lock' then raise exception 'bootstrap is not race-safe'; end if;
  if v_bootstrap !~ 'email_confirmed_at' or v_bootstrap !~ 'phone_confirmed_at' then raise exception 'verified target evidence missing'; end if;
  if v_bootstrap !~ 'missing_bootstrap_actor_or_source' then raise exception 'actor/source evidence missing'; end if;
  if v_bootstrap !~ 'invalid_platform_staff_role' then raise exception 'invalid role does not fail closed'; end if;
  if v_bootstrap !~ 'active_platform_owner_required' then raise exception 'subsequent assignment owner guard missing'; end if;
  if v_guard !~ 'completed_by is distinct from old.completed_by' or
     v_guard !~ 'audit_completed_at is distinct from old.audit_completed_at' or
     v_guard !~ 'delivered_at is distinct from old.delivered_at' or
     v_guard !~ 'audit_fee_cents is distinct from old.audit_fee_cents' or
     v_guard !~ 'credit_eligible_from is distinct from old.credit_eligible_from' or
     v_guard !~ 'credit_expires_at is distinct from old.credit_expires_at' then
    raise exception 'completed audit immutability guard is incomplete';
  end if;
  if has_table_privilege('public', 'public.platform_admin_events', 'update') or
     has_table_privilege('anon', 'public.platform_admin_events', 'update') or
     has_table_privilege('authenticated', 'public.platform_admin_events', 'update') or
     has_table_privilege('service_role', 'public.platform_admin_events', 'update') or
     has_table_privilege('public', 'public.platform_admin_events', 'delete') or
     has_table_privilege('anon', 'public.platform_admin_events', 'delete') or
     has_table_privilege('authenticated', 'public.platform_admin_events', 'delete') or
     has_table_privilege('service_role', 'public.platform_admin_events', 'delete') then
    raise exception 'admin event mutation privilege remains';
  end if;
END;
$$;

-- Behavior fixtures run on an isolated database and never touch an existing owner.
BEGIN;
DO $$
DECLARE
  u_unverified uuid := gen_random_uuid();
  u_verified uuid := gen_random_uuid();
  u_owner uuid := gen_random_uuid();
  u_staff uuid := gen_random_uuid();
  v_tenant uuid;
  v_audit uuid;
  v_completed_by uuid;
  v_audit_completed_at timestamptz;
  v_delivered_at timestamptz;
  v_audit_fee_cents bigint;
  v_credit_eligible_from timestamptz;
  v_credit_expires_at timestamptz;
  v_field text;
  r jsonb;
BEGIN
  if exists(select 1 from platform_staff_users where is_active) then
    raise notice 'bootstrap mutation fixtures skipped: existing platform owner preserved';
    return;
  end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(u_unverified,'authenticated','authenticated','unverified@example.invalid','{}','{}');
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(u_verified,'authenticated','authenticated','verified@example.invalid',now(),'{}','{}');
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  values
    (u_owner,'authenticated','authenticated','owner@example.invalid',now(),'{}','{}'),
    (u_staff,'authenticated','authenticated','staff@example.invalid',now(),'{}','{}');
  r := bootstrap_first_platform_staff(u_unverified,u_verified,'platform_owner');
  if r->>'reason' <> 'target_user_missing_or_unverified' then raise exception 'unverified target accepted: %', r; end if;
  r := bootstrap_first_platform_staff(u_verified,null,'platform_owner');
  if r->>'reason' <> 'missing_bootstrap_actor_or_source' then raise exception 'missing actor/source accepted: %', r; end if;
  r := bootstrap_first_platform_staff(u_verified,u_verified,'invalid');
  if r->>'reason' <> 'invalid_platform_staff_role' then raise exception 'invalid role accepted: %', r; end if;
  r := bootstrap_first_platform_staff(u_owner,u_owner,'platform_owner');
  if (r->>'success')::boolean is not true then raise exception 'first verified owner rejected: %', r; end if;
  r := bootstrap_first_platform_staff(u_staff,u_staff,'audit_reviewer');
  if r->>'reason' <> 'active_platform_owner_required' then raise exception 'non-owner later assignment accepted: %', r; end if;

  insert into tenants(name, slug)
  values ('Audit Immutability Tenant', 'audit-immutability-' || gen_random_uuid()::text)
  returning id into v_tenant;
  insert into audit_orders(
    tenant_id, business_name, status, completed_by, audit_completed_at, delivered_at,
    audit_fee_cents, credit_eligible_from, credit_expires_at
  )
  values (
    v_tenant, 'Immutable Audit', 'completed', u_owner, now() - interval '1 hour', now(),
    99900, now(), now() + interval '7 days'
  )
  returning id, completed_by, audit_completed_at, delivered_at, audit_fee_cents, credit_eligible_from, credit_expires_at
  into v_audit, v_completed_by, v_audit_completed_at, v_delivered_at, v_audit_fee_cents, v_credit_eligible_from, v_credit_expires_at;

  foreach v_field in array array['completed_by', 'audit_completed_at', 'delivered_at', 'audit_fee_cents', 'credit_eligible_from', 'credit_expires_at'] loop
    begin
      execute format(
        'update audit_orders set %I = case %L
           when ''completed_by'' then gen_random_uuid()::text
           when ''audit_fee_cents'' then ''100000''
           else now()::text
         end::%s where id = $1',
        v_field,
        v_field,
        case when v_field = 'completed_by' then 'uuid' when v_field = 'audit_fee_cents' then 'bigint' else 'timestamptz' end
      ) using v_audit;
      raise exception 'completed audit field update unexpectedly succeeded: %', v_field;
    exception when raise_exception then
      if sqlerrm <> 'completed audit fields are immutable' then raise; end if;
    end;

    begin
      execute format('update audit_orders set %I = null where id = $1', v_field) using v_audit;
      raise exception 'completed audit field clear unexpectedly succeeded: %', v_field;
    exception when raise_exception then
      if sqlerrm <> 'completed audit fields are immutable' then raise; end if;
    end;

    if not exists (
      select 1 from audit_orders
      where id = v_audit
        and completed_by is not distinct from v_completed_by
        and audit_completed_at is not distinct from v_audit_completed_at
        and delivered_at is not distinct from v_delivered_at
        and audit_fee_cents is not distinct from v_audit_fee_cents
        and credit_eligible_from is not distinct from v_credit_eligible_from
        and credit_expires_at is not distinct from v_credit_expires_at
    ) then
      raise exception 'completed audit row mutated after rejected % update', v_field;
    end if;
  end loop;

  insert into platform_admin_events(target_user_id, actor_user_id, actor_type, action, metadata)
  values (u_staff, u_owner, 'verified_auth_user', 'test_immutable_event', '{}');
  foreach v_field in array array['authenticated', 'anon'] loop
    begin
      execute format('set local role %I', v_field);
      update platform_admin_events set metadata = '{"mutated":true}'::jsonb where target_user_id = u_staff;
      raise exception 'platform_admin_events update unexpectedly succeeded through %', v_field;
    exception when insufficient_privilege then
      reset role;
    end;
    begin
      execute format('set local role %I', v_field);
      delete from platform_admin_events where target_user_id = u_staff;
      raise exception 'platform_admin_events delete unexpectedly succeeded through %', v_field;
    exception when insufficient_privilege then
      reset role;
    end;
  end loop;
END;
$$;
ROLLBACK;
