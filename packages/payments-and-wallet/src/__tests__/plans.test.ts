// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/plans.test.ts
import assert from "node:assert/strict";
import { PLAN_DEFINITIONS, getSelfServicePlan, getPlanDefinition, isPlanTier, SELF_SERVICE_PLAN_TIERS } from "../plans.ts";
import { splitGstInclusive } from "../../../../lib/payments/gst.ts";

function run() {
  // --- 1. Canonical commercial prices, exactly as approved -------------------
  assert.equal(PLAN_DEFINITIONS.launch.priceCents, 949_900, "Launch must be ₹9,499.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.growth.priceCents, 1_899_900, "Growth must be ₹18,999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.custom_growth.priceCents, null, "Custom Growth must not have a universal fixed price");
  assert.equal(PLAN_DEFINITIONS.custom_growth.startingAtCents, 2_399_900, "Custom Growth must be quoted as starting at ₹23,999.00");

  // --- 2. Self-service checkout is Launch/Growth only -------------------------
  assert.deepEqual([...SELF_SERVICE_PLAN_TIERS].sort(), ["growth", "launch"], "only Launch and Growth are self-service");
  assert.equal(PLAN_DEFINITIONS.custom_growth.selfServiceCheckout, false, "Custom Growth must remain quote-led");
  assert.equal(getSelfServicePlan("custom_growth"), null, "getSelfServicePlan must refuse to hand back a checkout price for Custom Growth");
  assert.ok(getSelfServicePlan("launch"), "Launch must be self-service");
  assert.ok(getSelfServicePlan("growth"), "Growth must be self-service");

  // --- 3. No revived legacy identifiers ---------------------------------------
  const tiers = Object.keys(PLAN_DEFINITIONS);
  for (const legacy of ["signal", "mesh", "fleet", "scale"]) {
    assert.equal(tiers.includes(legacy), false, `legacy plan identifier '${legacy}' must not be revived`);
  }
  assert.deepEqual(tiers.sort(), ["custom_growth", "growth", "launch"]);

  // --- 4. isPlanTier / getPlanDefinition ---------------------------------------
  assert.equal(isPlanTier("launch"), true);
  assert.equal(isPlanTier("scale"), false);
  assert.equal(isPlanTier(undefined), false);
  assert.equal(getPlanDefinition("growth").publicName, "Growth");

  // --- 5. Every fixed plan price survives the GST-inclusive split exactly -----
  for (const tier of ["launch", "growth"] as const) {
    const price = PLAN_DEFINITIONS[tier].priceCents!;
    const { taxableValueCents, gstCents, totalCents } = splitGstInclusive(price);
    assert.equal(taxableValueCents + gstCents, price, `${tier}: taxable + GST must reconstruct the exact price`);
    assert.equal(totalCents, price, `${tier}: split must never change the charged total`);
  }

  console.log("plans.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
