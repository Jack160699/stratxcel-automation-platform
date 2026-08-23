import { getTenantServiceContext, requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { calculateTruthfulRevenue, type PaymentLinkRecord, type PromoRedemptionRecord, type RefundRecord } from "@/lib/finance/revenue-truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProviderCostSummary {
  provider: string;
  requests: number;
  tokens: number;
  costInr: number;
  percentShare: number;
}

export interface ServiceCostSummary {
  service: string;
  requests: number;
  costInr: number;
  percentShare: number;
}

export interface ProductRevenueSummary {
  product: string;
  salesCount: number;
  revenueInr: number;
  percentShare: number;
  isComplimentary?: boolean;
}

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) {
    return Response.json({ error: "tenantId query param is required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin", "finance_reviewer"]);
  if (!staffAuth.ok) {
    return Response.json({ error: staffAuth.error }, { status: staffAuth.status });
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 1. Fetch Real Payment Records & Evidence
  const [linksRes, promoRes, refundsRes, refundRecordsRes, aiAttemptsRes] = await Promise.all([
    serviceDb
      .from("payment_links")
      .select("amount_cents, status, created_at, description, customer_name, currency, metadata")
      .order("created_at", { ascending: false }),
    serviceDb
      .from("promo_redemptions")
      .select("list_price_cents, discount_cents, amount_due_cents, redeemed_at, payment_purpose")
      .order("redeemed_at", { ascending: false }),
    serviceDb
      .from("payment_refunds")
      .select("amount_cents, created_at, status")
      .order("created_at", { ascending: false }),
    serviceDb
      .from("payment_refund_records")
      .select("amount_cents, created_at")
      .order("created_at", { ascending: false }),
    serviceDb
      .from("ai_execution_attempts")
      .select("provider, model, estimated_cost_usd, input_tokens, output_tokens, success, created_at, department, task_class")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const paymentLinks: PaymentLinkRecord[] = (linksRes.data ?? []) as PaymentLinkRecord[];
  const promoRedemptions: PromoRedemptionRecord[] = (promoRes.data ?? []) as PromoRedemptionRecord[];
  
  // Combine refunds from payment_refunds and legacy payment_refund_records without duplication
  const refunds: RefundRecord[] = [
    ...((refundsRes.data ?? []) as RefundRecord[]),
    ...((refundRecordsRes.data ?? []) as RefundRecord[]),
  ];
  const aiAttempts = aiAttemptsRes.data ?? [];

  // Calculate Truthful Revenue
  const rev = calculateTruthfulRevenue({
    paymentLinks,
    promoRedemptions,
    refunds,
    now,
  });

  // 2. AI Operator Costs Analysis (USD to INR conversion ~84.5)
  const USD_TO_INR = 84.5;
  let totalAiCostUsd = 0;
  let todayAiCostUsd = 0;
  let monthAiCostUsd = 0;
  let totalTokens = 0;

  const providerMap: Record<string, { requests: number; tokens: number; costUsd: number }> = {};
  const serviceMap: Record<string, { requests: number; costUsd: number }> = {};

  for (const att of aiAttempts) {
    const cost = Number(att.estimated_cost_usd) || 0;
    const tokens = (Number(att.input_tokens) || 0) + (Number(att.output_tokens) || 0);
    totalAiCostUsd += cost;
    totalTokens += tokens;

    if (att.created_at >= todayStart) todayAiCostUsd += cost;
    if (att.created_at >= monthStart) monthAiCostUsd += cost;

    const providerKey = (att.provider || "openai").toLowerCase();
    const providerEntry = providerMap[providerKey] ?? { requests: 0, tokens: 0, costUsd: 0 };
    providerEntry.requests++;
    providerEntry.tokens += tokens;
    providerEntry.costUsd += cost;
    providerMap[providerKey] = providerEntry;

    const serviceKey = att.department || att.task_class || "General Automation";
    const serviceEntry = serviceMap[serviceKey] ?? { requests: 0, costUsd: 0 };
    serviceEntry.requests++;
    serviceEntry.costUsd += cost;
    serviceMap[serviceKey] = serviceEntry;
  }

  // Ensure default providers are represented
  if (Object.keys(providerMap).length === 0) {
    providerMap["openai"] = { requests: 0, tokens: 0, costUsd: 0 };
    providerMap["gemini"] = { requests: 0, tokens: 0, costUsd: 0 };
  }

  const totalAiCostInr = totalAiCostUsd * USD_TO_INR;
  const todayAiCostInr = todayAiCostUsd * USD_TO_INR;
  const monthAiCostInr = monthAiCostUsd * USD_TO_INR;

  const providers: ProviderCostSummary[] = Object.entries(providerMap).map(([p, data]) => {
    const costInr = data.costUsd * USD_TO_INR;
    return {
      provider: p.toUpperCase(),
      requests: data.requests,
      tokens: data.tokens,
      costInr: Math.round(costInr * 100) / 100,
      percentShare: totalAiCostInr > 0 ? Math.round((costInr / totalAiCostInr) * 100) : 0,
    };
  });

  const services: ServiceCostSummary[] = Object.entries(serviceMap).map(([s, data]) => {
    const costInr = data.costUsd * USD_TO_INR;
    return {
      service: s,
      requests: data.requests,
      costInr: Math.round(costInr * 100) / 100,
      percentShare: totalAiCostInr > 0 ? Math.round((costInr / totalAiCostInr) * 100) : 0,
    };
  });

  // Product Revenue Breakdown from ACTUAL PAID LINKS
  let paidAuditCount = 0;
  let paidAuditRevenueCents = 0;
  let paidSubCount = 0;
  let paidSubRevenueCents = 0;
  let paidOtherCount = 0;
  let paidOtherRevenueCents = 0;

  for (const pl of paymentLinks) {
    if (pl.status === "paid") {
      const amt = Number(pl.amount_cents) || 0;
      if (amt <= 0) continue;
      const desc = (pl.description ?? "").toLowerCase();
      if (desc.includes("audit") || desc.includes("growth audit")) {
        paidAuditCount++;
        paidAuditRevenueCents += amt;
      } else if (desc.includes("plan") || desc.includes("subscription") || desc.includes("launch") || desc.includes("growth")) {
        paidSubCount++;
        paidSubRevenueCents += amt;
      } else {
        paidOtherCount++;
        paidOtherRevenueCents += amt;
      }
    }
  }

  const products: ProductRevenueSummary[] = [
    {
      product: "Growth Operations Plan",
      salesCount: paidSubCount,
      revenueInr: paidSubRevenueCents / 100,
      percentShare: rev.grossInr > 0 ? Math.round(((paidSubRevenueCents / 100) / rev.grossInr) * 100) : 0,
    },
    {
      product: "AI Business Growth Audit (₹999)",
      salesCount: paidAuditCount,
      revenueInr: paidAuditRevenueCents / 100,
      percentShare: rev.grossInr > 0 ? Math.round(((paidAuditRevenueCents / 100) / rev.grossInr) * 100) : 0,
    },
  ];

  if (paidOtherCount > 0) {
    products.push({
      product: "Other Platform Services",
      salesCount: paidOtherCount,
      revenueInr: paidOtherRevenueCents / 100,
      percentShare: rev.grossInr > 0 ? Math.round(((paidOtherRevenueCents / 100) / rev.grossInr) * 100) : 0,
    });
  }

  // Split complimentary/GoFree redemptions by product for the dashboard — never
  // revenue either way (rev.freePromoRedemptionsCount / freePromoValueInr already
  // exclude all of these from grossInr), this is purely a display distinction so
  // "test/trial subscription activations" doesn't get silently folded into the
  // Audit complimentary line.
  const complimentaryAuditCount = promoRedemptions.filter(
    (p) => (p as { payment_purpose?: string }).payment_purpose !== "subscription_payment" && (Number(p.amount_due_cents) || 0) === 0
  ).length;
  const complimentarySubscriptionCount = promoRedemptions.filter(
    (p) => (p as { payment_purpose?: string }).payment_purpose === "subscription_payment" && (Number(p.amount_due_cents) || 0) === 0
  ).length;

  if (complimentaryAuditCount > 0) {
    products.push({
      product: "Complimentary Promo Audits (₹0 Paid)",
      salesCount: complimentaryAuditCount,
      revenueInr: 0,
      percentShare: 0,
      isComplimentary: true,
    });
  }

  if (complimentarySubscriptionCount > 0) {
    products.push({
      product: "GoFree Test/Trial Subscriptions (₹0 Paid)",
      salesCount: complimentarySubscriptionCount,
      revenueInr: 0,
      percentShare: 0,
      isComplimentary: true,
    });
  }

  // 3. Budgets & Margins
  const dailyBudgetInr = 2_500;
  const monthlyBudgetInr = 60_000;
  const remainingMonthlyBudgetInr = Math.max(0, monthlyBudgetInr - monthAiCostInr);
  const budgetUtilizationPercent = Math.min(100, Math.round((monthAiCostInr / monthlyBudgetInr) * 100));

  const budgetStatus: "NORMAL" | "WATCH" | "OVER BUDGET" =
    budgetUtilizationPercent > 100 ? "OVER BUDGET" : budgetUtilizationPercent >= 80 ? "WATCH" : "NORMAL";

  const totalTrackedCostInr = totalAiCostInr + rev.refundsInr;
  const netContributionInr = rev.grossInr - totalTrackedCostInr;
  const marginPercent = rev.grossInr > 0 ? Math.round((netContributionInr / rev.grossInr) * 100) : 0;

  return Response.json({
    revenue: {
      grossInr: rev.grossInr,
      todayInr: rev.todayInr,
      weekInr: rev.weekInr,
      monthInr: rev.monthInr,
      refundsInr: rev.refundsInr,
      netInr: rev.netInr,
      pendingInr: rev.pendingInr,
      freePromoValueInr: rev.freePromoValueInr,
      successfulPayments: rev.successfulPayments,
      failedPayments: rev.failedPayments,
      pendingPayments: rev.pendingPayments,
      freePromoRedemptionsCount: rev.freePromoRedemptionsCount,
      activeSubscriptions: paidSubCount,
      averageOrderValueInr: rev.averageOrderValueInr,
    },
    costs: {
      totalAiSpendInr: Math.round(totalAiCostInr * 100) / 100,
      todayAiSpendInr: Math.round(todayAiCostInr * 100) / 100,
      monthAiSpendInr: Math.round(monthAiCostInr * 100) / 100,
      totalRequests: aiAttempts.length,
      totalTokens,
      providers,
      services,
    },
    netPosition: {
      grossRevenueInr: rev.grossInr,
      totalCostInr: Math.round(totalTrackedCostInr * 100) / 100,
      netContributionInr: Math.round(netContributionInr * 100) / 100,
      marginPercent,
    },
    budget: {
      dailyBudgetInr,
      monthlyBudgetInr,
      monthUsedInr: Math.round(monthAiCostInr * 100) / 100,
      remainingInr: Math.round(remainingMonthlyBudgetInr * 100) / 100,
      utilizationPercent: budgetUtilizationPercent,
      status: budgetStatus,
    },
    products,
    recentPayments: paymentLinks.slice(0, 10).map((pl) => ({
      description: pl.description || "Platform Payment",
      amountInr: (Number(pl.amount_cents) || 0) / 100,
      status: pl.status,
      customer: pl.customer_name || "Customer",
      createdAt: pl.created_at,
    })),
  });
}
