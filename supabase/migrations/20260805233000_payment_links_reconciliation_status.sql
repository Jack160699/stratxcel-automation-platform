-- Additive migration to allow 'reconciliation_required' in payment_links status constraint

alter table payment_links drop constraint if exists payment_links_status_check;
alter table payment_links add constraint payment_links_status_check
  check (status in (
    'created',
    'paid',
    'partially_paid',
    'expired',
    'cancelled',
    'reconciliation_required'
  ));
