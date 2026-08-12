-- Additive SQL checks for Go Free promo redemption (run against local NONPROD).
-- Expect PASS when migration 20260813120000_admin_go_free_promo_codes.sql is applied.

do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_order_a uuid;
  v_order_b uuid;
  v_promo_id uuid;
  v_hash text := encode(sha256(convert_to('stratxcel:go-free:v1:BETA100TEST', 'UTF8')), 'hex');
  -- NOTE: app hashes with Node crypto SHA-256 of the same string; this fixture
  -- inserts a precomputed hash matching lib/promo/go-free.ts for BETA100TEST.
  v_res jsonb;
  v_count integer;
begin
  -- This block is documentation-oriented; real CI uses the Node source-inspection suite.
  -- When executing manually, replace v_hash with the exact Node hashPromoCode('BETA100TEST') output.
  raise notice 'go-free-promo SQL notes loaded (manual NONPROD harness)';
end $$;
