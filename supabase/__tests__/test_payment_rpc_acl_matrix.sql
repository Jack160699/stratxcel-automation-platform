\set ON_ERROR_STOP on

DO $$
DECLARE
  f record;
  r text;
  allowed boolean;
  current_rpc boolean;
BEGIN
  for f in
    select p.oid::regprocedure signature, p.proname, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (
      p.proname ~ '^reconcile_and_fulfill_razorpay_payment_v[1-4]$' or
      p.proname ~ '^process_refund_atomic_v([1-9]|10|11)$' or
      p.proname in ('claim_razorpay_webhook_event','complete_razorpay_webhook_event','bootstrap_first_platform_staff','complete_audit_and_issue_subscription_credit_v4','complete_audit_and_issue_subscription_credit_v5')
    )
  loop
    current_rpc := f.proname in (
      'reconcile_and_fulfill_razorpay_payment_v4','process_refund_atomic_v11',
      'claim_razorpay_webhook_event','complete_razorpay_webhook_event',
      'bootstrap_first_platform_staff','complete_audit_and_issue_subscription_credit_v5'
    );
    foreach r in array array['public','anon','authenticated','service_role'] loop
      execute format('select has_function_privilege(%L, %L, %L)', r, f.signature::text, 'execute') into allowed;
      if allowed is distinct from (current_rpc and r='service_role') then
        raise exception 'ACL mismatch: role=% signature=% allowed=% expected=%', r, f.signature, allowed, current_rpc and r='service_role';
      end if;
    end loop;
    if f.prosecdef and not ('search_path=public'=any(coalesce(f.proconfig,array[]::text[]))) then
      raise exception 'SECURITY DEFINER search_path mismatch: % config=%', f.signature, f.proconfig;
    end if;
  end loop;

  if not exists(select 1 from pg_proc where proname='reconcile_and_fulfill_razorpay_payment_v4') or
     not exists(select 1 from pg_proc where proname='process_refund_atomic_v11') or
     not exists(select 1 from pg_proc where proname='claim_razorpay_webhook_event') or
     not exists(select 1 from pg_proc where proname='complete_razorpay_webhook_event') or
     not exists(select 1 from pg_proc where proname='bootstrap_first_platform_staff') or
     not exists(select 1 from pg_proc where proname='complete_audit_and_issue_subscription_credit_v5') then
    raise exception 'one or more required current RPCs are absent';
  end if;
END;
$$;
