// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/phone-normalize.test.ts
import assert from "node:assert/strict";
import { normalizePhoneNumber, classifyIndianDestination } from "../phone-normalize.ts";

function run() {
  // Different formats of the same Indian number must all normalize identically —
  // this is the actual dedupe guarantee (crm_leads_tenant_normalized_phone_idx).
  const variants = ["9876543210", "+91 98765 43210", "+919876543210", "919876543210", "91-9876543210"];
  const normalized = variants.map(normalizePhoneNumber);
  for (const n of normalized) assert.equal(n, "919876543210", `all variants must normalize the same way, got ${n}`);

  assert.equal(normalizePhoneNumber(""), null, "empty input must not normalize to a fabricated value");
  assert.equal(normalizePhoneNumber("abc"), null, "non-numeric input must not normalize to a fabricated value");

  // 1. Praveen Shenoy Mangalore landline (+91 82424 07890 / 0824-2407890)
  const praveen = classifyIndianDestination("+91 82424 07890");
  assert.equal(praveen.isValid, true);
  assert.equal(praveen.isMobile, false);
  assert.equal(praveen.isLandline, true);
  assert.equal(praveen.clean10, "8242407890");
  assert.equal(praveen.reason, "fixed_landline_std_824");

  // 2. Bangalore Landline (+91-80-27289910)
  const blr = classifyIndianDestination("+91-80-27289910");
  assert.equal(blr.isLandline, true);
  assert.equal(blr.isMobile, false);
  assert.equal(blr.clean10, "8027289910");

  // 3. Valid mobile numbers (+91 99002 34189, 09844091238, 6267979780)
  const m1 = classifyIndianDestination("+91 99002 34189");
  assert.equal(m1.isMobile, true);
  assert.equal(m1.isLandline, false);
  assert.equal(m1.clean10, "9900234189");

  const m2 = classifyIndianDestination("09844091238");
  assert.equal(m2.isMobile, true);
  assert.equal(m2.isLandline, false);
  assert.equal(m2.clean10, "9844091238");

  const m3 = classifyIndianDestination("6267979780");
  assert.equal(m3.isMobile, true);
  assert.equal(m3.isLandline, false);
  assert.equal(m3.clean10, "6267979780");

  console.log("phone-normalize.test.ts (@stratxcel/whatsapp): ALL PASS (including landline classification)");
}

run();
