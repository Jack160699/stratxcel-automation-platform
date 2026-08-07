-- Additive: guest (pre-auth) ₹999 Audit checkout support on the already
-- payment-integrated audit_orders table.
--
-- guest_email is the address the customer typed at checkout, used only to
-- route the post-payment claim (Supabase's own signInWithOtp) and to check
-- it against the authenticated user's verified email before a purchase can
-- be attached to an account. claimed_at marks the claim as done — a NULL
-- claimed_at on an otherwise-paid order means it is claimable exactly once.

alter table audit_orders
  add column if not exists guest_email text,
  add column if not exists claimed_at timestamptz;

comment on column audit_orders.guest_email is 'Email supplied at guest checkout, before any Stratxcel account exists. Never authoritative on its own — claim also requires a verified Supabase session for this exact address.';
comment on column audit_orders.claimed_at is 'Set once, when the paid order is attached to an authenticated tenant member. NULL means unclaimed — claimable only while status is paid/in_review/completed.';
