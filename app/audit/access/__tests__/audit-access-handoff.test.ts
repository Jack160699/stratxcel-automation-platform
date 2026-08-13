// Regression: /audit/access handoff must use canonical ?order= with legacy ?auditOrderId= compat.
// Run with: node --experimental-strip-types app/audit/access/__tests__/audit-access-handoff.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAccessOrderParam } from "../../../../lib/audit/resolve-access-order-param.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const readCode = (...parts: string[]) => read(...parts).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SAMPLE_ORDER_ID = "1fe317f1-3efe-4368-a30d-b7162175f4fd";

function run() {
  // --- 1. promo redeem accessPath uses canonical ?order= --------------------
  const redeem = readCode("app", "api", "platform", "audit", "promo", "redeem", "route.ts");
  assert.match(
    redeem,
    /accessPath:\s*`\/audit\/access\?order=\$\{encodeURIComponent\(/,
    "promo redeem accessPath must use canonical ?order= parameter"
  );
  assert.doesNotMatch(
    redeem,
    /accessPath:[\s\S]*auditOrderId=/,
    "promo redeem accessPath must not emit legacy auditOrderId query param"
  );

  // --- 2. /audit/access?order=<id> resolves --------------------------------
  assert.equal(resolveAccessOrderParam({ order: SAMPLE_ORDER_ID }), SAMPLE_ORDER_ID);
  assert.equal(
    resolveAccessOrderParam({ order: `  ${SAMPLE_ORDER_ID}  ` }),
    SAMPLE_ORDER_ID,
    "order param must be trimmed"
  );

  const accessPage = readCode("app", "audit", "access", "page.tsx");
  assert.match(accessPage, /resolveAccessOrderParam/);
  assert.match(accessPage, /order\?:\s*string/);
  assert.match(accessPage, /Missing order reference/);

  // --- 3. legacy /audit/access?auditOrderId=<id> also works ----------------
  assert.equal(
    resolveAccessOrderParam({ auditOrderId: SAMPLE_ORDER_ID }),
    SAMPLE_ORDER_ID,
    "legacy auditOrderId param must resolve to the same order id"
  );
  assert.equal(
    resolveAccessOrderParam({ order: "canonical-id", auditOrderId: "legacy-id" }),
    "canonical-id",
    "canonical order param must take precedence over legacy auditOrderId"
  );
  assert.match(accessPage, /auditOrderId\?:\s*string/);

  // --- 4. missing both → Missing order reference -----------------------------
  assert.equal(resolveAccessOrderParam({}), undefined);
  assert.equal(resolveAccessOrderParam({ order: "", auditOrderId: "" }), undefined);
  assert.match(accessPage, /if \(!order\)/);
  assert.match(accessPage, /Missing order reference/);

  // --- 5. successful claim → /app/audit ------------------------------------
  const claimAndContinue = readCode("app", "audit", "access", "ClaimAndContinue.tsx");
  const claimEmailOtp = readCode("app", "audit", "access", "ClaimEmailOtpForm.tsx");
  assert.match(claimAndContinue, /router\.push\("\/app\/audit"\)/);
  assert.match(claimEmailOtp, /router\.push\("\/app\/audit"\)/);
  assert.match(claimAndContinue, /\/api\/platform\/audit\/claim/);
  assert.match(claimEmailOtp, /\/api\/platform\/audit\/claim/);

  // --- 6. no cross-tenant access regression ----------------------------------
  const claim = readCode("app", "api", "platform", "audit", "claim", "route.ts");
  assert.match(claim, /guest_email.*trim\(\)\.toLowerCase\(\)/);
  assert.match(claim, /status:\s*403/);
  assert.match(claim, /already been claimed/);
  assert.match(redeem, /order\.tenant_id\s*!==\s*tenantId/);

  // --- 7. no Razorpay regression ---------------------------------------------
  assert.doesNotMatch(redeem, /createPaymentLink/);
  assert.doesNotMatch(redeem, /razorpay/i);
  assert.match(redeem, /redeem_audit_go_free_code_v1/);
  assert.match(redeem, /subscription_payment/);

  const checkout = readCode("app", "api", "platform", "audit", "checkout", "route.ts");
  assert.match(checkout, /createPaymentLink/);
  assert.doesNotMatch(checkout, /redeem_audit_go_free_code_v1/);

  const paymentStatus = readCode("app", "payment", "status", "page.tsx");
  assert.match(paymentStatus, /\/audit\/access\?order=\$\{encodeURIComponent\(payment\.referenceId\)\}/);

  const guestCheckout = readCode("app", "audit", "checkout", "GuestCheckoutForm.tsx");
  assert.match(
    guestCheckout,
    /\/audit\/access\?order=\$\{encodeURIComponent\(body\.auditOrderId\)\}/,
    "guest checkout fallback must use canonical ?order="
  );
  assert.doesNotMatch(guestCheckout, /\/audit\/access\?auditOrderId=/);

  console.log("audit-access-handoff.test.ts: ALL PASS");
}

run();
