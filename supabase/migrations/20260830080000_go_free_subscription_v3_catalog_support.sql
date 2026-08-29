-- Migration: GoFree subscription activation -- widen plan-tier support to the
-- real, current v3 self-service catalog.
--
-- Real bug found live (Hermes Autonomous Social Autopilot mission, real
-- end-to-end test): 20260823130000_go_free_subscription_activation.sql's
-- redeem_subscription_go_free_code_v1 / validate_subscription_go_free_code_v1
-- only ever recognized 'starter'/'growth'/'business' -- the OLD v2 commercial
-- model. Those three tiers are now selfServiceCheckout: false / status:
-- "legacy" in packages/payments-and-wallet/src/plans.ts and are not offered
-- anywhere in the current product (the actual purchasable plan grid on
-- /app/billing is SEO Growth / Social Content / Advanced SEO / Advanced
-- Social / Advanced Growth / two one-time website plans). Confirmed live:
-- redeeming an approved code against the current catalog always failed with
-- "This plan isn't available for GoFree activation." -- the entire GoFree
-- subscription-code feature was unable to activate any plan a real customer
-- can actually buy today. A StratXcel-specific workaround was rejected in
-- favor of this general platform fix (Hermes mission Section 89: "build the
-- generalized customer-generation engine").
--
-- Additive only -- create or replace, same signatures, same hardening. The
-- existing starter/growth/business branches are untouched (any legacy code
-- still targeting them keeps working exactly as before); this only ADDS
-- branches for the 5 real RECURRING self-service tiers (seo, social,
-- advanced_seo, advanced_social, advanced_growth). The two one-time website
-- plans (website_landing_page, website_standard) are deliberately NOT added
-- here -- this RPC grants a 30-day subscriptions row, which doesn't match a
-- one-time purchase's real semantics; they're handled by a separate flow.
--
-- Every price and every 6-element v_limits array below is the exact real
-- value from packages/payments-and-wallet/src/plans.ts (PLAN_DEFINITIONS.
-- {tier}.priceCents) and entitlements.ts (PLAN_LIMITS.{tier} in the order
-- [social_posts, meta_ad_campaigns, whatsapp_contacts, website_maintenance,
-- content_generation_monthly, automated_content_monthly]) -- verified against
-- that TS source before writing this, not guessed.

create or replace function public.validate_subscription_go_free_code_v1(
  p_code_hash text,
  p_plan_tier text,
  p_customer_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo public.promo_codes;
  v_email text;
  v_use_count integer;
  v_customer_use_count integer;
  v_price_cents bigint;
begin
  if p_code_hash is null or length(trim(p_code_hash)) = 0 then
    return jsonb_build_object('valid', false, 'reason', 'invalid_code', 'message', 'This code is invalid.');
  end if;

  if p_plan_tier = 'starter' then v_price_cents := 299900;
  elsif p_plan_tier = 'growth' then v_price_cents := 799900;
  elsif p_plan_tier = 'business' then v_price_cents := 1599900;
  elsif p_plan_tier = 'seo' then v_price_cents := 299900;
  elsif p_plan_tier = 'social' then v_price_cents := 399900;
  elsif p_plan_tier = 'advanced_seo' then v_price_cents := 999900;
  elsif p_plan_tier = 'advanced_social' then v_price_cents := 849900;
  elsif p_plan_tier = 'advanced_growth' then v_price_cents := 1849800;
  else
    return jsonb_build_object('valid', false, 'reason', 'plan_not_self_checkout', 'message', 'This plan is not available for GoFree activation.');
  end if;

  select * into v_promo from public.promo_codes where code_hash = p_code_hash;
  if not found or not v_promo.is_active then
    return jsonb_build_object('valid', false, 'reason', 'invalid_code', 'message', 'This code is invalid.');
  end if;

  if v_promo.payment_purpose <> 'subscription_payment' then
    return jsonb_build_object('valid', false, 'reason', 'wrong_product', 'message', 'This code isn''t available for this product.');
  end if;

  if now() < v_promo.valid_from then
    return jsonb_build_object('valid', false, 'reason', 'not_yet_valid', 'message', 'This code is invalid.');
  end if;

  if v_promo.expires_at is not null and now() >= v_promo.expires_at then
    return jsonb_build_object('valid', false, 'reason', 'expired', 'message', 'This code has expired.');
  end if;

  v_email := lower(trim(coalesce(p_customer_email, '')));
  if v_promo.allowed_email is not null then
    if v_email = '' or lower(trim(v_promo.allowed_email)) <> v_email then
      return jsonb_build_object('valid', false, 'reason', 'email_restricted', 'message', 'This code is invalid.');
    end if;
  end if;

  select count(*) into v_use_count from public.promo_redemptions where promo_code_id = v_promo.id;
  if v_promo.max_redemptions is not null and v_use_count >= v_promo.max_redemptions then
    return jsonb_build_object('valid', false, 'reason', 'max_uses', 'message', 'This code has already been used.');
  end if;

  if v_email <> '' then
    select count(*) into v_customer_use_count
    from public.promo_redemptions
    where promo_code_id = v_promo.id and customer_email = v_email;
    if v_customer_use_count >= v_promo.max_redemptions_per_customer then
      return jsonb_build_object('valid', false, 'reason', 'per_customer_limit', 'message', 'This code has already been used.');
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'plan_tier', p_plan_tier,
    'product_scope', v_promo.product_scope,
    'payment_purpose', v_promo.payment_purpose,
    'discount_percent', v_promo.discount_percent,
    'list_price_cents', v_price_cents,
    'discount_cents', v_price_cents,
    'amount_due_cents', 0,
    'code_prefix', v_promo.code_prefix
  );
end;
$$;

revoke execute on function public.validate_subscription_go_free_code_v1(text, text, text)
  from public, anon, authenticated;
grant execute on function public.validate_subscription_go_free_code_v1(text, text, text)
  to service_role;

create or replace function public.redeem_subscription_go_free_code_v1(
  p_code_hash text,
  p_expected_tenant_id uuid,
  p_plan_tier text,
  p_customer_email text,
  p_idempotency_key text,
  p_actor_user_id uuid default null,
  p_price_cents bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo public.promo_codes;
  v_existing public.promo_redemptions;
  v_existing_sub public.subscriptions;
  v_redemption_id uuid;
  v_subscription_id uuid;
  v_email text;
  v_use_count integer;
  v_customer_use_count integer;
  v_price_cents bigint;
  v_metrics text[] := array['social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance', 'content_generation_monthly', 'automated_content_monthly'];
  v_limits int[];
  v_period_start timestamptz := now();
  v_period_end timestamptz := now() + interval '30 days';
  i int;
begin
  if p_code_hash is null or length(trim(p_code_hash)) = 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_code', 'message', 'This code is invalid.');
  end if;
  if p_expected_tenant_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_tenant', 'message', 'This code is invalid.');
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('success', false, 'reason', 'missing_idempotency_key', 'message', 'This code is invalid.');
  end if;

  -- Server-independent price/limits derivation. The legacy v2 branches
  -- (starter/growth/business) are untouched; the tiers below are the real,
  -- current, RECURRING self-service catalog (packages/payments-and-wallet/
  -- src/plans.ts PLAN_DEFINITIONS, selfServiceCheckout: true, status:
  -- "active", billingType: "RECURRING"). Any other plan_tier fails closed,
  -- exactly mirroring reconcile_and_fulfill_razorpay_payment_v4's own branch.
  if p_plan_tier = 'starter' then
    v_price_cents := 299900;
    v_limits := array[12, 1, 100, 0, 10, 0];
  elsif p_plan_tier = 'growth' then
    v_price_cents := 799900;
    v_limits := array[25, 1, 500, 1, 20, 10];
  elsif p_plan_tier = 'business' then
    v_price_cents := 1599900;
    v_limits := array[50, 3, 1500, 1, 30, 0];
  elsif p_plan_tier = 'seo' then
    v_price_cents := 299900;
    v_limits := array[0, 0, 0, 0, 0, 0];
  elsif p_plan_tier = 'social' then
    v_price_cents := 399900;
    v_limits := array[28, 0, 0, 0, 28, 0];
  elsif p_plan_tier = 'advanced_seo' then
    v_price_cents := 999900;
    v_limits := array[0, 0, 0, 0, 0, 0];
  elsif p_plan_tier = 'advanced_social' then
    v_price_cents := 849900;
    v_limits := array[28, 0, 0, 0, 28, 28];
  elsif p_plan_tier = 'advanced_growth' then
    v_price_cents := 1849800;
    v_limits := array[28, 0, 0, 1, 28, 28];
  else
    return jsonb_build_object('success', false, 'reason', 'plan_not_self_checkout', 'message', 'This plan is not available for GoFree activation.');
  end if;

  if p_price_cents is not null and p_price_cents is distinct from v_price_cents then
    return jsonb_build_object('success', false, 'reason', 'price_mismatch', 'message', 'This code is invalid.');
  end if;

  v_email := lower(trim(coalesce(p_customer_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_email', 'message', 'This code is invalid.');
  end if;

  -- Idempotent replay by key — a retried/duplicated client request must never
  -- create a second subscription.
  select * into v_existing
  from public.promo_redemptions
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'success', true,
      'already_redeemed', true,
      'redemption_id', v_existing.id,
      'subscription_id', v_existing.subscription_id,
      'amount_due_cents', 0
    );
  end if;

  select * into v_promo
  from public.promo_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'invalid_code', 'message', 'This code is invalid.');
  end if;

  if not v_promo.is_active then
    return jsonb_build_object('success', false, 'reason', 'disabled', 'message', 'This code is invalid.');
  end if;

  if v_promo.payment_purpose <> 'subscription_payment' or v_promo.product_scope <> 'subscription_payment' then
    return jsonb_build_object('success', false, 'reason', 'wrong_product', 'message', 'This code isn''t available for this product.');
  end if;

  if now() < v_promo.valid_from then
    return jsonb_build_object('success', false, 'reason', 'not_yet_valid', 'message', 'This code is invalid.');
  end if;

  if v_promo.expires_at is not null and now() >= v_promo.expires_at then
    return jsonb_build_object('success', false, 'reason', 'expired', 'message', 'This code has expired.');
  end if;

  if v_promo.allowed_email is not null
     and lower(trim(v_promo.allowed_email)) <> v_email then
    return jsonb_build_object('success', false, 'reason', 'email_restricted', 'message', 'This code is invalid.');
  end if;

  -- Tenant must actually exist (defense in depth — the calling route already
  -- re-derives tenant_id from the caller's own session/tenant_members row;
  -- this RPC never trusts it beyond that).
  if not exists (select 1 from public.tenants where id = p_expected_tenant_id) then
    return jsonb_build_object('success', false, 'reason', 'tenant_not_found', 'message', 'This code is invalid.');
  end if;

  -- One GoFree trial per tenant at a time — a tenant with an existing active/
  -- pending real or trial subscription cannot double-activate.
  select * into v_existing_sub
  from public.subscriptions
  where tenant_id = p_expected_tenant_id
    and status in ('active', 'pending_payment', 'past_due')
  order by created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object('success', false, 'reason', 'tenant_already_has_subscription', 'message', 'This code is invalid.');
  end if;

  select count(*) into v_use_count
  from public.promo_redemptions
  where promo_code_id = v_promo.id;

  if v_promo.max_redemptions is not null and v_use_count >= v_promo.max_redemptions then
    return jsonb_build_object('success', false, 'reason', 'max_uses', 'message', 'This code has already been used.');
  end if;

  select count(*) into v_customer_use_count
  from public.promo_redemptions
  where promo_code_id = v_promo.id
    and customer_email = v_email;

  if v_customer_use_count >= v_promo.max_redemptions_per_customer then
    return jsonb_build_object('success', false, 'reason', 'per_customer_limit', 'message', 'This code has already been used.');
  end if;

  insert into public.subscriptions (
    tenant_id, plan_tier, price_cents, status,
    current_period_start, current_period_end, paid_months_count,
    activated_at, entitlements_granted_at, fulfilment_status, billing_provider
  ) values (
    p_expected_tenant_id, p_plan_tier, 0, 'active',
    v_period_start, v_period_end, 0,
    now(), now(), 'go_free_trial_activated', 'go_free_trial'
  )
  returning id into v_subscription_id;

  -- Mirrors the exact base_limit_amount/bonus_limit_amount upsert pattern used by
  -- reconcile_and_fulfill_razorpay_subscription_charge (20260811140000) — limit_amount
  -- is always base + bonus, never set directly, so a later continuation-pack purchase
  -- (which only ever touches bonus_limit_amount) composes correctly on top of this grant.
  for i in 1 .. array_length(v_metrics, 1) loop
    insert into public.usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
    values (p_expected_tenant_id, v_subscription_id, v_metrics[i], v_limits[i], 0, v_limits[i], 0)
    on conflict (tenant_id, metric) do update
      set base_limit_amount = excluded.base_limit_amount,
          limit_amount = excluded.base_limit_amount + usage_entitlements.bonus_limit_amount,
          subscription_id = excluded.subscription_id,
          current_usage = 0,
          is_paused = false,
          notification_sent_80 = false,
          notification_sent_90 = false,
          notification_sent_100 = false,
          updated_at = now();

    insert into public.entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
    values (p_expected_tenant_id, v_subscription_id, v_metrics[i], v_limits[i], 'go_free_trial_activation', 'subscription', v_subscription_id::text)
    on conflict (tenant_id, reference_type, reference_id, metric) where reference_type is not null and reference_id is not null do nothing;
  end loop;

  insert into public.promo_redemptions (
    promo_code_id, tenant_id, user_id, customer_email,
    product_scope, payment_purpose, subscription_id,
    list_price_cents, discount_cents, amount_due_cents,
    idempotency_key, metadata
  ) values (
    v_promo.id, p_expected_tenant_id, p_actor_user_id, v_email,
    'subscription_payment', 'subscription_payment', v_subscription_id,
    v_price_cents, v_price_cents, 0,
    p_idempotency_key,
    jsonb_build_object(
      'fulfilment_source', 'go_free_trial',
      'complimentary', true,
      'plan_tier', p_plan_tier,
      'code_prefix', v_promo.code_prefix
    )
  )
  returning id into v_redemption_id;

  return jsonb_build_object(
    'success', true,
    'already_redeemed', false,
    'redemption_id', v_redemption_id,
    'subscription_id', v_subscription_id,
    'tenant_id', p_expected_tenant_id,
    'plan_tier', p_plan_tier,
    'list_price_cents', v_price_cents,
    'discount_cents', v_price_cents,
    'amount_due_cents', 0,
    'current_period_end', v_period_end,
    'fulfilment_source', 'go_free_trial'
  );
end;
$$;

revoke execute on function public.redeem_subscription_go_free_code_v1(text, uuid, text, text, text, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.redeem_subscription_go_free_code_v1(text, uuid, text, text, text, uuid, bigint)
  to service_role;

comment on function public.redeem_subscription_go_free_code_v1(text, uuid, text, text, text, uuid, bigint)
is 'Atomic complimentary (₹0) GoFree activation of a self-service subscription plan for approved internal test accounts. Supports the legacy v2 catalog (Starter/Growth/Business) and the current v3 catalog (SEO Growth/Social Content/Advanced SEO/Advanced Social/Advanced Growth). Never creates a Razorpay artifact, never counts as revenue — billing_provider=go_free_trial distinguishes it from real razorpay_payment_link/razorpay_subscription rows everywhere downstream.';
