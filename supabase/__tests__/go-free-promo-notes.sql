-- Local NONPROD fixture notes for Go Free promo redemption races.
-- Not executed in CI without a database; documents expected RPC outcomes.

-- 1) valid Audit code → amount due 0, status paid, fulfilment_source=promo, no payment_orders row
-- 2) invalid / expired / disabled / max uses / wrong email → rejected with public messages
-- 3) same customer / same order double submit → exactly one promo_redemptions row (idempotency_key)
-- 4) race on final remaining use → only one success under promo_codes row lock
-- 5) subscription_payment purpose rejected at API (product scope audit_fee only)
-- 6) promo completed audit → credit_eligible_from IS NULL (trigger enforce_promo_audit_no_subscription_credit)
-- 7) cross-tenant redeem → rejected
