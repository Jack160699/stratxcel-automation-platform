-- Go Free promotional codes for one-time Audit (payment_purpose = audit_fee) only.
-- Additive. Does NOT modify reconcile_and_fulfill_razorpay_payment_v4.
-- Complimentary fulfilment is a separate explicit path (redeem_audit_go_free_code_v1).

-- ---------------------------------------------------------------------------
-- 1. Audit commercial provenance (cash vs complimentary)
-- ---------------------------------------------------------------------------
alter table public.audit_orders
  add column if not exists fulfilment_source text
    check (fulfilment_source is null or fulfilment_source in ('razorpay', 'promo')),
  add column if not exists promo_redemption_id uuid,
  add column if not exists list_price_cents bigint,
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists actual_paid_cents bigint;

comment on column public.audit_orders.fulfilment_source is
  'Commercial provenance: razorpay = cash-paid via verified provider; promo = complimentary Go Free redemption. NULL = legacy cash-paid path.';
comment on column public.audit_orders.actual_paid_cents is
  'Cash collected in paise. Promo fulfilments are 0. Legacy paid rows may be NULL.';

-- ---------------------------------------------------------------------------
-- 2. promo_codes
-- ---------------------------------------------------------------------------
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  code_display text not null,
  code_prefix text not null,
  product_scope text not null default 'audit_fee'
    check (product_scope = 'audit_fee'),
  payment_purpose text not null default 'audit_fee'
    check (payment_purpose = 'audit_fee'),
  discount_type text not null default 'percent'
    check (discount_type in ('percent')),
  discount_percent integer not null default 100
    check (discount_percent = 100),
  max_redemptions integer
    check (max_redemptions is null or max_redemptions > 0),
  max_redemptions_per_customer integer not null default 1
    check (max_redemptions_per_customer > 0),
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  allowed_email text,
  is_active boolean not null default true,
  internal_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_codes_code_hash_unique unique (code_hash),
  constraint promo_codes_code_display_unique unique (code_display),
  constraint promo_codes_expires_after_valid_from
    check (expires_at is null or expires_at > valid_from)
);

create index if not exists promo_codes_active_lookup_idx
  on public.promo_codes (is_active, payment_purpose, valid_from, expires_at);

alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from public, anon, authenticated;
grant select, insert, update on public.promo_codes to service_role;
-- No delete: disable/revoke instead.

-- ---------------------------------------------------------------------------
-- 3. promo_redemptions (immutable / append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  customer_email text not null,
  product_scope text not null default 'audit_fee',
  payment_purpose text not null default 'audit_fee',
  audit_order_id uuid not null references public.audit_orders(id) on delete restrict,
  list_price_cents bigint not null,
  discount_cents bigint not null,
  amount_due_cents bigint not null check (amount_due_cents = 0),
  redeemed_at timestamptz not null default now(),
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint promo_redemptions_idempotency_unique unique (idempotency_key),
  constraint promo_redemptions_audit_order_unique unique (audit_order_id)
);

create index if not exists promo_redemptions_promo_idx
  on public.promo_redemptions (promo_code_id, redeemed_at desc);
create index if not exists promo_redemptions_tenant_idx
  on public.promo_redemptions (tenant_id, redeemed_at desc);

alter table public.promo_redemptions enable row level security;
revoke all on public.promo_redemptions from public, anon, authenticated;
grant select, insert on public.promo_redemptions to service_role;
revoke update, delete, truncate on public.promo_redemptions from service_role;

create or replace function public.promo_redemptions_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'promo_redemptions are immutable';
end;
$$;

drop trigger if exists promo_redemptions_immutable on public.promo_redemptions;
create trigger promo_redemptions_immutable
before update or delete on public.promo_redemptions
for each row execute function public.promo_redemptions_immutable();

alter table public.audit_orders
  drop constraint if exists audit_orders_promo_redemption_id_fkey;
alter table public.audit_orders
  add constraint audit_orders_promo_redemption_id_fkey
  foreign key (promo_redemption_id) references public.promo_redemptions(id);

-- ---------------------------------------------------------------------------
-- 4. Rate limit helper for validate/redeem brute-force resistance
-- ---------------------------------------------------------------------------
create table if not exists public.promo_code_rate_limits (
  bucket_hash text primary key,
  request_count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.promo_code_rate_limits enable row level security;
revoke all on public.promo_code_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.promo_code_rate_limits to service_role;

create or replace function public.check_and_increment_promo_rate_limit(
  p_bucket_hash text,
  p_max_requests integer default 20,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.promo_code_rate_limits;
begin
  if p_bucket_hash is null or length(trim(p_bucket_hash)) = 0 then
    return false;
  end if;

  select * into v_row from public.promo_code_rate_limits where bucket_hash = p_bucket_hash for update;
  if not found then
    insert into public.promo_code_rate_limits(bucket_hash, request_count, window_start)
    values (p_bucket_hash, 1, now());
    return true;
  end if;

  if v_row.window_start < (now() - make_interval(secs => p_window_seconds)) then
    update public.promo_code_rate_limits
    set request_count = 1, window_start = now()
    where bucket_hash = p_bucket_hash;
    return true;
  end if;

  if v_row.request_count >= p_max_requests then
    return false;
  end if;

  update public.promo_code_rate_limits
  set request_count = request_count + 1
  where bucket_hash = p_bucket_hash;
  return true;
end;
$$;

revoke execute on function public.check_and_increment_promo_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_and_increment_promo_rate_limit(text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Promo audits must never earn subscription credit
-- ---------------------------------------------------------------------------
create or replace function public.enforce_promo_audit_no_subscription_credit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.fulfilment_source = 'promo' then
    new.credit_eligible_from := null;
    new.credit_expires_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_orders_promo_no_credit on public.audit_orders;
create trigger audit_orders_promo_no_credit
before insert or update on public.audit_orders
for each row execute function public.enforce_promo_audit_no_subscription_credit();

create or replace function public.prevent_completed_audit_rewrite()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.audit_completed_at is not null and (
    new.completed_by is distinct from old.completed_by or
    new.audit_completed_at is distinct from old.audit_completed_at or
    new.delivered_at is distinct from old.delivered_at or
    new.audit_fee_cents is distinct from old.audit_fee_cents or
    new.credit_eligible_from is distinct from old.credit_eligible_from or
    new.credit_expires_at is distinct from old.credit_expires_at or
    new.fulfilment_source is distinct from old.fulfilment_source or
    new.promo_redemption_id is distinct from old.promo_redemption_id or
    new.actual_paid_cents is distinct from old.actual_paid_cents or
    new.list_price_cents is distinct from old.list_price_cents or
    new.discount_cents is distinct from old.discount_cents
  ) then
    raise exception 'completed audit fields are immutable';
  end if;

  -- Once commercial provenance is set, do not silently overwrite it.
  if old.fulfilment_source is not null
     and new.fulfilment_source is distinct from old.fulfilment_source then
    raise exception 'audit fulfilment_source is immutable once set';
  end if;
  if old.promo_redemption_id is not null
     and new.promo_redemption_id is distinct from old.promo_redemption_id then
    raise exception 'audit promo_redemption_id is immutable once set';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Atomic complimentary Audit redemption (no Razorpay)
-- ---------------------------------------------------------------------------
create or replace function public.redeem_audit_go_free_code_v1(
  p_code_hash text,
  p_audit_order_id uuid,
  p_expected_tenant_id uuid,
  p_customer_email text,
  p_idempotency_key text,
  p_actor_user_id uuid default null,
  p_list_price_cents bigint default 99900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo public.promo_codes;
  v_order public.audit_orders;
  v_existing public.promo_redemptions;
  v_redemption_id uuid;
  v_email text;
  v_use_count integer;
  v_customer_use_count integer;
begin
  if p_code_hash is null or length(trim(p_code_hash)) = 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_code', 'message', 'This code is invalid.');
  end if;
  if p_audit_order_id is null or p_expected_tenant_id is null then
    return jsonb_build_object('success', false, 'reason', 'missing_order', 'message', 'This code is invalid.');
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('success', false, 'reason', 'missing_idempotency_key', 'message', 'This code is invalid.');
  end if;
  if p_list_price_cents is distinct from 99900 then
    return jsonb_build_object('success', false, 'reason', 'invalid_list_price', 'message', 'This code is invalid.');
  end if;

  v_email := lower(trim(coalesce(p_customer_email, '')));
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_email', 'message', 'This code is invalid.');
  end if;

  -- Idempotent replay by key
  select * into v_existing
  from public.promo_redemptions
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'success', true,
      'already_redeemed', true,
      'redemption_id', v_existing.id,
      'audit_order_id', v_existing.audit_order_id,
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

  if v_promo.payment_purpose <> 'audit_fee' or v_promo.product_scope <> 'audit_fee' then
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

  select * into v_order
  from public.audit_orders
  where id = p_audit_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'order_not_found', 'message', 'This code is invalid.');
  end if;

  if v_order.tenant_id <> p_expected_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'cross_tenant', 'message', 'This code is invalid.');
  end if;

  if v_order.status <> 'pending_payment' then
    -- Same order already promo-fulfilled (exact-once)
    if v_order.status = 'paid'
       and v_order.fulfilment_source = 'promo'
       and v_order.promo_redemption_id is not null then
      return jsonb_build_object(
        'success', true,
        'already_redeemed', true,
        'redemption_id', v_order.promo_redemption_id,
        'audit_order_id', v_order.id,
        'amount_due_cents', 0
      );
    end if;
    return jsonb_build_object('success', false, 'reason', 'order_not_payable', 'message', 'This code is invalid.');
  end if;

  if coalesce(v_order.audit_fee_cents, 0) <> 99900 then
    return jsonb_build_object('success', false, 'reason', 'fee_mismatch', 'message', 'This code is invalid.');
  end if;

  -- Guest email on the order must match when present
  if v_order.guest_email is not null
     and lower(trim(v_order.guest_email)) <> v_email then
    return jsonb_build_object('success', false, 'reason', 'order_email_mismatch', 'message', 'This code is invalid.');
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

  insert into public.promo_redemptions (
    promo_code_id,
    tenant_id,
    user_id,
    customer_email,
    product_scope,
    payment_purpose,
    audit_order_id,
    list_price_cents,
    discount_cents,
    amount_due_cents,
    idempotency_key,
    metadata
  ) values (
    v_promo.id,
    v_order.tenant_id,
    p_actor_user_id,
    v_email,
    'audit_fee',
    'audit_fee',
    v_order.id,
    99900,
    99900,
    0,
    p_idempotency_key,
    jsonb_build_object(
      'fulfilment_source', 'promo',
      'complimentary', true,
      'code_prefix', v_promo.code_prefix
    )
  )
  returning id into v_redemption_id;

  update public.audit_orders
  set status = 'paid',
      fulfilment_source = 'promo',
      promo_redemption_id = v_redemption_id,
      list_price_cents = 99900,
      discount_cents = 99900,
      actual_paid_cents = 0,
      credit_eligible_from = null,
      credit_expires_at = null,
      guest_email = coalesce(guest_email, v_email),
      updated_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'success', true,
    'already_redeemed', false,
    'redemption_id', v_redemption_id,
    'audit_order_id', v_order.id,
    'tenant_id', v_order.tenant_id,
    'list_price_cents', 99900,
    'discount_cents', 99900,
    'amount_due_cents', 0,
    'fulfilment_source', 'promo'
  );
end;
$$;

revoke execute on function public.redeem_audit_go_free_code_v1(text, uuid, uuid, text, text, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.redeem_audit_go_free_code_v1(text, uuid, uuid, text, text, uuid, bigint)
  to service_role;

-- Preview-only validation (no mutation). Still service_role-only.
create or replace function public.validate_audit_go_free_code_v1(
  p_code_hash text,
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
begin
  if p_code_hash is null or length(trim(p_code_hash)) = 0 then
    return jsonb_build_object('valid', false, 'reason', 'invalid_code', 'message', 'This code is invalid.');
  end if;

  select * into v_promo from public.promo_codes where code_hash = p_code_hash;
  if not found or not v_promo.is_active then
    return jsonb_build_object('valid', false, 'reason', 'invalid_code', 'message', 'This code is invalid.');
  end if;

  if v_promo.payment_purpose <> 'audit_fee' then
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
    'product_scope', v_promo.product_scope,
    'payment_purpose', v_promo.payment_purpose,
    'discount_percent', v_promo.discount_percent,
    'list_price_cents', 99900,
    'discount_cents', 99900,
    'amount_due_cents', 0,
    'code_prefix', v_promo.code_prefix
  );
end;
$$;

revoke execute on function public.validate_audit_go_free_code_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.validate_audit_go_free_code_v1(text, text)
  to service_role;
