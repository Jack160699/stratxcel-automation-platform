-- Migration: Subscription Schema Repair & Domain Status Extension
-- Adds missing columns to subscriptions, widens status constraint,
-- adds audit credit consumption columns to audit_orders,
-- widens domain status constraint for renewal flow,
-- creates entitlement_ledger_entries table,
-- creates payment_reconciliation_issues table.

-- ============================================================
-- 1. SUBSCRIPTIONS — Add missing columns
-- ============================================================

alter table subscriptions
  add column if not exists payment_link_id uuid references payment_links(id),
  add column if not exists payment_order_id uuid,
  add column if not exists activated_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists fulfilment_status text not null default 'awaiting_payment',
  add column if not exists entitlements_granted_at timestamptz;

-- Widen status constraint safely (drop old, add new)
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in (
    'pending_payment',
    'active',
    'payment_failed',
    'expired',
    'cancelled',
    'past_due',
    'paused',
    'refunded'
  ));

-- Backfill existing active rows
update subscriptions
set activated_at = current_period_start,
    fulfilment_status = 'fulfilled'
where status = 'active'
  and activated_at is null;

-- Prevent multiple fulfilments for the same payment link
create unique index if not exists subscriptions_payment_link_unique_idx
  on subscriptions (payment_link_id)
  where payment_link_id is not null;

-- ============================================================
-- 2. AUDIT ORDERS — Add credit consumption tracking columns
-- ============================================================

alter table audit_orders
  add column if not exists credit_consumed_at timestamptz,
  add column if not exists credit_consumed_subscription_id uuid;

-- Backfill from existing credited_towards_subscription_id
update audit_orders
set credit_consumed_subscription_id = credited_towards_subscription_id,
    credit_consumed_at = updated_at
where credited_towards_subscription_id is not null
  and credit_consumed_subscription_id is null;

-- ============================================================
-- 3. DOMAINS — Widen status constraint for renewal flow
-- ============================================================

alter table domains drop constraint if exists domains_status_check;
alter table domains add constraint domains_status_check
  check (status in (
    'pending_payment',
    'paid_pending_registration',
    'registering',
    'active',
    'failed',
    'expired',
    'transferred_out',
    'renewal_pending_payment',
    'renewal_paid_pending_provider',
    'cancelled'
  ));

-- ============================================================
-- 4. ENTITLEMENT LEDGER — Immutable change log for entitlement grants/revocations
-- ============================================================

create table if not exists entitlement_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  continuation_pack_id uuid,
  metric text not null,
  delta_units integer not null, -- positive = grant, negative = revocation
  reason text not null, -- 'subscription_activation', 'continuation_pack', 'refund_revocation', etc.
  reference_type text, -- 'subscription', 'continuation_pack', 'refund'
  reference_id text,
  created_at timestamptz not null default now()
);

alter table entitlement_ledger_entries enable row level security;
create index if not exists entitlement_ledger_tenant_idx
  on entitlement_ledger_entries (tenant_id, created_at desc);
create unique index if not exists entitlement_ledger_reference_idx
  on entitlement_ledger_entries (tenant_id, reference_type, reference_id, metric)
  where reference_type is not null and reference_id is not null;

grant select, insert, update, delete on entitlement_ledger_entries to service_role;
grant select on entitlement_ledger_entries to authenticated;

-- ============================================================
-- 5. PAYMENT RECONCILIATION ISSUES — Durable failure records
-- ============================================================

create table if not exists payment_reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text,
  payment_id text,
  link_id text,
  order_id text,
  tenant_id uuid,
  purpose text,
  expected_amount_cents bigint,
  received_amount_cents bigint,
  expected_currency text,
  received_currency text,
  internal_reference text,
  failure_reason text not null,
  retry_count integer not null default 0,
  resolution_status text not null default 'open'
    check (resolution_status in ('open', 'resolved', 'manual_review', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payment_reconciliation_issues enable row level security;
create index if not exists reconciliation_issues_status_idx
  on payment_reconciliation_issues (resolution_status, created_at desc);

grant select, insert, update, delete on payment_reconciliation_issues to service_role;

-- ============================================================
-- 6. CONTINUATION PACKS — Widen status constraint for applied state
-- ============================================================

alter table continuation_packs drop constraint if exists continuation_packs_status_check;
alter table continuation_packs add constraint continuation_packs_status_check
  check (status in ('pending', 'paid', 'applied', 'refunded'));
