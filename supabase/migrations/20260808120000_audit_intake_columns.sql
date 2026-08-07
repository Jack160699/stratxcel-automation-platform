-- Additive: 3-phase Audit intake storage on the already payment-integrated
-- audit_orders table (not a new "audit" concept — the same row the
-- reconcile_and_fulfill_razorpay_payment_v4 RPC flips to 'paid').
--
-- business_name/industry/website_url/social_links/goals already cover
-- Phase 1 (Your Business). These two columns cover Phase 2 (Business Deep
-- Dive) and Phase 3 (Goals) without inventing a second schema for them.
-- `status` already models the rest of the lifecycle customers see
-- ('paid' -> 'in_review' -> 'completed'), so no separate job_status column
-- is added either.

alter table audit_orders
  add column if not exists deep_dive_answers jsonb not null default '{}'::jsonb,
  add column if not exists goals_answers jsonb not null default '{}'::jsonb,
  add column if not exists report_data jsonb;

comment on column audit_orders.deep_dive_answers is 'Phase 2 intake: ideal customers, pricing, competitors, lead sources, marketing, sales process, differentiation, problems, reach.';
comment on column audit_orders.goals_answers is 'Phase 3 intake: 90-day success definition, obstacle, top priorities, budget, timeframe.';
comment on column audit_orders.report_data is 'Generated audit report content, when produced. Null/empty means no report exists yet — the UI must never fabricate one.';
