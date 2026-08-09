\set ON_ERROR_STOP on
do $$
declare
  v_def text := pg_get_functiondef('public.reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamptz)'::regprocedure);
begin
  if v_def !~ 'v_base_price := 499900' or v_def !~ 'v_base_price := 999900' or v_def !~ 'v_base_price := 1999900' then raise exception 'v1 subscription prices missing'; end if;
  if v_def !~ 'ARRAY\[12, 1, 100, 0\]' or v_def !~ 'ARRAY\[25, 1, 500, 1\]' or v_def !~ 'ARRAY\[50, 3, 1500, 1\]' then raise exception 'v1 entitlement limits missing'; end if;
  if v_def !~ 'legacy_plan_not_payable' or v_def !~ 'plan_not_self_checkout' or v_def !~ 'unknown_plan_tier' then raise exception 'fail-closed tier branches missing'; end if;
  if has_function_privilege('anon', 'public.reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamptz)', 'EXECUTE') or has_function_privilege('authenticated', 'public.reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamptz)', 'EXECUTE') then raise exception 'payment v4 execute ACL widened'; end if;
end $$;
