/**
 * Pure revenue calculation engine adhering to strict financial truth.
 * Rules:
 * - Revenue = ACTUAL MONEY RECEIVED (captured/settled payments only).
 * - Free coupons / promo codes (₹0 paid) = ₹0 revenue (tracked separately as free/promo value).
 * - Generated/unused codes = ₹0 revenue.
 * - Pending/cancelled/expired payments = ₹0 revenue (pending tracked separately).
 * - Refunds are subtracted from Net Revenue.
 */

export interface PaymentLinkRecord {
  amount_cents: number | string | null;
  status: string;
  created_at: string;
  description?: string | null;
  customer_name?: string | null;
  currency?: string | null;
}

export interface PromoRedemptionRecord {
  list_price_cents?: number | string | null;
  discount_cents?: number | string | null;
  amount_due_cents?: number | string | null;
  redeemed_at?: string;
}

export interface RefundRecord {
  amount_cents: number | string | null;
  created_at?: string;
  status?: string | null;
}

export interface CalculateRevenueInput {
  paymentLinks: PaymentLinkRecord[];
  promoRedemptions?: PromoRedemptionRecord[];
  refunds?: RefundRecord[];
  now?: Date;
}

export interface RevenueBreakdown {
  grossInr: number;
  todayInr: number;
  weekInr: number;
  monthInr: number;
  refundsInr: number;
  netInr: number;
  pendingInr: number;
  freePromoValueInr: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  freePromoRedemptionsCount: number;
  averageOrderValueInr: number;
}

export function calculateTruthfulRevenue(input: CalculateRevenueInput): RevenueBreakdown {
  const now = input.now ?? new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let grossPaidCents = 0;
  let todayRevenueCents = 0;
  let weekRevenueCents = 0;
  let monthRevenueCents = 0;
  let pendingRevenueCents = 0;
  let successfulPaymentsCount = 0;
  let failedPaymentsCount = 0;
  let pendingPaymentsCount = 0;

  for (const pl of input.paymentLinks) {
    const rawAmt = Number(pl.amount_cents) || 0;
    const status = (pl.status ?? "").toLowerCase().trim();

    if (status === "paid") {
      if (rawAmt > 0) {
        grossPaidCents += rawAmt;
        successfulPaymentsCount++;
        const createdAt = pl.created_at || now.toISOString();
        if (createdAt >= todayStart) todayRevenueCents += rawAmt;
        if (createdAt >= weekStart) weekRevenueCents += rawAmt;
        if (createdAt >= monthStart) monthRevenueCents += rawAmt;
      }
    } else if (status === "created" || status === "partially_paid") {
      pendingRevenueCents += rawAmt;
      pendingPaymentsCount++;
    } else if (status === "cancelled" || status === "expired" || status === "failed") {
      failedPaymentsCount++;
    }
  }

  // Refunds
  let refundCents = 0;
  for (const r of input.refunds ?? []) {
    const status = (r.status ?? "PROCESSED").toUpperCase().trim();
    if (status === "PROCESSED" || status === "SETTLED" || status === "SUCCESS" || status === "") {
      refundCents += Number(r.amount_cents) || 0;
    }
  }

  // Free / Promo Redemptions (Discounts = Value given away at ₹0 actual revenue)
  let freePromoValueCents = 0;
  let freePromoRedemptionsCount = 0;
  for (const pr of input.promoRedemptions ?? []) {
    const amountDue = Number(pr.amount_due_cents) || 0;
    const discount = Number(pr.discount_cents) || Number(pr.list_price_cents) || 0;
    if (amountDue === 0 && discount > 0) {
      freePromoValueCents += discount;
      freePromoRedemptionsCount++;
    }
  }

  const grossRevenueInr = grossPaidCents / 100;
  const refundsInr = refundCents / 100;
  const netReceivedInr = Math.max(0, (grossPaidCents - refundCents) / 100);
  const averageOrderValueInr = successfulPaymentsCount > 0 ? grossRevenueInr / successfulPaymentsCount : 0;

  return {
    grossInr: Math.round(grossRevenueInr * 100) / 100,
    todayInr: Math.round((todayRevenueCents / 100) * 100) / 100,
    weekInr: Math.round((weekRevenueCents / 100) * 100) / 100,
    monthInr: Math.round((monthRevenueCents / 100) * 100) / 100,
    refundsInr: Math.round(refundsInr * 100) / 100,
    netInr: Math.round(netReceivedInr * 100) / 100,
    pendingInr: Math.round((pendingRevenueCents / 100) * 100) / 100,
    freePromoValueInr: Math.round((freePromoValueCents / 100) * 100) / 100,
    successfulPayments: successfulPaymentsCount,
    failedPayments: failedPaymentsCount,
    pendingPayments: pendingPaymentsCount,
    freePromoRedemptionsCount,
    averageOrderValueInr: Math.round(averageOrderValueInr * 100) / 100,
  };
}
