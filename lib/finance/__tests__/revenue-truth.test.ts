import assert from "node:assert/strict";
import { calculateTruthfulRevenue } from "../revenue-truth.ts";

function runTests() {
  const fixedNow = new Date("2026-08-15T12:00:00Z");

  // Case A: ₹999 paid -> Revenue = ₹999
  {
    const res = calculateTruthfulRevenue({
      paymentLinks: [
        { amount_cents: 99900, status: "paid", created_at: "2026-08-15T10:00:00Z", description: "Audit Fee" },
      ],
      now: fixedNow,
    });
    assert.equal(res.grossInr, 999, "Case A: Gross revenue must be ₹999");
    assert.equal(res.netInr, 999, "Case A: Net revenue must be ₹999");
    assert.equal(res.successfulPayments, 1, "Case A: 1 successful payment");
    assert.equal(res.freePromoValueInr, 0, "Case A: ₹0 promo value");
  }

  // Case B: ₹999 order + ₹999 coupon + ₹0 payment -> Revenue = ₹0
  {
    const res = calculateTruthfulRevenue({
      paymentLinks: [], // No paid link
      promoRedemptions: [
        { list_price_cents: 99900, discount_cents: 99900, amount_due_cents: 0, redeemed_at: "2026-08-15T10:00:00Z" },
      ],
      now: fixedNow,
    });
    assert.equal(res.grossInr, 0, "Case B: Free coupon must generate ₹0 gross revenue");
    assert.equal(res.netInr, 0, "Case B: Free coupon must generate ₹0 net revenue");
    assert.equal(res.successfulPayments, 0, "Case B: 0 paid payments");
    assert.equal(res.freePromoValueInr, 999, "Case B: Free promo value is ₹999");
    assert.equal(res.freePromoRedemptionsCount, 1, "Case B: 1 promo redemption");
  }

  // Case C: ₹999 order + ₹500 discount + ₹499 captured -> Revenue = ₹499
  {
    const res = calculateTruthfulRevenue({
      paymentLinks: [
        { amount_cents: 49900, status: "paid", created_at: "2026-08-15T10:00:00Z", description: "Discounted Audit Fee" },
      ],
      promoRedemptions: [
        { list_price_cents: 99900, discount_cents: 50000, amount_due_cents: 49900, redeemed_at: "2026-08-15T10:00:00Z" },
      ],
      now: fixedNow,
    });
    assert.equal(res.grossInr, 499, "Case C: Gross revenue must equal captured amount ₹499");
    assert.equal(res.netInr, 499, "Case C: Net revenue must equal ₹499");
    assert.equal(res.successfulPayments, 1, "Case C: 1 successful payment");
  }

  // Case D: ₹999 captured then refunded -> Net Revenue excludes ₹999
  {
    const res = calculateTruthfulRevenue({
      paymentLinks: [
        { amount_cents: 99900, status: "paid", created_at: "2026-08-15T10:00:00Z", description: "Refunded Order" },
      ],
      refunds: [
        { amount_cents: 99900, created_at: "2026-08-15T11:00:00Z", status: "PROCESSED" },
      ],
      now: fixedNow,
    });
    assert.equal(res.grossInr, 999, "Case D: Gross received is ₹999");
    assert.equal(res.refundsInr, 999, "Case D: Refunds is ₹999");
    assert.equal(res.netInr, 0, "Case D: Net revenue excludes refunded amount, so net = ₹0");
  }

  // Case E: Coupon generated but never used -> Revenue = ₹0
  {
    const res = calculateTruthfulRevenue({
      paymentLinks: [],
      promoRedemptions: [], // No redemptions
      now: fixedNow,
    });
    assert.equal(res.grossInr, 0, "Case E: Unused coupon generates ₹0 revenue");
    assert.equal(res.netInr, 0, "Case E: Unused coupon generates ₹0 net revenue");
    assert.equal(res.freePromoValueInr, 0, "Case E: 0 promo value");
  }

  // Case F: Payment pending -> Revenue = ₹0
  {
    const res = calculateTruthfulRevenue({
      paymentLinks: [
        { amount_cents: 99900, status: "created", created_at: "2026-08-15T10:00:00Z", description: "Pending Checkout" },
      ],
      now: fixedNow,
    });
    assert.equal(res.grossInr, 0, "Case F: Pending payment generates ₹0 gross revenue");
    assert.equal(res.netInr, 0, "Case F: Pending payment generates ₹0 net revenue");
    assert.equal(res.pendingInr, 999, "Case F: Pending revenue is ₹999");
    assert.equal(res.pendingPayments, 1, "Case F: 1 pending payment");
  }

  // Case G: Payment failed / expired / cancelled -> Revenue = ₹0
  {
    const res = calculateTruthfulRevenue({
      paymentLinks: [
        { amount_cents: 99900, status: "expired", created_at: "2026-08-15T09:00:00Z", description: "Expired Checkout" },
        { amount_cents: 1499900, status: "cancelled", created_at: "2026-08-15T09:30:00Z", description: "Cancelled Plan" },
      ],
      now: fixedNow,
    });
    assert.equal(res.grossInr, 0, "Case G: Failed/cancelled payments generate ₹0 gross revenue");
    assert.equal(res.netInr, 0, "Case G: Failed/cancelled payments generate ₹0 net revenue");
    assert.equal(res.failedPayments, 2, "Case G: 2 failed payments");
  }

  console.log("revenue-truth.test.ts: ALL PASS (Cases A through G verified)");
}

runTests();
