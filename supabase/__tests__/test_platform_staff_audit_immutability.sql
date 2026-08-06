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
  r jsonb;
BEGIN
  if exists(select 1 from platform_staff_users where is_active) then
    raise notice 'bootstrap mutation fixtures skipped: existing platform owner preserved';
    return;
  end if;
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(u_unverified,'authenticated','authenticated','unverified@example.invalid','{}','{}');
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(u_verified,'authenticated','authenticated','verified@example.invalid',now(),'{}','{}');
  r := bootstrap_first_platform_staff(u_unverified,u_verified,'platform_owner');
  if r->>'reason' <> 'target_user_missing_or_unverified' then raise exception 'unverified target accepted: %', r; end if;
  r := bootstrap_first_platform_staff(u_verified,null,'platform_owner');
  if r->>'reason' <> 'missing_bootstrap_actor_or_source' then raise exception 'missing actor/source accepted: %', r; end if;
  r := bootstrap_first_platform_staff(u_verified,u_verified,'invalid');
  if r->>'reason' <> 'invalid_platform_staff_role' then raise exception 'invalid role accepted: %', r; end if;
END;
$$;
ROLLBACK;
