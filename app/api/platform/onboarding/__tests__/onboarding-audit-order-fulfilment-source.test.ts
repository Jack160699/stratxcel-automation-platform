// Regression test for a P1 finding from live E2E testing on 2026-08-23:
// POST /api/platform/onboarding inserted/updated audit_orders with
// fulfilment_source: "free_audit" — a value that does not exist in
// audit_orders_fulfilment_source_check (CHECK: fulfilment_source IS NULL
// OR fulfilment_source = ANY(['razorpay','promo','product_grant'])),
// confirmed via pg_get_constraintdef on the live production table.
//
// Because the insert's/update's `error` was destructured and never
// checked, the constraint violation was silently swallowed: auditOrderId
// stayed null, "Trigger automatic audit generation" was skipped
// entirely, and onboarding still returned 201. Effect verified live: a
// brand-new tenant onboarded successfully, the Home dashboard showed
// "Business audit: Research in progress" (fabricated — nothing was ever
// running), while /app/audit correctly reported "No active audit found"
// and zero rows existed in audit_orders for that tenant at all — the
// core "Your free business health audit begins immediately" promise
// from the Review step silently never happened for any new customer.
//
// The codebase already has an established convention for this exact
// case — claim_fresh_product_grant_audit_v1 and
// audit-v1-experience-migration use fulfilment_source: "product_grant"
// for a free audit granted as part of onboarding (not a payment, not a
// redeemed promo code) — this route reinvented the field with the wrong
// value instead of reusing it.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types app/api/platform/onboarding/__tests__/onboarding-audit-order-fulfilment-source.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeSource = fs.readFileSync(path.join(root, "route.ts"), "utf8");

function run() {
  // --- 1. Never write the invalid "free_audit" value again. --------------
  assert.ok(
    !/fulfilment_source:\s*"free_audit"/.test(routeSource),
    'route.ts must not set fulfilment_source: "free_audit" — that value violates ' +
      "audit_orders_fulfilment_source_check (only razorpay | promo | product_grant are allowed), " +
      "which silently drops the audit_orders insert/update and skips automatic audit generation entirely"
  );

  // --- 2. Both the insert and the update use the correct, established
  //        value for an onboarding-granted free audit. --------------------
  const productGrantCount = (routeSource.match(/fulfilment_source:\s*"product_grant"/g) ?? []).length;
  assert.equal(
    productGrantCount,
    2,
    `expected fulfilment_source: "product_grant" in both the audit_orders insert and update branches, found ${productGrantCount}`
  );

  // --- 3. Both the insert and the update must check their error before
  //        trusting auditOrderId — the exact silent-failure shape found
  //        here (destructuring only `data`) must not regress. -----------
  const insertBlock = routeSource.match(/const \{[^}]*\} = await serviceClient\s*\.from\("audit_orders"\)\s*\.insert\(\{[\s\S]*?\.select\("id"\)\s*\.single\(\);/)?.[0] ?? "";
  assert.match(insertBlock, /const \{\s*data:\s*inserted,\s*error:\s*insertOrderError\s*\}/, "audit_orders insert must destructure and check `error`");
  const updateBlock = routeSource.match(/const \{[^}]*\} = await serviceClient\s*\.from\("audit_orders"\)\s*\.update\(\{[\s\S]*?\.eq\("id",\s*auditOrderId\);/)?.[0] ?? "";
  assert.match(updateBlock, /const \{\s*error:\s*updateOrderError\s*\}/, "audit_orders update must destructure and check `error`");

  console.log("PASS: onboarding audit_orders insert/update use a valid fulfilment_source and surface their errors");
}

run();
