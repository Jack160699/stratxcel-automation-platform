-- PR #24 follow-up: recurring AutoPay creates one payment_order per provider
-- payment. The legacy business-reference unique index assumed one order per
-- business entity and blocked renewal charges for the same subscription id.
-- Keep the uniqueness guard for one-shot checkout references; exclude
-- provider-managed subscription charge rows (keyed by provider_payment_id).

drop index if exists public.payment_orders_business_reference_idx;

create unique index if not exists payment_orders_business_reference_idx
on public.payment_orders (
  tenant_id,
  provider,
  reference_type,
  reference_id
)
where reference_type is not null
  and reference_id is not null
  and reference_type <> 'razorpay_subscription';
