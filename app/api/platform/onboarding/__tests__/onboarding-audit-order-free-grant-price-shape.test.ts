// Regression test for a P0 finding from live production inspection on
// 2026-09-08: POST /api/platform/onboarding inserted/updated audit_orders
// with audit_fee_cents: 0 combined with list_price_cents/discount_cents:
// 99900 for a "product_grant" free audit. That shape satisfies NEITHER
// branch of public.audit_has_verified_fulfilment() (redefined a day after
// this route was written, by
// supabase/migrations/20260819080000_free_audit_price_check_repair.sql,
// without this call site ever being updated to match) — so
// start_automatic_audit_generation_v1 always returned {success:false,
// reason:'verified_audit_payment_required'} and never inserted into
// audit_generation_runs/queue_jobs. The caller only checked `result?.run_id`
// and silently did nothing on failure, so every onboarding-granted free
// audit from this route was permanently stuck at status=in_review with no
// report and no log line.
//
// Confirmed live against production (Supabase project uccqlgeghkwzujeeymua):
// select audit_has_verified_fulfilment(o.*) from audit_orders o
// where fulfilment_source='product_grant' and audit_fee_cents=0 and
// list_price_cents=99900 → false, for two real customer tenants
// ("MedRoute Consultancy", "Metro Wheels Car Rentals").
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// onboarding-audit-order-fulfilment-source.test.ts and
// supabase/__tests__/free_audit_price_check_repair-migration.test.ts.
// Run with: node --experimental-strip-types app/api/platform/onboarding/__tests__/onboarding-audit-order-free-grant-price-shape.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeSource = fs.readFileSync(path.join(root, "route.ts"), "utf8");

// A faithful re-implementation of public.audit_has_verified_fulfilment()
// (supabase/migrations/20260819080000_free_audit_price_check_repair.sql),
// so this test proves behavior, not just string matching.
type OrderShape = {
  audit_fee_cents: number;
  fulfilment_source: string | null;
  list_price_cents: number | null;
  discount_cents: number | null;
  actual_paid_cents: number | null;
};

function auditHasVerifiedFulfilment(o: OrderShape): boolean {
  const freeByDefault =
    o.audit_fee_cents === 0 &&
    o.fulfilment_source === "product_grant" &&
    (o.list_price_cents ?? 0) === 0 &&
    (o.discount_cents ?? 0) === 0 &&
    (o.actual_paid_cents ?? 0) === 0;

  const legacyWaived =
    o.audit_fee_cents === 99900 &&
    (o.fulfilment_source === "promo" || o.fulfilment_source === "product_grant") &&
    (o.actual_paid_cents ?? 0) === 0;
  // (the real function also allows a paid payment_links row here — not
  // reachable for the onboarding route's own "product_grant" seed, so not
  // modeled here)

  return freeByDefault || legacyWaived;
}

function run() {
  // --- 1. The regression itself: prove the OLD shape this route used to
  //        write is really rejected by the gate (documents the bug, not
  //        just the fix). -------------------------------------------------
  const oldBrokenShape: OrderShape = {
    audit_fee_cents: 0,
    fulfilment_source: "product_grant",
    list_price_cents: 99900,
    discount_cents: 99900,
    actual_paid_cents: null,
  };
  assert.equal(
    auditHasVerifiedFulfilment(oldBrokenShape),
    false,
    "sanity check: the pre-fix shape (audit_fee_cents=0, list/discount=99900) must be rejected by the gate " +
      "— this is the exact shape that stranded real customer orders (MedRoute Consultancy, Metro Wheels Car Rentals) at status=in_review forever"
  );

  // --- 2. The new shape this route must write is actually accepted. ------
  const fixedShape: OrderShape = {
    audit_fee_cents: 99900,
    fulfilment_source: "product_grant",
    list_price_cents: 99900,
    discount_cents: 99900,
    actual_paid_cents: 0,
  };
  assert.equal(
    auditHasVerifiedFulfilment(fixedShape),
    true,
    "the fixed shape (audit_fee_cents=99900, actual_paid_cents=0, fulfilment_source=product_grant) must pass the real gate"
  );

  // --- 3. route.ts's insert branch must never again write
  //        audit_fee_cents: 0 for this free-grant seed. --------------------
  assert.ok(
    !/audit_fee_cents:\s*0,/.test(routeSource),
    "route.ts must not insert audit_fee_cents: 0 for a product_grant order while list_price_cents/discount_cents stay at 99900 " +
      "— that shape fails audit_has_verified_fulfilment() and silently strands the order"
  );

  const insertBlock =
    routeSource.match(/\.from\("audit_orders"\)\s*\.insert\(\{[\s\S]*?\.select\("id"\)\s*\.single\(\);/)?.[0] ?? "";
  assert.match(
    insertBlock,
    /audit_fee_cents:\s*FREE_GRANT_AUDIT_FEE_CENTS/,
    "audit_orders insert must set audit_fee_cents to the accepted free-grant value"
  );
  assert.match(
    insertBlock,
    /actual_paid_cents:\s*0/,
    "audit_orders insert must explicitly set actual_paid_cents: 0 (not leave it null) so the gate's legacyWaived branch matches"
  );

  // --- 4. route.ts's update branch must also normalize pricing for a
  //        not-already-paid existing order (an existing order might have
  //        been seeded earlier with a stale/broken shape too). ------------
  const updateBlock =
    routeSource.match(/\.from\("audit_orders"\)\s*\.update\(\{[\s\S]*?\.eq\("id",\s*auditOrderId\);/)?.[0] ?? "";
  assert.match(
    updateBlock,
    /alreadyPaid\s*\?\s*\{\}\s*:\s*\{\s*audit_fee_cents:\s*FREE_GRANT_AUDIT_FEE_CENTS,\s*actual_paid_cents:\s*0\s*\}/,
    "audit_orders update must normalize audit_fee_cents/actual_paid_cents to the accepted free-grant shape, " +
      "unless the order has already been genuinely paid"
  );

  // --- 5. The RPC result must be inspected on failure, not just on
  //        success (result?.run_id) — this is what makes the failure
  //        mode observable instead of silent. ------------------------------
  const rpcBlock =
    routeSource.match(/const started = await serviceClient\.rpc\("start_automatic_audit_generation_v1"[\s\S]*?\} catch \(autoErr\)/)?.[0] ?? "";
  assert.match(rpcBlock, /started\.error/, "must check started.error, not just result?.run_id");
  assert.match(rpcBlock, /console\.error\(/, "a failed/errored RPC call must be logged, not silently ignored");

  console.log("PASS: onboarding free-grant audit_orders shape passes audit_has_verified_fulfilment(), and RPC failures are logged");
}

run();
