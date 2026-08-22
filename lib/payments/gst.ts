/**
 * GST-inclusive price breakdown for checkout display. Every price in this
 * product (the free audit, and the Starter/Growth/Business subscription
 * plans in packages/payments-and-wallet/src/plans.ts) is quoted GST-inclusive
 * — this only decomposes that total for display; it never adds 18% on top
 * of what the customer is actually charged. The amount charged is always
 * `totalCents`, unchanged, computed nowhere near this function.
 */
export interface GstBreakdown {
  totalCents: number;
  taxableValueCents: number;
  gstCents: number;
  ratePercent: number;
}

const GST_RATE_PERCENT = 18;

/**
 * total = taxable * 1.18, so taxable = total / 1.18. Rounds the taxable
 * value to the nearest paisa and derives GST as the remainder — the two
 * always sum back to exactly `totalCents`, which is the one property that
 * actually matters here (no silent under/over-charge from rounding).
 */
export function splitGstInclusive(totalCents: number): GstBreakdown {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("totalCents must be a positive integer");
  }
  const taxableValueCents = Math.round(totalCents / (1 + GST_RATE_PERCENT / 100));
  const gstCents = totalCents - taxableValueCents;
  return { totalCents, taxableValueCents, gstCents, ratePercent: GST_RATE_PERCENT };
}

export function formatCentsAsRupees(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}
