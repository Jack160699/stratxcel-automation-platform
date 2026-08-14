import { getTenantServiceContext, requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";

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
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 1. Fetch Real Payment Records
  const [linksRes, auditOrdersRes, subsRes, refundsRes, aiAttemptsRes] = await Promise.all([
    serviceDb
      .from("payment_links")
      .select("amount_cents, status, created_at, description, customer_name, currency")
      .order("created_at", { ascending: false }),
    serviceDb
      .from("audit_orders")
      .select("status, created_at, business_name, website_url")
      .order("created_at", { ascending: false }),
    serviceDb
      .from("subscriptions")
      .select("plan_tier, status, price_cents, created_at"),
    serviceDb
      .from("payment_refund_records")
      .select("amount_cents, created_at"),
    serviceDb
      .from("ai_execution_attempts")
      .select("provider, model, estimated_cost_usd, input_tokens, output_tokens, success, created_at, department, task_class")
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const paymentLinks = linksRes.data ?? [];
  const auditOrders = auditOrdersRes.data ?? [];
  const subscriptions = subsRes.data ?? [];
  const refunds = refundsRes.data ?? [];
  const aiAttempts = aiAttemptsRes.data ?? [];

  // Calculate Revenue
  let totalRevenueCents = 0;
  let todayRevenueCents = 0;
  let weekRevenueCents = 0;
  let monthRevenueCents = 0;
  let successfulPaymentsCount = 0;
  let failedPaymentsCount = 0;

  // Paid payment links
  for (const pl of paymentLinks) {
    if (pl.status === "paid") {
      const amt = Number(pl.amount_cents) || 0;
      totalRevenueCents += amt;
      successfulPaymentsCount++;
      if (pl.created_at >= todayStart) todayRevenueCents += amt;
      if (pl.created_at >= weekStart) weekRevenueCents += amt;
      if (pl.created_at >= monthStart) monthRevenueCents += amt;
    } else if (pl.status === "cancelled" || pl.status === "expired") {
      failedPaymentsCount++;
    }
  }

  // Completed/paid audit orders
  let auditSalesCount = 0;
  let auditRevenueCents = 0;
  for (const ao of auditOrders) {
    if (ao.status === "paid" || ao.status === "in_review" || ao.status === "completed") {
      const amt = 99900; // ₹999 in cents
      totalRevenueCents += amt;
      successfulPaymentsCount++;
      auditSalesCount++;
      auditRevenueCents += amt;
      if (ao.created_at >= todayStart) todayRevenueCents += amt;
      if (ao.created_at >= weekStart) weekRevenueCents += amt;
      if (ao.created_at >= monthStart) monthRevenueCents += amt;
    }
  }

  // Active paid subscriptions
  let activeSubsCount = 0;
  let subRevenueCents = 0;
  for (const s of subscriptions) {
    if (s.status === "active" && s.plan_tier !== "free") {
      activeSubsCount++;
      const amt = Number(s.price_cents) || (s.plan_tier === "growth" ? 1499900 : s.plan_tier === "starter" ? 499900 : 0);
      subRevenueCents += amt;
    }
  }

  // Refunds
  let refundCents = 0;
  for (const r of refunds) {
    refundCents += Number(r.amount_cents) || 0;
  }

  const grossRevenueInr = totalRevenueCents / 100;
  const netReceivedInr = (totalRevenueCents - refundCents) / 100;
  const averageOrderValueInr = successfulPaymentsCount > 0 ? grossRevenueInr / successfulPaymentsCount : 0;

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

  // Ensure default providers are represented if real logs are sparse
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

  // Product Revenue Distribution
  const products: ProductRevenueSummary[] = [
    {
      product: "Growth Operations Plan",
      salesCount: activeSubsCount,
      revenueInr: subRevenueCents / 100,
      percentShare: grossRevenueInr > 0 ? Math.round(((subRevenueCents / 100) / grossRevenueInr) * 100) : 0,
    },
    {
      product: "AI Business Growth Audit (₹999)",
      salesCount: auditSalesCount,
      revenueInr: auditRevenueCents / 100,
      percentShare: grossRevenueInr > 0 ? Math.round(((auditRevenueCents / 100) / grossRevenueInr) * 100) : 0,
    },
  ];

  // 3. Budgets & Margins
  const dailyBudgetInr = 2_500;
  const monthlyBudgetInr = 60_000;
  const remainingMonthlyBudgetInr = Math.max(0, monthlyBudgetInr - monthAiCostInr);
  const budgetUtilizationPercent = Math.min(100, Math.round((monthAiCostInr / monthlyBudgetInr) * 100));

  const budgetStatus: "NORMAL" | "WATCH" | "OVER BUDGET" =
    budgetUtilizationPercent > 100 ? "OVER BUDGET" : budgetUtilizationPercent >= 80 ? "WATCH" : "NORMAL";

  const totalTrackedCostInr = totalAiCostInr + (refundCents / 100);
  const netContributionInr = grossRevenueInr - totalTrackedCostInr;
  const marginPercent = grossRevenueInr > 0 ? Math.round((netContributionInr / grossRevenueInr) * 100) : 0;

  return Response.json({
    revenue: {
      grossInr: Math.round(grossRevenueInr * 100) / 100,
      todayInr: Math.round((todayRevenueCents / 100) * 100) / 100,
      weekInr: Math.round((weekRevenueCents / 100) * 100) / 100,
      monthInr: Math.round((monthRevenueCents / 100) * 100) / 100,
      refundsInr: Math.round((refundCents / 100) * 100) / 100,
      netInr: Math.round(netReceivedInr * 100) / 100,
      successfulPayments: successfulPaymentsCount,
      failedPayments: failedPaymentsCount,
      activeSubscriptions: activeSubsCount,
      averageOrderValueInr: Math.round(averageOrderValueInr * 100) / 100,
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
      grossRevenueInr: Math.round(grossRevenueInr * 100) / 100,
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
