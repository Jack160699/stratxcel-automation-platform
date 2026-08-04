-- Additive migration:
-- Enforces one payment order per business reference per provider and tenant

create unique index if not exists payment_orders_business_reference_idx
on payment_orders (
  tenant_id,
  provider,
  reference_type,
  reference_id
)
where reference_type is not null
  and reference_id is not null;
