// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/phone-normalize.test.ts
import assert from "node:assert/strict";
import { normalizePhoneNumber } from "../phone-normalize.ts";

function run() {
  // Different formats of the same Indian number must all normalize identically —
  // this is the actual dedupe guarantee (crm_leads_tenant_normalized_phone_idx).
  const variants = ["9876543210", "+91 98765 43210", "+919876543210", "919876543210", "91-9876543210"];
  const normalized = variants.map(normalizePhoneNumber);
  for (const n of normalized) assert.equal(n, "919876543210", `all variants must normalize the same way, got ${n}`);

  assert.equal(normalizePhoneNumber(""), null, "empty input must not normalize to a fabricated value");
  assert.equal(normalizePhoneNumber("abc"), null, "non-numeric input must not normalize to a fabricated value");

  console.log("phone-normalize.test.ts (@stratxcel/whatsapp): ALL PASS");
}

run();
