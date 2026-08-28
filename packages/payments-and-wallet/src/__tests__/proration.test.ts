import assert from "node:assert/strict";
import { calculateProration } from "../proration.ts";
import { PLAN_DEFINITIONS } from "../plans.ts";

async function runTests() {
  console.log("Starting Proration Architecture Test Suite...");

  // 1. Same-Plan Protection
  {
    const res = calculateProration({
      currentPlanTier: "growth",
      targetPlanTier: "growth",
      periodStartIso: "2026-03-01T00:00:00.000Z",
      periodEndIso: "2026-03-31T00:00:00.000Z",
      effectiveIso: "2026-03-15T00:00:00.000Z",
    });
    assert.equal(res.isSamePlan, true);
    assert.equal(res.isUpgrade, false);
    assert.equal(res.isDowngrade, false);
    assert.equal(res.netPayableCents, 0);
    assert.equal(res.unusedCreditCarriedOverCents, 0);
    console.log("✔ Same-plan protection: PASS");
  }

  // 2. Upgrade: ₹2,999 (Starter) → ₹7,999 (Growth) at exact half-cycle (30-day month)
  {
    const res = calculateProration({
      currentPlanTier: "starter", // 299900 paise
      targetPlanTier: "growth",   // 799900 paise
      periodStartIso: "2026-04-01T00:00:00.000Z",
      periodEndIso: "2026-05-01T00:00:00.000Z",
      effectiveIso: "2026-04-16T00:00:00.000Z", // 15 days in, 15 days left (50%)
    });
    assert.equal(res.isUpgrade, true);
    assert.equal(res.isDowngrade, false);
    assert.equal(res.fractionRemaining, 0.5);
    // Unused starter = 149950 paise
    assert.equal(res.unusedCurrentPlanCreditCents, 149950);
    // Prorated growth = 399950 paise
    assert.equal(res.proratedTargetChargeCents, 399950);
    // Net difference = 399950 - 149950 = 250000 paise (₹2,500.00)
    assert.equal(res.netPayableCents, 250000);
    assert.equal(res.unusedCreditCarriedOverCents, 0);
    // GST 18% inclusive on ₹2500: Base ₹2118.64 + GST ₹381.36 = ₹2500.00
    assert.equal(res.priceBreakdown.totalCents, 250000);
    assert.equal(res.priceBreakdown.taxableValueCents + res.priceBreakdown.gstCents, 250000);
    console.log("✔ Upgrade ₹2,999 → ₹7,999 at half-cycle (30-day month): PASS");
  }

  // 3. Upgrade: ₹7,999 (Growth) → ₹15,999 (Business) at 1 day remaining (31-day month)
  {
    const res = calculateProration({
      currentPlanTier: "growth",   // 799900 paise
      targetPlanTier: "business", // 1599900 paise
      periodStartIso: "2026-07-01T00:00:00.000Z",
      periodEndIso: "2026-08-01T00:00:00.000Z", // 31 days
      effectiveIso: "2026-07-31T00:00:00.000Z", // 1 day left
    });
    assert.equal(res.isUpgrade, true);
    const expectedFraction = 1 / 31;
    assert.ok(Math.abs(res.fractionRemaining - expectedFraction) < 1e-6);
    const expectedUnusedCredit = Math.round(799900 * (1 / 31)); // 25803 paise
    const expectedTargetCharge = Math.round(1599900 * (1 / 31)); // 51610 paise
    assert.equal(res.unusedCurrentPlanCreditCents, expectedUnusedCredit);
    assert.equal(res.proratedTargetChargeCents, expectedTargetCharge);
    assert.equal(res.netPayableCents, expectedTargetCharge - expectedUnusedCredit);
    console.log("✔ Upgrade ₹7,999 → ₹15,999 at 1 day remaining (31-day month): PASS");
  }

  // 4. Upgrade: 2 days remaining in 30-day month
  {
    const res = calculateProration({
      currentPlanTier: "starter",
      targetPlanTier: "growth",
      periodStartIso: "2026-06-01T00:00:00.000Z",
      periodEndIso: "2026-07-01T00:00:00.000Z",
      effectiveIso: "2026-06-29T00:00:00.000Z", // 2 days left
    });
    assert.ok(Math.abs(res.fractionRemaining - (2 / 30)) < 1e-6);
    assert.ok(res.netPayableCents > 0);
    console.log("✔ Upgrade with 2 days remaining: PASS");
  }

  // 5. Upgrade: First day of billing cycle (100% remaining)
  {
    const res = calculateProration({
      currentPlanTier: "starter",
      targetPlanTier: "growth",
      periodStartIso: "2026-05-01T00:00:00.000Z",
      periodEndIso: "2026-06-01T00:00:00.000Z",
      effectiveIso: "2026-05-01T00:00:00.000Z", // Day 1
    });
    assert.equal(res.fractionRemaining, 1.0);
    assert.equal(res.unusedCurrentPlanCreditCents, 299900);
    assert.equal(res.proratedTargetChargeCents, 799900);
    assert.equal(res.netPayableCents, 500000); // Exactly ₹5,000 difference
    console.log("✔ Upgrade on Day 1 of billing cycle (100% remaining): PASS");
  }

  // 6. Upgrade: Last second of billing cycle (0% remaining)
  {
    const res = calculateProration({
      currentPlanTier: "starter",
      targetPlanTier: "growth",
      periodStartIso: "2026-05-01T00:00:00.000Z",
      periodEndIso: "2026-06-01T00:00:00.000Z",
      effectiveIso: "2026-06-01T00:00:00.000Z", // End
    });
    assert.equal(res.remainingDurationSeconds, 0);
    assert.equal(res.netPayableCents, 0);
    console.log("✔ Upgrade at cycle end (0% remaining): PASS");
  }

  // 7. Leap Year February (2028 is a leap year: 29 days)
  {
    const res = calculateProration({
      currentPlanTier: "starter",
      targetPlanTier: "growth",
      periodStartIso: "2028-02-01T00:00:00.000Z",
      periodEndIso: "2028-03-01T00:00:00.000Z", // 29 days
      effectiveIso: "2028-02-15T12:00:00.000Z", // exactly 14.5 days
    });
    assert.equal(res.totalDurationSeconds, 29 * 86400);
    assert.equal(res.fractionRemaining, 0.5);
    assert.equal(res.netPayableCents, 250000);
    console.log("✔ Leap Year February (29 days duration): PASS");
  }

  // 8. Standard Non-Leap February (2027: 28 days)
  {
    const res = calculateProration({
      currentPlanTier: "starter",
      targetPlanTier: "growth",
      periodStartIso: "2027-02-01T00:00:00.000Z",
      periodEndIso: "2027-03-01T00:00:00.000Z", // 28 days
      effectiveIso: "2027-02-15T00:00:00.000Z", // exactly 14 days left
    });
    assert.equal(res.totalDurationSeconds, 28 * 86400);
    assert.equal(res.fractionRemaining, 0.5);
    assert.equal(res.netPayableCents, 250000);
    console.log("✔ Standard Non-Leap February (28 days duration): PASS");
  }

  // 9. Downgrade: Business (₹15,999) → Growth (₹7,999) generates carried credit
  {
    const res = calculateProration({
      currentPlanTier: "business",
      targetPlanTier: "growth",
      periodStartIso: "2026-09-01T00:00:00.000Z",
      periodEndIso: "2026-10-01T00:00:00.000Z", // 30 days
      effectiveIso: "2026-09-16T00:00:00.000Z", // 50% left
    });
    assert.equal(res.isDowngrade, true);
    assert.equal(res.isUpgrade, false);
    assert.equal(res.netPayableCents, 0);
    // Unused business = 799950, prorated growth = 399950
    // Credit carried over = 799950 - 399950 = 400000 paise (₹4,000)
    assert.equal(res.unusedCreditCarriedOverCents, 400000);
    console.log("✔ Downgrade credit computation: PASS");
  }

  // 10. Timezone Boundary Safety (Zoned wall time vs UTC instant)
  {
    const res = calculateProration({
      currentPlanTier: "starter",
      targetPlanTier: "growth",
      periodStartIso: "2026-04-01T00:00:00.000+05:30",
      periodEndIso: "2026-05-01T00:00:00.000+05:30",
      effectiveIso: "2026-04-16T00:00:00.000+05:30",
    });
    assert.equal(res.fractionRemaining, 0.5);
    assert.equal(res.netPayableCents, 250000);
    console.log("✔ Timezone offset ISO parsing: PASS");
  }

  // 11. Error handling on inverted or invalid dates
  {
    assert.throws(() => {
      calculateProration({
        currentPlanTier: "starter",
        targetPlanTier: "growth",
        periodStartIso: "2026-05-01T00:00:00.000Z",
        periodEndIso: "2026-04-01T00:00:00.000Z", // Inverted
      });
    }, /Billing period end date must be strictly after period start date/);

    assert.throws(() => {
      calculateProration({
        currentPlanTier: "starter",
        targetPlanTier: "growth",
        periodStartIso: "invalid-date",
        periodEndIso: "2026-05-01T00:00:00.000Z",
      });
    }, /Invalid billing period dates/);
    console.log("✔ Input validation & error boundaries: PASS");
  }

  console.log("=========================================");
  console.log("ALL PRORATION UNIT TESTS PASSED (11/11) ✔");
  console.log("=========================================");
}

runTests();
