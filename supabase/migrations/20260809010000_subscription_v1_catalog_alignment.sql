-- Additive alignment for the Notion v1 subscription catalog.
-- Preserves historical legacy rows, but only starter/growth/business may be newly inserted.
-- Free is not a paid subscription and Scale / Custom requires a future approved quote workflow.

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_tier_check;

alter table public.subscriptions
  add constraint subscriptions_plan_tier_check
  check (plan_tier in ('launch', 'custom_growth', 'starter', 'growth', 'business', 'scale'));

create or replace function public.enforce_new_subscription_v1_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_tier not in ('starter', 'growth', 'business') then
    raise exception 'new paid subscriptions require a self-checkout v1 tier (starter, growth, business); got %', new.plan_tier
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists subscriptions_new_v1_tier_guard on public.subscriptions;
create trigger subscriptions_new_v1_tier_guard
before insert or update of plan_tier on public.subscriptions
for each row execute function public.enforce_new_subscription_v1_tier();

revoke all on function public.enforce_new_subscription_v1_tier() from public, anon, authenticated;
grant execute on function public.enforce_new_subscription_v1_tier() to service_role;

-- Patch only the catalog declarations and branch in the latest restored v4 body.
-- Abort the migration if the expected hardened body is not installed; never replace an unknown body.
-- The existing final else/unknown_plan_tier branch is intentionally preserved unchanged.
do $catalog_alignment$
declare
  v_signature regprocedure := 'public.reconcile_and_fulfill_razorpay_payment_v4(text,text,text,text,text,bigint,text,text,boolean,text,timestamptz)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_original text := v_definition;
begin
  if position('v_limits_launch int[] := array[12, 1, 500, 0];' in v_definition) = 0
     or position('v_limits_growth int[] := array[30, 2, 2500, 1];' in v_definition) = 0
     or position('v_limits_custom int[] := array[60, 4, 10000, 1];' in v_definition) = 0 then
    raise exception 'refusing catalog alignment: latest hardened v4 entitlement declarations not found';
  end if;

  v_definition := replace(v_definition,
    'v_limits_launch int[] := array[12, 1, 500, 0];',
    'v_limits_starter int[] := array[12, 1, 100, 0];');
  v_definition := replace(v_definition,
    'v_limits_growth int[] := array[30, 2, 2500, 1];',
    'v_limits_growth int[] := array[25, 1, 500, 1];');
  v_definition := replace(v_definition,
    'v_limits_custom int[] := array[60, 4, 10000, 1];',
    'v_limits_business int[] := array[50, 3, 1500, 1];');

  v_definition := replace(v_definition,
$old$if v_plan_tier = 'launch' then
      v_base_price := 949900;
      v_limits := v_limits_launch;
    elsif v_plan_tier = 'growth' then
      v_base_price := 1899900;
      v_limits := v_limits_growth;
    elsif v_plan_tier = 'custom_growth' then
      v_base_price := 2399900;
      v_limits := v_limits_custom;
    else$old$,
$new$if v_plan_tier = 'starter' then
      v_base_price := 499900;
      v_limits := v_limits_starter;
    elsif v_plan_tier = 'growth' then
      v_base_price := 999900;
      v_limits := v_limits_growth;
    elsif v_plan_tier = 'business' then
      v_base_price := 1999900;
      v_limits := v_limits_business;
    elsif v_plan_tier in ('launch', 'custom_growth') then
      return jsonb_build_object('fulfilled', false, 'reason', 'legacy_plan_not_payable', 'plan_tier', v_plan_tier);
    elsif v_plan_tier in ('free', 'scale') then
      return jsonb_build_object('fulfilled', false, 'reason', 'plan_not_self_checkout', 'plan_tier', v_plan_tier);
    else$new$);

  if v_definition = v_original
     or position('v_base_price := 499900;' in v_definition) = 0
     or position('legacy_plan_not_payable' in v_definition) = 0
     or position('plan_not_self_checkout' in v_definition) = 0 then
    raise exception 'refusing catalog alignment: v4 plan branch did not patch exactly';
  end if;

  execute v_definition;
end;
$catalog_alignment$;

revoke execute on function public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz) to service_role;

comment on function public.reconcile_and_fulfill_razorpay_payment_v4(text, text, text, text, text, bigint, text, text, boolean, text, timestamptz)
is 'Hardened payment v4 reconciliation with Notion v1 Starter/Growth/Business catalog; Free, Scale, legacy, unknown, and mismatched payments fail closed.';
