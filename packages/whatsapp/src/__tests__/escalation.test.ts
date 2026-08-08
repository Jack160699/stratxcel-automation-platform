// Run with: node --experimental-strip-types packages/whatsapp/src/__tests__/escalation.test.ts
import assert from "node:assert/strict";
import { checkEscalation } from "../escalation.ts";

function run() {
  // --- 1. Explicit human requests escalate, with a traceable reason -------
  for (const body of ["Can I talk to a human?", "I want to speak with an agent", "connect me to customer support", "is there a real person I can talk to"]) {
    const result = checkEscalation({ body, compilerMatched: true });
    assert.equal(result.shouldEscalate, true, `expected escalation for: "${body}"`);
    assert.equal(result.reason, "customer_requested_human");
  }

  // --- 2. Complaint/risk language escalates -------------------------------
  assert.deepEqual(checkEscalation({ body: "This is unacceptable, I want to file a complaint", compilerMatched: true }), {
    shouldEscalate: true,
    reason: "complaint_or_risk",
  });

  // --- 3. Billing/payment language escalates ------------------------------
  assert.deepEqual(checkEscalation({ body: "I was charged twice, please refund me", compilerMatched: true }), {
    shouldEscalate: true,
    reason: "billing_or_payment",
  });

  // --- 4. Ordinary messages never escalate --------------------------------
  assert.deepEqual(checkEscalation({ body: "Hi, I'm interested in your services", compilerMatched: true }), { shouldEscalate: false, reason: null });
  assert.deepEqual(checkEscalation({ body: "What are your business hours?", compilerMatched: true }), { shouldEscalate: false, reason: null });

  // --- 5. Repeated low confidence escalates, a single miss does not -------
  assert.equal(checkEscalation({ body: "asdkjfh", compilerMatched: false, consecutiveLowConfidenceCount: 1 }).shouldEscalate, false);
  assert.equal(checkEscalation({ body: "asdkjfh", compilerMatched: false, consecutiveLowConfidenceCount: 2 }).shouldEscalate, true);

  console.log("escalation.test.ts (@stratxcel/whatsapp): ALL PASS");
}

run();
