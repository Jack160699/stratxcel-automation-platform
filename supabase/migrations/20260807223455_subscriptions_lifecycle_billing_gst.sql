-- Migration: Subscription Lifecycle (cancel/renew/upgrade-downgrade), Billing Profiles,
-- GST Invoices and Credit Notes.
--
-- Additive only. Does NOT modify reconcile_and_fulfill_razorpay_payment_v4 or any other
-- previously-applied payment-fulfilment function — the live ₹999 Audit path and existing
-- subscription-activation path are untouched. Invoice issuance is invoked separately,
-- best-effort, from application code after that function has already committed.

-- ============================================================
-- 1. SUBSCRIPTIONS — Lifecycle columns (cancel-at-period-end, dunning, plan change)
-- ============================================================

alter table subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists pending_plan_tier text,
  add column if not exists plan_change_requested_at timestamptz,
  add column if not exists past_due_since timestamptz,
  add column if not exists grace_period_end timestamptz,
  add column if not exists next_renewal_link_id uuid references payment_links(id) on delete set null;

alter table subscriptions drop constraint if exists subscriptions_pending_plan_tier_check;
alter table subscriptions add constraint subscriptions_pending_plan_tier_check
  check (pending_plan_tier is null or pending_plan_tier in ('launch', 'growth', 'custom_growth'));

-- ============================================================
-- 2. BILLING PROFILES — Optional GST invoice details, one per tenant
-- ============================================================

create table if not exists billing_profiles (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  legal_business_name text,
  gstin text,
  billing_address text,
  billing_state text,
  pin_code text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table billing_profiles enable row level security;
create policy billing_profiles_tenant_read on billing_profiles for select
  using (exists (select 1 from tenant_members m where m.tenant_id = billing_profiles.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on billing_profiles to service_role;
grant select on billing_profiles to authenticated;

-- ============================================================
-- 3. GST INVOICES
--
-- ENGINEERING COMPLETE: invoice numbering, GST-inclusive taxable/tax split (always sums
-- back to the exact amount charged), customer/business details, linkage to the payment.
--
-- ACCOUNTANT / TAX POLICY APPROVAL REQUIRED: place_of_supply and the CGST+SGST vs IGST
-- split. This repository has no approved rule for either, so both are left null/
-- 'UNDETERMINED' rather than guessed. The total tax amount charged is always correct;
-- only its intrastate/interstate accounting classification is pending.
-- ============================================================

create sequence if not exists invoice_number_seq start 1;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  tenant_id uuid not null references tenants(id) on delete cascade,
  payment_order_id uuid not null references payment_orders(id) on delete cascade,
  invoice_type text not null check (invoice_type in ('subscription', 'audit', 'continuation_pack', 'domain')),
  subscription_id uuid references subscriptions(id) on delete set null,
  audit_order_id uuid references audit_orders(id) on delete set null,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  currency text not null default 'INR',
  total_cents bigint not null,
  taxable_value_cents bigint not null,
  gst_cents bigint not null,
  gst_rate_percent numeric not null default 18,
  tax_treatment text not null default 'UNDETERMINED' check (tax_treatment in ('UNDETERMINED', 'CGST_SGST', 'IGST')),
  place_of_supply_state text,
  legal_business_name text,
  gstin text,
  billing_address text,
  billing_state text,
  pin_code text,
  payment_reference text,
  status text not null default 'issued' check (status in ('issued', 'void', 'credited')),
  created_at timestamptz not null default now(),
  constraint invoices_gst_split_exact check (taxable_value_cents + gst_cents = total_cents)
);

alter table invoices enable row level security;
create unique index if not exists invoices_payment_order_unique_idx on invoices (payment_order_id);
create index if not exists invoices_tenant_idx on invoices (tenant_id, created_at desc);
create policy invoices_tenant_read on invoices for select
  using (exists (select 1 from tenant_members m where m.tenant_id = invoices.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on invoices to service_role;
grant select on invoices to authenticated;

-- ============================================================
-- 4. CREDIT NOTES — Accounting record for refunds against an issued invoice
-- ============================================================

create table if not exists credit_notes (
  id uuid primary key default gen_random_uuid(),
  credit_note_number text not null unique,
  invoice_id uuid not null references invoices(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  payment_refund_id uuid references payment_refunds(id) on delete set null,
  amount_cents bigint not null,
  reason text,
  status text not null default 'issued' check (status in ('issued', 'void')),
  created_at timestamptz not null default now()
);

alter table credit_notes enable row level security;
create index if not exists credit_notes_tenant_idx on credit_notes (tenant_id, created_at desc);
create policy credit_notes_tenant_read on credit_notes for select
  using (exists (select 1 from tenant_members m where m.tenant_id = credit_notes.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on credit_notes to service_role;
grant select on credit_notes to authenticated;

create sequence if not exists credit_note_number_seq start 1;

-- ============================================================
-- 5. INVOICE ISSUANCE (idempotent, best-effort — never touches payment/entitlement state)
-- ============================================================

create or replace function public.issue_invoice_for_payment_order(p_payment_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_existing record;
  v_profile record;
  v_sub record;
  v_audit record;
  v_taxable bigint;
  v_gst bigint;
  v_type text;
  v_number text;
begin
  select * into v_order from payment_orders where id = p_payment_order_id;
  if not found then
    return jsonb_build_object('issued', false, 'reason', 'payment_order_not_found');
  end if;

  if v_order.state <> 'CAPTURED' then
    return jsonb_build_object('issued', false, 'reason', 'payment_order_not_captured');
  end if;

  if v_order.payment_purpose = 'wallet_topup' then
    return jsonb_build_object('issued', false, 'reason', 'purpose_not_invoiced');
  end if;

  select * into v_existing from invoices where payment_order_id = p_payment_order_id;
  if found then
    return jsonb_build_object('issued', true, 'already_issued', true, 'invoice_id', v_existing.id, 'invoice_number', v_existing.invoice_number);
  end if;

  if v_order.payment_purpose = 'subscription_payment' then
    v_type := 'subscription';
    select * into v_sub from subscriptions where id::text = v_order.reference_id;
  elsif v_order.payment_purpose = 'audit_fee' then
    v_type := 'audit';
    select * into v_audit from audit_orders where id::text = v_order.reference_id;
  elsif v_order.payment_purpose = 'continuation_pack' then
    v_type := 'continuation_pack';
  elsif v_order.payment_purpose in ('domain_purchase', 'domain_renewal') then
    v_type := 'domain';
  else
    return jsonb_build_object('issued', false, 'reason', 'unsupported_purpose');
  end if;

  -- Exact GST-inclusive split — taxable + gst always sums back to the amount actually
  -- charged (mirrors lib/payments/gst.ts splitGstInclusive; never adds tax on top).
  v_taxable := round(v_order.amount_cents / 1.18);
  v_gst := v_order.amount_cents - v_taxable;

  select * into v_profile from billing_profiles where tenant_id = v_order.tenant_id;

  v_number := 'STX-INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');

  insert into invoices (
    invoice_number, tenant_id, payment_order_id, invoice_type,
    subscription_id, audit_order_id,
    billing_period_start, billing_period_end,
    currency, total_cents, taxable_value_cents, gst_cents, gst_rate_percent,
    legal_business_name, gstin, billing_address, billing_state, pin_code,
    payment_reference, status
  ) values (
    v_number, v_order.tenant_id, v_order.id, v_type,
    v_sub.id, v_audit.id,
    case when v_type = 'subscription' then v_sub.current_period_start else null end,
    case when v_type = 'subscription' then v_sub.current_period_end else null end,
    v_order.currency, v_order.amount_cents, v_taxable, v_gst, 18,
    v_profile.legal_business_name, v_profile.gstin, v_profile.billing_address, v_profile.billing_state, v_profile.pin_code,
    v_order.provider_payment_id, 'issued'
  )
  on conflict (payment_order_id) do nothing
  returning id, invoice_number into v_existing;

  if v_existing.id is null then
    -- Lost the race to a concurrent caller — return the row it created.
    select * into v_existing from invoices where payment_order_id = p_payment_order_id;
    return jsonb_build_object('issued', true, 'already_issued', true, 'invoice_id', v_existing.id, 'invoice_number', v_existing.invoice_number);
  end if;

  return jsonb_build_object('issued', true, 'already_issued', false, 'invoice_id', v_existing.id, 'invoice_number', v_existing.invoice_number);
end;
$$;

grant execute on function issue_invoice_for_payment_order(uuid) to service_role;

-- ============================================================
-- 6. CREDIT NOTE ISSUANCE — Called alongside refund processing, never edits the invoice
-- ============================================================

create or replace function public.issue_credit_note_for_refund(p_payment_refund_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund record;
  v_invoice record;
  v_existing record;
  v_number text;
begin
  select * into v_refund from payment_refunds where id = p_payment_refund_id;
  if not found then
    return jsonb_build_object('issued', false, 'reason', 'refund_not_found');
  end if;

  select * into v_invoice from invoices where payment_order_id = v_refund.payment_order_id;
  if not found then
    return jsonb_build_object('issued', false, 'reason', 'no_invoice_for_payment_order');
  end if;

  select * into v_existing from credit_notes where payment_refund_id = p_payment_refund_id;
  if found then
    return jsonb_build_object('issued', true, 'already_issued', true, 'credit_note_id', v_existing.id);
  end if;

  v_number := 'STX-CN-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('credit_note_number_seq')::text, 6, '0');

  insert into credit_notes (credit_note_number, invoice_id, tenant_id, payment_refund_id, amount_cents, reason, status)
  values (v_number, v_invoice.id, v_invoice.tenant_id, p_payment_refund_id, v_refund.amount_cents, v_refund.reason, 'issued')
  returning id into v_existing;

  return jsonb_build_object('issued', true, 'already_issued', false, 'credit_note_id', v_existing.id, 'credit_note_number', v_number);
end;
$$;

grant execute on function issue_credit_note_for_refund(uuid) to service_role;

-- ============================================================
-- 7. CANCELLATION — cancel-at-period-end (default) with tenant ownership re-checked in RPC
-- ============================================================

create or replace function public.set_subscription_cancellation(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_cancel boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
begin
  select * into v_sub from subscriptions where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_found');
  end if;

  if v_sub.tenant_id <> p_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  if v_sub.status not in ('active', 'past_due') then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_cancellable_in_current_state', 'status', v_sub.status);
  end if;

  update subscriptions
  set cancel_at_period_end = p_cancel,
      cancel_requested_at = case when p_cancel then now() else null end,
      updated_at = now()
  where id = p_subscription_id;

  return jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'cancel_at_period_end', p_cancel,
    'access_until', v_sub.current_period_end
  );
end;
$$;

grant execute on function set_subscription_cancellation(uuid, uuid, boolean) to service_role;

-- ============================================================
-- 8. UPGRADE / DOWNGRADE — server-controlled target plan, takes effect at next renewal
-- (no proration is invented here; see docs note in the app layer for the deferred
-- accounting decision on mid-cycle proration policy)
-- ============================================================

create or replace function public.schedule_subscription_plan_change(
  p_subscription_id uuid,
  p_tenant_id uuid,
  p_target_plan_tier text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
begin
  if p_target_plan_tier not in ('launch', 'growth') then
    -- Custom Growth is quote/consultation-led, never a self-service target.
    return jsonb_build_object('success', false, 'reason', 'target_plan_not_self_service');
  end if;

  select * into v_sub from subscriptions where id = p_subscription_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_found');
  end if;

  if v_sub.tenant_id <> p_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  if v_sub.status <> 'active' then
    return jsonb_build_object('success', false, 'reason', 'subscription_not_active');
  end if;

  if v_sub.plan_tier = p_target_plan_tier then
    return jsonb_build_object('success', false, 'reason', 'already_on_target_plan');
  end if;

  update subscriptions
  set pending_plan_tier = p_target_plan_tier,
      plan_change_requested_at = now(),
      updated_at = now()
  where id = p_subscription_id;

  return jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'current_plan_tier', v_sub.plan_tier,
    'pending_plan_tier', p_target_plan_tier,
    'effective_at', v_sub.current_period_end
  );
end;
$$;

grant execute on function schedule_subscription_plan_change(uuid, uuid, text) to service_role;

-- ============================================================
-- 9. LIFECYCLE CYCLE — batch dunning/cancellation/expiry state transitions.
-- Pure state-machine over already-fulfilled subscriptions; never creates a payment link
-- (that requires the Razorpay API and is done from application code) and never grants
-- entitlements (only revokes, mirroring the existing full-refund revocation pattern).
-- ============================================================

create or replace function public.run_subscription_lifecycle_cycle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_entitlement record;
  v_cancelled_count int := 0;
  v_past_due_count int := 0;
  v_expired_count int := 0;
begin
  -- (a) cancel-at-period-end subscriptions whose period has ended
  for v_sub in
    select * from subscriptions
    where status = 'active' and cancel_at_period_end = true and current_period_end <= now()
    for update
  loop
    update subscriptions
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = v_sub.id;

    for v_entitlement in select * from usage_entitlements where tenant_id = v_sub.tenant_id loop
      update usage_entitlements
      set limit_amount = current_usage, base_limit_amount = 0, is_paused = true, updated_at = now()
      where id = v_entitlement.id;

      insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
      values (v_sub.tenant_id, v_sub.id, v_entitlement.metric, -(v_entitlement.limit_amount - v_entitlement.current_usage), 'subscription_cancelled', 'subscription', v_sub.id::text)
      on conflict (tenant_id, reference_type, reference_id, metric) where reference_type is not null and reference_id is not null do nothing;
    end loop;

    v_cancelled_count := v_cancelled_count + 1;
  end loop;

  -- (b) active, not cancelling, period ended without a fresh payment -> past_due (grace)
  for v_sub in
    select * from subscriptions
    where status = 'active' and cancel_at_period_end = false and current_period_end <= now()
    for update
  loop
    update subscriptions
    set status = 'past_due',
        past_due_since = now(),
        grace_period_end = now() + interval '7 days',
        updated_at = now()
    where id = v_sub.id;

    v_past_due_count := v_past_due_count + 1;
  end loop;

  -- (c) past_due beyond grace -> expired, revoke entitlements
  for v_sub in
    select * from subscriptions
    where status = 'past_due' and grace_period_end is not null and grace_period_end <= now()
    for update
  loop
    update subscriptions
    set status = 'expired', updated_at = now()
    where id = v_sub.id;

    for v_entitlement in select * from usage_entitlements where tenant_id = v_sub.tenant_id loop
      update usage_entitlements
      set limit_amount = current_usage, base_limit_amount = 0, is_paused = true, updated_at = now()
      where id = v_entitlement.id;

      insert into entitlement_ledger_entries (tenant_id, subscription_id, metric, delta_units, reason, reference_type, reference_id)
      values (v_sub.tenant_id, v_sub.id, v_entitlement.metric, -(v_entitlement.limit_amount - v_entitlement.current_usage), 'subscription_expired', 'subscription', v_sub.id::text)
      on conflict (tenant_id, reference_type, reference_id, metric) where reference_type is not null and reference_id is not null do nothing;
    end loop;

    v_expired_count := v_expired_count + 1;
  end loop;

  return jsonb_build_object(
    'cancelled', v_cancelled_count,
    'marked_past_due', v_past_due_count,
    'expired', v_expired_count,
    'ran_at', now()
  );
end;
$$;

grant execute on function run_subscription_lifecycle_cycle() to service_role;
