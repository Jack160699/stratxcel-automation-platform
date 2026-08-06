\set ON_ERROR_STOP on

DO $$
DECLARE
  f record;
  r text;
  allowed boolean;
  public_allowed boolean;
  current_rpc boolean;
BEGIN
  perform 'public.reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamp with time zone)'::regprocedure;
  perform 'public.process_refund_atomic_v11(uuid,uuid,text,text,bigint,text,text)'::regprocedure;
  perform 'public.claim_razorpay_webhook_event(text,text,jsonb,integer)'::regprocedure;
  perform 'public.complete_razorpay_webhook_event(uuid,text)'::regprocedure;
  perform 'public.bootstrap_first_platform_staff(uuid,uuid,text)'::regprocedure;
  perform 'public.complete_audit_and_issue_subscription_credit_v5(uuid,uuid,uuid)'::regprocedure;

  for f in
    select p.oid, p.oid::regprocedure signature, p.proname, p.prosecdef, p.proconfig, p.proacl, p.proowner
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (
      p.proname ~ '^reconcile_and_fulfill_razorpay_payment_v[1-4]$' or
      p.proname ~ '^process_refund_atomic_v([1-9]|10|11)$' or
      p.proname in ('claim_razorpay_webhook_event','complete_razorpay_webhook_event','bootstrap_first_platform_staff','complete_audit_and_issue_subscription_credit_v4','complete_audit_and_issue_subscription_credit_v5')
    )
  loop
    current_rpc := f.signature::text in (
      'reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamp with time zone)',
      'process_refund_atomic_v11(uuid,uuid,text,text,bigint,text,text)',
      'claim_razorpay_webhook_event(text,text,jsonb,integer)',
      'complete_razorpay_webhook_event(uuid,text)',
      'bootstrap_first_platform_staff(uuid,uuid,text)',
      'complete_audit_and_issue_subscription_credit_v5(uuid,uuid,uuid)'
    );

    select exists (
      select 1
      from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) into public_allowed;
    if public_allowed then
      raise exception 'PUBLIC execute remains on %', f.signature;
    end if;

    foreach r in array array['anon','authenticated','service_role'] loop
      execute format('select has_function_privilege(%L, %L, %L)', r, f.signature::text, 'execute') into allowed;
      if allowed is distinct from (current_rpc and r='service_role') then
        raise exception 'ACL mismatch: role=% signature=% allowed=% expected=%', r, f.signature, allowed, current_rpc and r='service_role';
      end if;
    end loop;

    if f.prosecdef and not ('search_path=public'=any(coalesce(f.proconfig,array[]::text[]))) then
      raise exception 'SECURITY DEFINER search_path mismatch: % config=%', f.signature, f.proconfig;
    end if;
  end loop;
END;
$$;
