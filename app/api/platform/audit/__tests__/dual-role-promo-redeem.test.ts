// Regression: dual-role staff with real tenant membership must redeem Go Free codes
// on the customer Audit checkout surface. Pure staff and STAFF_VIEWING_CLIENT stay blocked.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideIdentityState } from "../../../../../lib/identity/identity-state.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const readCode = (...parts: string[]) => read(...parts).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function run() {
  const redeem = readCode("app", "api", "platform", "audit", "promo", "redeem", "route.ts");
  const validate = readCode("app", "api", "platform", "audit", "promo", "validate", "route.ts");
  const guest = readCode("app", "audit", "checkout", "GuestCheckoutForm.tsx");

  // 1. Dual-role staff + customer membership + customer Audit surface → allowed
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: true,
      membershipCount: 1,
      hasValidStaffWorkspace: false,
      workspaceMode: "customer",
    }),
    "CUSTOMER_MEMBER"
  );
  assert.match(
    redeem,
    /resolveCanonicalIdentity\(\s*\{\s*routeSurface:\s*"app"\s*\}\s*\)/,
    "redeem must resolve identity on the customer Audit surface"
  );
  assert.doesNotMatch(
    redeem,
    /resolveCanonicalIdentity\(\s*\)/,
    "redeem must not use bare resolveCanonicalIdentity()"
  );

  // 2. Pure staff without membership → INTERNAL_STAFF → 403
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: true,
      membershipCount: 0,
      hasValidStaffWorkspace: false,
      workspaceMode: "admin",
    }),
    "INTERNAL_STAFF"
  );
  assert.match(redeem, /INTERNAL_STAFF/);
  assert.match(redeem, /Staff accounts cannot redeem customer promo codes/);
  assert.match(redeem, /status:\s*403/);

  // 3. STAFF_VIEWING_CLIENT → 403
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: true,
      membershipCount: 1,
      hasValidStaffWorkspace: true,
      workspaceMode: "admin",
    }),
    "STAFF_VIEWING_CLIENT"
  );
  assert.match(redeem, /STAFF_VIEWING_CLIENT/);

  // 4. Ordinary customer → allowed (not in staff block branch)
  assert.equal(
    decideIdentityState({
      hasSession: true,
      isStaff: false,
      membershipCount: 1,
      hasValidStaffWorkspace: false,
      workspaceMode: null,
    }),
    "CUSTOMER_MEMBER"
  );
  const staffBlock = redeem.match(
    /if\s*\(\s*identity\.state\s*===\s*"INTERNAL_STAFF"\s*\|\|\s*identity\.state\s*===\s*"STAFF_VIEWING_CLIENT"\s*\)/
  );
  assert.ok(staffBlock, "staff block must only target INTERNAL_STAFF and STAFF_VIEWING_CLIENT");

  // 5. Guest promo flow unchanged (no authenticated identity gate)
  assert.doesNotMatch(validate, /resolveCanonicalIdentity/);
  assert.match(guest, /\/api\/platform\/audit\/promo\/redeem/);
  assert.match(guest, /\/api\/platform\/audit\/promo\/validate/);
  assert.doesNotMatch(validate, /resolveCanonicalIdentity/);
  assert.match(redeem, /if\s*\(\s*user\s*\)/);

  // 6. Cross-tenant blocked
  assert.match(redeem, /order\.tenant_id\s*!==\s*tenantId/);
  assert.match(redeem, /publicPromoMessage\("cross_tenant"\)/);

  // 7. Promo remains: no Razorpay, no subscription, no ₹999 Audit credit
  assert.doesNotMatch(redeem, /createPaymentLink/);
  assert.doesNotMatch(redeem, /razorpay/i);
  assert.match(redeem, /subscription_payment/);
  assert.doesNotMatch(redeem, /reconcile_and_fulfill/);

  const credits = readCode("packages", "payments-and-wallet", "src", "audit-credits.ts");
  assert.match(credits, /fulfilment_source === "promo"/);

  console.log("dual-role-promo-redeem.test.ts: ALL PASS");
}

run();
