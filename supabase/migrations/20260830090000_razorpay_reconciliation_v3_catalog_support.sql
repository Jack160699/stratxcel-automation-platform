-- Migration: real Razorpay payment reconciliation RPCs -- widen plan-tier
-- support to the real, current v3 self-service catalog.
--
-- SEVERE real defect found live while investigating the Hermes platform-
-- restructure mission: reconcile_and_fulfill_razorpay_payment_v4 (the
-- payment_link.paid webhook handler) and
-- reconcile_and_fulfill_razorpay_subscription_charge (the AutoPay
-- subscription.charged webhook handler) -- both real, live, actively-called
-- production RPCs (packages/payments-and-wallet/src/razorpay/webhook-events.ts)
-- -- only ever recognized plan_tier IN ('starter','growth','business'), the
-- legacy v2 commercial model. But the REAL checkout route
-- (POST /api/platform/subscriptions, app/api/platform/subscriptions/route.ts)
-- already uses getSelfServicePlan(planTier) and happily creates a real
-- subscriptions row + a real Razorpay payment link / AutoPay subscription for
-- any of the 5 current recurring self-service tiers (seo, social,
-- advanced_seo, advanced_social, advanced_growth). Had a real customer paid
-- for one of these, Razorpay would have captured their real money, but this
-- RPC would have returned 'unknown_plan_tier' / 'legacy_plan_not_payable' --
-- the subscription would never activate and no entitlements would ever be
-- granted, with the customer's payment already captured. Confirmed live via
-- direct query: zero real (non-GoFree) subscriptions exist yet on any v3
-- tier, so this has not yet harmed a real paying customer -- caught before
-- the first one, not after.
--
-- Additive only -- create or replace, identical real function bodies
-- (fetched directly from the live database via pg_get_functiondef, not
-- reconstructed from memory) with five new elsif branches inserted. Every
-- existing branch (starter/growth/business/launch/custom_growth/free/scale)
-- is untouched. Every price and every 8-element v_limits array below is the
-- exact real value from packages/payments-and-wallet/src/plans.ts
-- (PLAN_DEFINITIONS.{tier}.priceCents) and entitlements.ts
-- (PLAN_LIMITS.{tier}, in this RPC's own real v_metrics order:
-- [social_posts, meta_ad_campaigns, whatsapp_contacts, website_maintenance,
-- content_generation_monthly, automated_content_monthly,
-- social_autopilot_automated_monthly, social_autopilot_manual_monthly]) --
-- the same values already verified and applied in
-- 20260830080000_go_free_subscription_v3_catalog_support.sql's 6-element
-- subset, extended here to the real 8-element array this RPC uses.
--
-- The two one-time website plans (website_landing_page, website_standard)
-- are deliberately NOT added -- same reasoning as the GoFree migration:
-- both real RPCs unconditionally grant a 30-day recurring period
-- (v4: current_period_end = now() + interval '30 days'; the AutoPay RPC
-- takes Razorpay's own recurring billing period), which does not match a
-- one-time purchase. Confirmed live: neither of the two website plan cards
-- on /app/billing currently has a self-checkout button at all (both render
-- "Request activation" -> /contact), so this is not a currently-reachable
-- gap for them.

create or replace function public.reconcile_and_fulfill_razorpay_payment_v4(p_provider_event_id text, p_provider_payment_id text, p_provider_link_id text, p_provider_order_id text, p_reference_id text, p_actual_amount_cents bigint, p_actual_currency text, p_provider_status text, p_captured boolean, p_event_type text DEFAULT 'payment_link.paid'::text, p_provider_captured_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_link record;
  v_order record;
  v_sub record;
  v_audit record;
  v_pack record;
  v_domain record;
  v_wallet record;
  v_base_price bigint;
  v_credit_amount bigint := 0;
  v_expected_price bigint;
  v_credit_valid boolean := false;
  v_plan_tier text;
  v_metrics text[] := array['social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance', 'content_generation_monthly', 'automated_content_monthly', 'social_autopilot_automated_monthly', 'social_autopilot_manual_monthly'];
  v_limits_starter int[] := array[12, 1, 100, 0, 10, 0, 12, 0];
  v_limits_growth int[] := array[25, 1, 500, 1, 20, 10, 30, 10];
  v_limits_business int[] := array[50, 3, 1500, 1, 30, 0, 30, 10];
  v_limits_seo int[] := array[0, 0, 0, 0, 0, 0, 0, 0];
  v_limits_social int[] := array[28, 0, 0, 0, 28, 0, 0, 0];
  v_limits_advanced_seo int[] := array[0, 0, 0, 0, 0, 0, 0, 0];
  v_limits_advanced_social int[] := array[28, 0, 0, 0, 28, 28, 28, 10];
  v_limits_advanced_growth int[] := array[28, 0, 0, 1, 28, 28, 28, 10];
  v_limits int[];
  v_metric text;
  v_new_base_val int;
  v_old_base_val int;
  v_old_bonus_val int;
  v_delta int;
  v_i int;
  v_purpose text;
begin
  -- 1. Validate Provider Captured Status
  if not p_captured or (lower(p_provider_status) <> 'captured' and lower(p_provider_status) <> 'paid') then
    return jsonb_build_object('fulfilled', false, 'reason', 'provider_payment_not_captured', 'status', p_provider_status);
  end if;

  -- 2. Lock Payment Link for Update
  if p_provider_link_id is not null and p_provider_link_id <> '' then
    select * into v_link from payment_links where provider_link_id = p_provider_link_id for update;
  end if;

  if not found and p_reference_id is not null and p_reference_id <> '' then
    select * into v_link from payment_links where reference_id = p_reference_id for update;
  end if;

  if not found then
    return jsonb_build_object('fulfilled', false, 'reason', 'payment_link_not_found');
  end if;

  v_purpose := v_link.payment_purpose;

  -- 3. Idempotent check: If already paid and order captured
  if v_link.status = 'paid' then
    select * into v_order from payment_orders where reference_type = 'payment_link' and reference_id = v_link.reference_id;
    if found and v_order.state = 'CAPTURED' then
      return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'purpose', v_purpose, 'order_id', v_order.id);
    end if;
  end if;

  -- 4. Amount and Currency Reconciliation Check (For non-subscription purposes)
  if v_purpose <> 'subscription_payment' then
    if p_actual_amount_cents <> v_link.amount_cents or upper(p_actual_currency) <> upper(v_link.currency) then
      insert into payment_reconciliation_issues (
        provider_event_id, payment_id, link_id, tenant_id, purpose,
        expected_amount_cents, received_amount_cents, expected_currency, received_currency,
        failure_reason, resolution_status
      )
      values (
        p_provider_event_id, p_provider_payment_id, v_link.id, v_link.tenant_id, v_purpose,
        v_link.amount_cents, p_actual_amount_cents, upper(v_link.currency), upper(p_actual_currency),
        'amount_or_currency_mismatch', 'open'
      )
      on conflict do nothing;

      update payment_links set status = 'reconciliation_required', updated_at = now() where id = v_link.id;

      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'amount_or_currency_mismatch',
        'expected_amount', v_link.amount_cents,
        'received_amount', p_actual_amount_cents
      );
    end if;
  end if;

  -- ============================================================
  -- 5. PRE-MUTATION VALIDATIONS (Product resolution, Plan Tier & State Checks)
  -- MUST happen BEFORE creating/updating payment_orders and setting payment_links.status = 'paid'
  -- ============================================================

  if v_purpose = 'wallet_topup' then
    null;

  elsif v_purpose = 'subscription_payment' then
    select * into v_sub from subscriptions where payment_link_id = v_link.id for update;
    if not found then
      select * into v_sub from subscriptions where id::text = v_link.reference_id for update;
    end if;

    if not found then
      return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_found');
    end if;

    -- Subscription Payment-Eligible State Validation
    -- Only pending_payment, payment_failed, and past_due are payment-eligible.
    -- Rejects active, cancelled, refunded, expired, paused.
    if v_sub.status not in ('pending_payment', 'payment_failed', 'past_due') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'subscription_state_not_payable',
        'subscription_status', v_sub.status
      );
    end if;

    v_plan_tier := v_sub.plan_tier;
    if v_plan_tier = 'starter' then
      v_base_price := 299900;
      v_limits := v_limits_starter;
    elsif v_plan_tier = 'growth' then
      v_base_price := 799900;
      v_limits := v_limits_growth;
    elsif v_plan_tier = 'business' then
      v_base_price := 1599900;
      v_limits := v_limits_business;
    elsif v_plan_tier = 'seo' then
      v_base_price := 299900;
      v_limits := v_limits_seo;
    elsif v_plan_tier = 'social' then
      v_base_price := 399900;
      v_limits := v_limits_social;
    elsif v_plan_tier = 'advanced_seo' then
      v_base_price := 999900;
      v_limits := v_limits_advanced_seo;
    elsif v_plan_tier = 'advanced_social' then
      v_base_price := 849900;
      v_limits := v_limits_advanced_social;
    elsif v_plan_tier = 'advanced_growth' then
      v_base_price := 1849800;
      v_limits := v_limits_advanced_growth;
    elsif v_plan_tier in ('launch', 'custom_growth') then
      return jsonb_build_object('fulfilled', false, 'reason', 'legacy_plan_not_payable', 'plan_tier', v_plan_tier);
    elsif v_plan_tier in ('free', 'scale') then
      return jsonb_build_object('fulfilled', false, 'reason', 'plan_not_self_checkout', 'plan_tier', v_plan_tier);
    else
      return jsonb_build_object('fulfilled', false, 'reason', 'unknown_plan_tier', 'plan_tier', v_plan_tier);
    end if;

    -- Evaluate Audit Credit & Tenant Matching
    v_credit_valid := false;
    v_credit_amount := 0;

    if v_sub.audit_order_id is not null then
      select * into v_audit from audit_orders where id = v_sub.audit_order_id for update;
      if found then
        -- Strict Cross-Tenant Audit Order Rejection: audit tenant MUST match subscription tenant AND payment link tenant
        if v_audit.tenant_id <> v_sub.tenant_id or v_audit.tenant_id <> v_link.tenant_id then
          insert into payment_reconciliation_issues (
            provider_event_id, payment_id, link_id, tenant_id, purpose,
            expected_amount_cents, received_amount_cents, expected_currency, received_currency,
            failure_reason, resolution_status
          )
          values (
            p_provider_event_id, p_provider_payment_id, v_link.id, v_link.tenant_id, 'subscription_payment',
            v_base_price, p_actual_amount_cents, upper(v_link.currency), upper(p_actual_currency),
            'audit_credit_tenant_mismatch', 'open'
          )
          on conflict do nothing;

          update payment_links set status = 'reconciliation_required', updated_at = now() where id = v_link.id;

          return jsonb_build_object(
            'fulfilled', false,
            'reason', 'audit_credit_tenant_mismatch',
            'expected_tenant_id', v_sub.tenant_id,
            'audit_tenant_id', v_audit.tenant_id
          );
        end if;

        -- Audit credit validity conditions (same tenant)
        if (v_audit.status = 'paid' or v_audit.status = 'completed')
           and v_audit.audit_completed_at is not null
           and v_audit.credit_eligible_from is not null
           and v_audit.credit_eligible_from <= now()
           and v_audit.credit_expires_at > now()
           and v_audit.credit_consumed_at is null then
          v_credit_valid := true;
          v_credit_amount := coalesce(v_audit.audit_fee_cents, 99900);
        end if;
      end if;
    end if;

    v_expected_price := greatest(0::bigint, v_base_price - v_credit_amount);

    -- Strict Price Validation against Calculated Expected Price
    if p_actual_amount_cents <> v_expected_price or upper(p_actual_currency) <> upper(v_link.currency) then
      insert into payment_reconciliation_issues (
        provider_event_id, payment_id, link_id, tenant_id, purpose,
        expected_amount_cents, received_amount_cents, expected_currency, received_currency,
        failure_reason, resolution_status
      )
      values (
        p_provider_event_id, p_provider_payment_id, v_link.id, v_link.tenant_id, 'subscription_payment',
        v_expected_price, p_actual_amount_cents, upper(v_link.currency), upper(p_actual_currency),
        'subscription_expected_amount_mismatch', 'open'
      )
      on conflict do nothing;

      update payment_links set status = 'reconciliation_required', updated_at = now() where id = v_link.id;

      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'subscription_expected_amount_mismatch',
        'expected_amount_cents', v_expected_price,
        'received_amount_cents', p_actual_amount_cents,
        'credit_valid', v_credit_valid
      );
    end if;

  elsif v_purpose = 'audit_fee' then
    select * into v_audit from audit_orders where payment_link_id = v_link.id for update;
    if not found then
      select * into v_audit from audit_orders where id::text = v_link.reference_id for update;
    end if;

    if not found then
      return jsonb_build_object('fulfilled', false, 'reason', 'audit_order_not_found');
    end if;

    -- Audit Fee Payment-Eligible State Validation
    -- Only pending_payment is payment-eligible.
    -- Rejects paid, completed, refunded, cancelled.
    if v_audit.status not in ('pending_payment') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'audit_order_state_not_payable',
        'audit_status', v_audit.status
      );
    end if;

  elsif v_purpose = 'continuation_pack' then
    select * into v_pack from continuation_packs where payment_link_id = v_link.id for update;
    if not found then
      select * into v_pack from continuation_packs where id::text = v_link.reference_id for update;
    end if;

    if not found then
      return jsonb_build_object('fulfilled', false, 'reason', 'continuation_pack_not_found');
    end if;

    -- Continuation Pack Payment-Eligible State Validation
    -- Only pending is payment-eligible.
    -- Rejects applied, paid, refunded, cancelled, expired.
    if v_pack.status not in ('pending') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'continuation_pack_state_not_payable',
        'pack_status', v_pack.status
      );
    end if;

  elsif v_purpose = 'domain_purchase' or v_purpose = 'domain_renewal' then
    select * into v_domain from domains where payment_link_id = v_link.id for update;
    if not found then
      select * into v_domain from domains where id::text = v_link.reference_id for update;
    end if;

    if not found then
      return jsonb_build_object('fulfilled', false, 'reason', 'domain_not_found');
    end if;

    -- Domain Purchase Payment-Eligible State Validation
    -- Only pending_payment is payment-eligible for domain_purchase.
    -- Rejects paid, paid_pending_registration, registered, active, refunded, cancelled, expired.
    if v_purpose = 'domain_purchase' and v_domain.status not in ('pending_payment') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'domain_purchase_state_not_payable',
        'domain_status', v_domain.status
      );
    end if;

    -- Domain Renewal Payment-Eligible State Validation
    -- Only active, registered, expired are renewal-eligible.
    -- Rejects pending_payment, paid_pending_registration, registering, paid_pending_renewal, refunded, cancelled, transferred_out.
    if v_purpose = 'domain_renewal' and v_domain.status not in ('active', 'registered', 'expired') then
      return jsonb_build_object(
        'fulfilled', false,
        'reason', 'domain_renewal_state_not_payable',
        'domain_status', v_domain.status
      );
    end if;

  else
    return jsonb_build_object('fulfilled', false, 'reason', 'unsupported_payment_purpose', 'purpose', v_purpose);
  end if;

  -- ============================================================
  -- 6. ATOMIC MUTATIONS (Executed only after product, purpose, state & price validation passed)
  -- ============================================================

  -- Lock or Create Payment Order
  select * into v_order from payment_orders
  where tenant_id = v_link.tenant_id
    and provider = 'razorpay'
    and reference_type = 'payment_link'
    and reference_id = v_link.reference_id
  for update;

  if not found then
    insert into payment_orders (
      tenant_id, provider, provider_payment_id, provider_order_id,
      amount_cents, currency, state, payment_purpose, mode,
      reference_type, reference_id, metadata
    ) values (
      v_link.tenant_id, 'razorpay', p_provider_payment_id, p_provider_order_id,
      p_actual_amount_cents, p_actual_currency, 'CAPTURED', v_purpose, v_link.mode,
      'payment_link', v_link.reference_id, jsonb_build_object('link_id', v_link.id, 'purpose', v_purpose)
    )
    returning * into v_order;
  else
    update payment_orders
    set state = 'CAPTURED',
        provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
        provider_order_id = coalesce(p_provider_order_id, provider_order_id),
        updated_at = now()
    where id = v_order.id;
  end if;

  -- Route Fulfilment Mutators by Purpose
  if v_purpose = 'wallet_topup' then
    select * into v_wallet from wallet_accounts where tenant_id = v_link.tenant_id for update;
    if not found then
      insert into wallet_accounts (tenant_id, balance_cents) values (v_link.tenant_id, 0)
      returning * into v_wallet;
    end if;

    insert into wallet_ledger_entries (
      tenant_id, entry_type, amount_cents, reference_type, reference_id, metadata
    ) values (
      v_link.tenant_id, 'credit_purchase', p_actual_amount_cents,
      'payment_order', v_order.id::text, jsonb_build_object('payment_id', p_provider_payment_id)
    )
    on conflict (tenant_id, reference_type, reference_id, entry_type)
      where reference_type is not null and reference_id is not null
      do nothing;

    update wallet_accounts
    set balance_cents = balance_cents + p_actual_amount_cents, updated_at = now()
    where tenant_id = v_link.tenant_id;

  elsif v_purpose = 'subscription_payment' then
    -- v_sub & v_audit are locked and validated above
    update subscriptions
    set status = 'active',
        activated_at = now(),
        current_period_start = now(),
        current_period_end = now() + interval '30 days',
        paid_months_count = coalesce(paid_months_count, 0) + 1,
        fulfilment_status = 'fulfilled',
        entitlements_granted_at = now(),
        updated_at = now()
    where id = v_sub.id;

    if v_credit_valid and v_sub.audit_order_id is not null then
      update audit_orders
      set credit_consumed_at = now(), credit_consumed_subscription_id = v_sub.id, updated_at = now()
      where id = v_sub.audit_order_id;
    end if;

    for v_i in 1..array_length(v_metrics, 1) loop
      v_metric := v_metrics[v_i];
      v_new_base_val := v_limits[v_i];

      if v_new_base_val > 0 then
        select base_limit_amount, bonus_limit_amount into v_old_base_val, v_old_bonus_val
        from usage_entitlements
        where tenant_id = v_link.tenant_id and metric = v_metric;

        if not found then
          v_old_base_val := 0;
          v_old_bonus_val := 0;
        end if;

        v_delta := v_new_base_val - coalesce(v_old_base_val, 0);

        insert into usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
        values (v_link.tenant_id, v_sub.id, v_metric, v_new_base_val, 0, v_new_base_val, 0)
        on conflict (tenant_id, metric)
        do update set
          base_limit_amount = excluded.base_limit_amount,
          limit_amount = excluded.base_limit_amount + usage_entitlements.bonus_limit_amount,
          subscription_id = excluded.subscription_id,
          is_paused = false,
          notification_sent_100 = false,
          updated_at = now();

        if v_delta <> 0 then
          insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
          values (v_link.tenant_id, v_sub.id, v_metric, v_delta, 'subscription_activation', 'subscription', v_sub.id::text)
          on conflict (tenant_id, reference_type, reference_id, metric)
            where reference_type is not null and reference_id is not null
            do nothing;
        end if;
      end if;
    end loop;

  elsif v_purpose = 'audit_fee' then
    update audit_orders set status = 'paid', updated_at = now() where id = v_audit.id;

  elsif v_purpose = 'continuation_pack' then
    if v_pack.status <> 'applied' then
      insert into usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
      values (v_link.tenant_id, v_pack.subscription_id, v_pack.metric, 0, v_pack.extra_units, v_pack.extra_units, 0)
      on conflict (tenant_id, metric)
      do update set
        bonus_limit_amount = usage_entitlements.bonus_limit_amount + excluded.bonus_limit_amount,
        limit_amount = usage_entitlements.base_limit_amount + usage_entitlements.bonus_limit_amount + excluded.bonus_limit_amount,
        is_paused = false,
        notification_sent_100 = false,
        updated_at = now();

      update continuation_packs set status = 'applied', updated_at = now() where id = v_pack.id;

      insert into entitlement_ledger_entries (tenant_id, subscription_id, continuation_pack_id, metric, delta_units, reason, reference_type, reference_id)
      values (v_link.tenant_id, v_pack.subscription_id, v_pack.id, v_pack.metric, v_pack.extra_units, 'continuation_pack', 'continuation_pack', v_pack.id::text)
      on conflict (tenant_id, reference_type, reference_id, metric)
        where reference_type is not null and reference_id is not null
        do nothing;
    end if;

  elsif v_purpose = 'domain_purchase' then
    update domains set status = 'paid_pending_registration', updated_at = now() where id = v_domain.id;

  elsif v_purpose = 'domain_renewal' then
    update domains set status = 'paid_pending_renewal', updated_at = now() where id = v_domain.id;
  end if;

  -- 7. Update Payment Link Status to Paid
  update payment_links
  set status = 'paid',
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
      updated_at = now()
  where id = v_link.id;

  return jsonb_build_object(
    'fulfilled', true,
    'already_fulfilled', false,
    'purpose', v_purpose,
    'order_id', v_order.id,
    'tenant_id', v_link.tenant_id
  );
end;
$function$;

create or replace function public.reconcile_and_fulfill_razorpay_subscription_charge(p_provider_event_id text, p_provider_payment_id text, p_provider_subscription_id text, p_provider_order_id text DEFAULT NULL::text, p_actual_amount_cents bigint DEFAULT NULL::bigint, p_actual_currency text DEFAULT NULL::text, p_provider_status text DEFAULT NULL::text, p_captured boolean DEFAULT false, p_event_type text DEFAULT 'subscription.charged'::text, p_mode text DEFAULT NULL::text, p_provider_plan_id text DEFAULT NULL::text, p_notes_tenant_id text DEFAULT NULL::text, p_notes_subscription_id text DEFAULT NULL::text, p_current_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_charge_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sub record; v_order record; v_audit record; v_wallet record;
  v_expected_cents bigint; v_catalog_cents bigint; v_mode text;
  v_metrics text[] := array['social_posts', 'meta_ad_campaigns', 'whatsapp_contacts', 'website_maintenance', 'content_generation_monthly', 'automated_content_monthly', 'social_autopilot_automated_monthly', 'social_autopilot_manual_monthly'];
  v_limits int[]; v_limits_starter int[] := array[12,1,100,0,10,0,12,0]; v_limits_growth int[] := array[25,1,500,1,20,10,30,10]; v_limits_business int[] := array[50,3,1500,1,30,0,30,10];
  v_limits_seo int[] := array[0,0,0,0,0,0,0,0]; v_limits_social int[] := array[28,0,0,0,28,0,0,0]; v_limits_advanced_seo int[] := array[0,0,0,0,0,0,0,0];
  v_limits_advanced_social int[] := array[28,0,0,0,28,28,28,10]; v_limits_advanced_growth int[] := array[28,0,0,1,28,28,28,10];
  v_i int; v_metric text; v_new_base_val int; v_old_base_val int; v_old_bonus_val int; v_delta int;
  v_credit_valid boolean := false; v_deferred_valid boolean := false; v_deferred_cents bigint := 0;
  v_is_first_charge boolean := false; v_period_start timestamptz; v_period_end timestamptz; v_next_charge timestamptz;
  v_effective_plan text; v_order_exists boolean := false; v_ledger_rows int := 0;
begin
  if coalesce(trim(p_provider_payment_id), '') = '' then return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_payment_id'); end if;
  if coalesce(trim(p_provider_subscription_id), '') = '' then return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_subscription_id'); end if;
  if coalesce(trim(p_provider_plan_id), '') = '' then return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_plan_id'); end if;
  if p_actual_amount_cents is null or p_actual_amount_cents <= 0 then return jsonb_build_object('fulfilled', false, 'reason', 'invalid_amount'); end if;
  if p_actual_currency is null or upper(p_actual_currency) <> 'INR' then return jsonb_build_object('fulfilled', false, 'reason', 'invalid_currency'); end if;
  if not coalesce(p_captured, false) then return jsonb_build_object('fulfilled', false, 'reason', 'payment_not_captured'); end if;

  -- Authoritative provider period required — never invent a 30-day window.
  if p_current_period_start is null or p_current_period_end is null then
    return jsonb_build_object('fulfilled', false, 'reason', 'missing_provider_billing_period');
  end if;
  if p_current_period_end <= p_current_period_start then
    return jsonb_build_object('fulfilled', false, 'reason', 'invalid_provider_billing_period');
  end if;
  if p_current_period_end > p_current_period_start + interval '45 days' then
    return jsonb_build_object('fulfilled', false, 'reason', 'provider_billing_period_implausible');
  end if;

  v_period_start := p_current_period_start;
  v_period_end := p_current_period_end;
  v_next_charge := coalesce(p_next_charge_at, p_current_period_end);

  v_mode := lower(coalesce(nullif(trim(p_mode), ''), 'test'));
  if v_mode not in ('test', 'live') then v_mode := 'test'; end if;

  select * into v_order from payment_orders where provider = 'razorpay' and provider_payment_id = p_provider_payment_id for update;
  if found then
    v_order_exists := true;
    if v_order.state = 'CAPTURED' and v_order.payment_purpose = 'subscription_payment' then
      return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'order_id', v_order.id, 'purpose', 'subscription_payment', 'subscription_id', v_order.reference_id);
    end if;
  end if;

  select * into v_sub from subscriptions
  where billing_provider = 'razorpay_subscription' and provider_subscription_id = p_provider_subscription_id for update;
  if not found then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, purpose, received_amount_cents, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, 'subscription_payment', p_actual_amount_cents, p_actual_currency, 'subscription_not_found_for_provider_id', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_found');
  end if;

  if coalesce(trim(p_notes_tenant_id), '') <> '' and p_notes_tenant_id <> v_sub.tenant_id::text then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, tenant_id, purpose, received_amount_cents, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment', p_actual_amount_cents, p_actual_currency, 'subscription_notes_tenant_mismatch', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'notes_tenant_mismatch');
  end if;
  if coalesce(trim(p_notes_subscription_id), '') <> '' and p_notes_subscription_id <> v_sub.id::text then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, tenant_id, purpose, received_amount_cents, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment', p_actual_amount_cents, p_actual_currency, 'subscription_notes_id_mismatch', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'notes_subscription_mismatch');
  end if;

  if coalesce(trim(v_sub.provider_plan_id), '') <> '' and trim(p_provider_plan_id) <> trim(v_sub.provider_plan_id)
     and not (coalesce(v_sub.paid_months_count,0) > 0 and v_sub.status = 'active' and v_sub.pending_plan_tier in ('starter','growth','business')) then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, tenant_id, purpose, received_amount_cents, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment', p_actual_amount_cents, p_actual_currency, 'subscription_provider_plan_mismatch', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'provider_plan_mismatch');
  end if;

  if v_sub.status not in ('pending_payment', 'payment_failed', 'past_due', 'active', 'paused') then
    return jsonb_build_object('fulfilled', false, 'reason', 'subscription_not_chargeable_in_current_state', 'subscription_status', v_sub.status);
  end if;

  v_is_first_charge := coalesce(v_sub.paid_months_count, 0) = 0 or v_sub.status in ('pending_payment', 'payment_failed');
  v_effective_plan := v_sub.plan_tier;
  if not v_is_first_charge and v_sub.pending_plan_tier in ('starter', 'growth', 'business') then
    v_effective_plan := v_sub.pending_plan_tier;
  end if;

  if v_effective_plan = 'starter' then v_catalog_cents := 299900; v_limits := v_limits_starter;
  elsif v_effective_plan = 'growth' then v_catalog_cents := 799900; v_limits := v_limits_growth;
  elsif v_effective_plan = 'business' then v_catalog_cents := 1599900; v_limits := v_limits_business;
  elsif v_effective_plan = 'seo' then v_catalog_cents := 299900; v_limits := v_limits_seo;
  elsif v_effective_plan = 'social' then v_catalog_cents := 399900; v_limits := v_limits_social;
  elsif v_effective_plan = 'advanced_seo' then v_catalog_cents := 999900; v_limits := v_limits_advanced_seo;
  elsif v_effective_plan = 'advanced_social' then v_catalog_cents := 849900; v_limits := v_limits_advanced_social;
  elsif v_effective_plan = 'advanced_growth' then v_catalog_cents := 1849800; v_limits := v_limits_advanced_growth;
  else return jsonb_build_object('fulfilled', false, 'reason', 'legacy_plan_not_payable', 'plan_tier', v_effective_plan);
  end if;

  v_expected_cents := case when v_is_first_charge then v_sub.price_cents else v_catalog_cents end;
  if p_actual_amount_cents <> v_expected_cents then
    insert into payment_reconciliation_issues (provider_event_id, payment_id, tenant_id, purpose, expected_amount_cents, received_amount_cents, expected_currency, received_currency, failure_reason, resolution_status)
    values (p_provider_event_id, p_provider_payment_id, v_sub.tenant_id, 'subscription_payment', v_expected_cents, p_actual_amount_cents, 'INR', p_actual_currency, 'subscription_charge_amount_mismatch', 'open');
    return jsonb_build_object('fulfilled', false, 'reason', 'amount_mismatch');
  end if;

  if v_is_first_charge and v_sub.audit_order_id is not null then
    select * into v_audit from audit_orders where id = v_sub.audit_order_id for update;
    if found and v_audit.tenant_id = v_sub.tenant_id and v_audit.credit_consumed_at is null then
      if coalesce(v_sub.audit_credit_applied_cents, 0) > 0 then v_credit_valid := true;
      elsif coalesce(v_sub.audit_credit_deferred_cents, 0) > 0 then
        v_deferred_valid := true; v_deferred_cents := v_sub.audit_credit_deferred_cents;
      end if;
    end if;
  end if;

  if v_order_exists then
    update payment_orders set state = 'CAPTURED', provider_order_id = coalesce(p_provider_order_id, provider_order_id),
      amount_cents = p_actual_amount_cents, currency = p_actual_currency, payment_purpose = 'subscription_payment', mode = v_mode,
      reference_type = 'razorpay_subscription', reference_id = v_sub.id::text,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_subscription_id', p_provider_subscription_id, 'provider_plan_id', p_provider_plan_id,
        'provider_event_id', p_provider_event_id, 'event_type', p_event_type,
        'provider_period_start', v_period_start, 'provider_period_end', v_period_end
      ),
      updated_at = now()
    where id = v_order.id returning * into v_order;
  else
    begin
      insert into payment_orders (tenant_id, provider, provider_payment_id, provider_order_id, amount_cents, currency, state, payment_purpose, mode, reference_type, reference_id, metadata)
      values (v_sub.tenant_id, 'razorpay', p_provider_payment_id, p_provider_order_id, p_actual_amount_cents, p_actual_currency, 'CAPTURED', 'subscription_payment', v_mode, 'razorpay_subscription', v_sub.id::text,
        jsonb_build_object(
          'provider_subscription_id', p_provider_subscription_id, 'provider_plan_id', p_provider_plan_id,
          'provider_event_id', p_provider_event_id, 'event_type', p_event_type,
          'provider_period_start', v_period_start, 'provider_period_end', v_period_end
        ))
      returning * into v_order;
    exception when unique_violation then
      select * into v_order from payment_orders where provider = 'razorpay' and provider_payment_id = p_provider_payment_id for update;
      if v_order.state = 'CAPTURED' and v_order.payment_purpose = 'subscription_payment' then
        return jsonb_build_object('fulfilled', true, 'already_fulfilled', true, 'order_id', v_order.id, 'purpose', 'subscription_payment', 'subscription_id', v_order.reference_id);
      end if;
      raise;
    end;
  end if;

  update subscriptions set status = 'active', plan_tier = v_effective_plan,
    price_cents = case when v_is_first_charge then price_cents else v_expected_cents end,
    pending_plan_tier = case when not v_is_first_charge then null else pending_plan_tier end,
    plan_change_requested_at = case when not v_is_first_charge then null else plan_change_requested_at end,
    provider_plan_id = coalesce(nullif(trim(p_provider_plan_id), ''), provider_plan_id),
    activated_at = coalesce(activated_at, now()),
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    paid_months_count = coalesce(paid_months_count, 0) + 1, fulfilment_status = 'fulfilled',
    entitlements_granted_at = coalesce(entitlements_granted_at, now()), payment_order_id = v_order.id,
    provider_status = coalesce(p_provider_status, provider_status, 'active'), last_charged_at = now(),
    last_provider_payment_id = p_provider_payment_id, next_charge_at = v_next_charge,
    past_due_since = null, grace_period_end = null, updated_at = now()
  where id = v_sub.id;

  if (v_credit_valid or v_deferred_valid) and v_sub.audit_order_id is not null then
    update audit_orders set credit_consumed_at = now(), credit_consumed_subscription_id = v_sub.id, updated_at = now()
    where id = v_sub.audit_order_id and credit_consumed_at is null;
  end if;

  if v_deferred_valid and v_deferred_cents > 0 then
    update subscriptions set audit_credit_applied_cents = v_deferred_cents, audit_credit_deferred_cents = 0, updated_at = now()
    where id = v_sub.id and coalesce(audit_credit_deferred_cents, 0) = v_deferred_cents;
    if found then
      select * into v_wallet from wallet_accounts where tenant_id = v_sub.tenant_id for update;
      if not found then insert into wallet_accounts (tenant_id, balance_cents) values (v_sub.tenant_id, 0) returning * into v_wallet; end if;
      insert into wallet_ledger_entries (tenant_id, entry_type, amount_cents, reference_type, reference_id, metadata)
      values (v_sub.tenant_id, 'credit_purchase', v_deferred_cents, 'subscription_audit_credit', v_sub.id::text,
        jsonb_build_object('payment_order_id', v_order.id, 'audit_order_id', v_sub.audit_order_id, 'reason', 'deferred_audit_credit_after_autopay'))
      on conflict (tenant_id, reference_type, reference_id, entry_type)
        where reference_type is not null and reference_id is not null do nothing;
      get diagnostics v_ledger_rows = row_count;
      if v_ledger_rows > 0 then
        update wallet_accounts set balance_cents = balance_cents + v_deferred_cents, updated_at = now() where tenant_id = v_sub.tenant_id;
      end if;
    end if;
  end if;

  for v_i in 1..array_length(v_metrics, 1) loop
    v_metric := v_metrics[v_i]; v_new_base_val := v_limits[v_i];
    select base_limit_amount, bonus_limit_amount into v_old_base_val, v_old_bonus_val from usage_entitlements where tenant_id = v_sub.tenant_id and metric = v_metric;
    if not found then v_old_base_val := 0; v_old_bonus_val := 0; end if;
    v_delta := v_new_base_val - coalesce(v_old_base_val, 0);
    insert into usage_entitlements (tenant_id, subscription_id, metric, base_limit_amount, bonus_limit_amount, limit_amount, current_usage)
    values (v_sub.tenant_id, v_sub.id, v_metric, v_new_base_val, 0, v_new_base_val, 0)
    on conflict (tenant_id, metric) do update set
      base_limit_amount = excluded.base_limit_amount,
      limit_amount = excluded.base_limit_amount + usage_entitlements.bonus_limit_amount,
      subscription_id = excluded.subscription_id, current_usage = 0, is_paused = false,
      notification_sent_80 = false, notification_sent_90 = false, notification_sent_100 = false, updated_at = now();
    if v_delta <> 0 or v_is_first_charge then
      insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
      values (v_sub.tenant_id, v_sub.id, v_metric, case when v_delta = 0 then v_new_base_val else v_delta end,
        case when v_is_first_charge then 'subscription_activation' else 'subscription_renewal' end, 'payment_order', v_order.id::text)
      on conflict (tenant_id, reference_type, reference_id, metric)
        where reference_type is not null and reference_id is not null do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'fulfilled', true, 'already_fulfilled', false, 'order_id', v_order.id, 'purpose', 'subscription_payment',
    'subscription_id', v_sub.id, 'tenant_id', v_sub.tenant_id, 'is_first_charge', v_is_first_charge,
    'plan_tier', v_effective_plan, 'mode', v_mode,
    'current_period_start', v_period_start, 'current_period_end', v_period_end, 'next_charge_at', v_next_charge
  );
end;
$function$;
