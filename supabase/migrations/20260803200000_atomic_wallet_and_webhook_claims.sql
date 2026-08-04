-- Additive migration for atomic wallet ledger entries and webhook event processing claims.
-- 1. Unique index for wallet ledger idempotency
-- 2. Atomic SECURITY DEFINER PostgreSQL function for wallet ledger writes
-- 3. Webhook claim columns & RPC functions for concurrent replay protection

-- 1. Unique index on wallet ledger entries
create unique index if not exists wallet_ledger_reference_idx
  on wallet_ledger_entries (tenant_id, reference_type, reference_id, entry_type)
  where reference_type is not null and reference_id is not null;

-- 2. Webhook claim columns
alter table razorpay_webhook_events
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_token text;

-- 3. Atomic wallet ledger entry function
create or replace function append_wallet_ledger_entry_atomic(
  p_tenant_id uuid,
  p_entry_type text,
  p_amount_cents bigint,
  p_reference_type text default null,
  p_reference_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_current_balance bigint;
  v_new_balance bigint;
  v_new_entry_id uuid;
begin
  -- Idempotency check: if entry with exact reference already exists, return existing details without duplicating
  if p_reference_type is not null and p_reference_id is not null then
    select id into v_existing_id
    from wallet_ledger_entries
    where tenant_id = p_tenant_id
      and reference_type = p_reference_type
      and reference_id = p_reference_id
      and entry_type = p_entry_type
    limit 1;

    if v_existing_id is not null then
      select balance_cents into v_current_balance
      from wallet_accounts
      where tenant_id = p_tenant_id;

      return jsonb_build_object(
        'inserted', false,
        'entry_id', v_existing_id,
        'amount_cents', p_amount_cents,
        'balance_cents', coalesce(v_current_balance, 0)
      );
    end if;
  end if;

  -- Ensure wallet_accounts row exists and lock it
  insert into wallet_accounts (tenant_id, balance_cents, currency)
  values (p_tenant_id, 0, 'INR')
  on conflict (tenant_id) do nothing;

  select balance_cents into v_current_balance
  from wallet_accounts
  where tenant_id = p_tenant_id
  for update;

  v_new_balance := coalesce(v_current_balance, 0) + p_amount_cents;
  if v_new_balance < 0 then
    raise exception 'Wallet balance cannot be negative (current: %, change: %)', coalesce(v_current_balance, 0), p_amount_cents;
  end if;

  -- Insert ledger entry
  insert into wallet_ledger_entries (
    tenant_id,
    entry_type,
    amount_cents,
    reference_type,
    reference_id,
    metadata
  )
  values (
    p_tenant_id,
    p_entry_type,
    p_amount_cents,
    p_reference_type,
    p_reference_id,
    p_metadata
  )
  returning id into v_new_entry_id;

  -- Update cached balance
  update wallet_accounts
  set balance_cents = v_new_balance,
      updated_at = now()
  where tenant_id = p_tenant_id;

  return jsonb_build_object(
    'inserted', true,
    'entry_id', v_new_entry_id,
    'amount_cents', p_amount_cents,
    'balance_cents', v_new_balance
  );
end;
$$;

revoke execute on function append_wallet_ledger_entry_atomic from public;
grant execute on function append_wallet_ledger_entry_atomic to service_role;

-- 4. Atomic webhook claim function
create or replace function claim_razorpay_webhook_event(
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_claim_duration_seconds int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_token text;
  v_new_id uuid;
begin
  select id, processed_at, processing_started_at, processing_token
  into v_event
  from razorpay_webhook_events
  where provider_event_id = p_provider_event_id
  for update;

  if found then
    if v_event.processed_at is not null then
      return jsonb_build_object('claimed', false, 'status', 'already_processed', 'event_id', v_event.id);
    end if;

    -- Check if lease is active (within p_claim_duration_seconds)
    if v_event.processing_started_at is not null and v_event.processing_started_at > (now() - (p_claim_duration_seconds || ' seconds')::interval) then
      return jsonb_build_object('claimed', false, 'status', 'in_progress', 'event_id', v_event.id);
    end if;

    -- Lease expired or null: grant claim
    v_token := gen_random_uuid()::text;
    update razorpay_webhook_events
    set processing_started_at = now(),
        processing_token = v_token
    where id = v_event.id;

    return jsonb_build_object('claimed', true, 'status', 'claimed_retry', 'event_id', v_event.id, 'token', v_token);
  else
    -- Insert new event with active claim token
    v_token := gen_random_uuid()::text;
    insert into razorpay_webhook_events (
      provider_event_id,
      event_type,
      payload,
      processing_started_at,
      processing_token
    )
    values (
      p_provider_event_id,
      p_event_type,
      p_payload,
      now(),
      v_token
    )
    returning id into v_new_id;

    return jsonb_build_object('claimed', true, 'status', 'claimed_new', 'event_id', v_new_id, 'token', v_token);
  end if;
end;
$$;

revoke execute on function claim_razorpay_webhook_event from public;
grant execute on function claim_razorpay_webhook_event to service_role;

-- 5. Atomic webhook completion function
create or replace function complete_razorpay_webhook_event(
  p_event_id uuid,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_affected int;
begin
  update razorpay_webhook_events
  set processed_at = now()
  where id = p_event_id
    and (processing_token = p_token or processing_token is null);

  get diagnostics v_rows_affected = row_count;
  return v_rows_affected > 0;
end;
$$;

revoke execute on function complete_razorpay_webhook_event from public;
grant execute on function complete_razorpay_webhook_event to service_role;
