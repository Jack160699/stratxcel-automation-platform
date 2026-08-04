-- Additive migration:
-- 1. Tightens complete_razorpay_webhook_event to strictly require matching processing_token (no null bypass)
-- 2. Adds unique index on payment_refunds.provider_refund_id

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
  if p_token is null or trim(p_token) = '' then
    raise exception 'processing_token is required to complete webhook event';
  end if;

  update razorpay_webhook_events
  set processed_at = now(),
      processing_token = null
  where id = p_event_id
    and processing_token = p_token;

  get diagnostics v_rows_affected = row_count;
  return v_rows_affected > 0;
end;
$$;

revoke execute on function complete_razorpay_webhook_event from public;
grant execute on function complete_razorpay_webhook_event to service_role;

-- Unique index for provider_refund_id idempotency
create unique index if not exists payment_refunds_provider_refund_idx
  on payment_refunds (provider_refund_id)
  where provider_refund_id is not null;
