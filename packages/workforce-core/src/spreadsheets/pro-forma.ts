/**
 * Pro Forma Financial Spreadsheet Engine
 *
 * Generates dynamic multi-period financial models from company offers and funnel metrics.
 * Produces structured projection models, CSV exports, and workbook files.
 */

export interface ProFormaAssumptions {
  offerName: string;
  unitPriceInr: number;
  monthlyTargetLeads: number;
  qualificationRate?: number; // default 0.25 (25%)
  meetingRate?: number; // default 0.40 (40% of qualified)
  closeRate?: number; // default 0.25 (25% of meetings)
  directCostPercent?: number; // default 0.30 (30% COGS)
  fixedMonthlyCostsInr?: number; // default 50,000 INR
  monthsProjected?: number; // default 12
  monthOverMonthGrowthRate?: number; // default 0.08 (8%)
}

export interface MonthlyProjection {
  month: number;
  monthName: string;
  leadsDiscovered: number;
  leadsQualified: number;
  dealsPitched: number;
  dealsClosed: number;
  grossRevenueInr: number;
  cogsInr: number;
  grossProfitInr: number;
  fixedCostsInr: number;
  netOperatingIncomeInr: number;
  cumulativeRevenueInr: number;
  cumulativeProfitInr: number;
}

export interface ProFormaResult {
  offerName: string;
  assumptions: Required<ProFormaAssumptions>;
  projections: MonthlyProjection[];
  summary: {
    totalLeads: number;
    totalDealsClosed: number;
    totalGrossRevenueInr: number;
    totalGrossProfitInr: number;
    totalNetOperatingIncomeInr: number;
    blendedCloseRatePercent: number;
    averageMonthlyRevenueInr: number;
    profitMarginPercent: number;
  };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * Generate a complete 12-month pro-forma financial projection.
 */
export function generateProFormaModel(assumptions: ProFormaAssumptions): ProFormaResult {
  const fullAssumptions: Required<ProFormaAssumptions> = {
    offerName: assumptions.offerName,
    unitPriceInr: assumptions.unitPriceInr,
    monthlyTargetLeads: assumptions.monthlyTargetLeads,
    qualificationRate: assumptions.qualificationRate ?? 0.25,
    meetingRate: assumptions.meetingRate ?? 0.40,
    closeRate: assumptions.closeRate ?? 0.25,
    directCostPercent: assumptions.directCostPercent ?? 0.30,
    fixedMonthlyCostsInr: assumptions.fixedMonthlyCostsInr ?? 50000,
    monthsProjected: assumptions.monthsProjected ?? 12,
    monthOverMonthGrowthRate: assumptions.monthOverMonthGrowthRate ?? 0.08,
  };

  const projections: MonthlyProjection[] = [];
  let cumRevenue = 0;
  let cumProfit = 0;

  for (let m = 1; m <= fullAssumptions.monthsProjected; m++) {
    const growthFactor = Math.pow(1 + fullAssumptions.monthOverMonthGrowthRate, m - 1);
    const leads = Math.round(fullAssumptions.monthlyTargetLeads * growthFactor);
    const qualified = Math.round(leads * fullAssumptions.qualificationRate);
    const pitched = Math.round(qualified * fullAssumptions.meetingRate);
    const closed = Math.max(1, Math.round(pitched * fullAssumptions.closeRate));

    const grossRev = closed * fullAssumptions.unitPriceInr;
    const cogs = Math.round(grossRev * fullAssumptions.directCostPercent);
    const grossProfit = grossRev - cogs;
    const fixedCosts = fullAssumptions.fixedMonthlyCostsInr;
    const netIncome = grossProfit - fixedCosts;

    cumRevenue += grossRev;
    cumProfit += netIncome;

    const monthIndex = (m - 1) % 12;
    const monthName = `Month ${m} (${MONTH_NAMES[monthIndex]})`;

    projections.push({
      month: m,
      monthName,
      leadsDiscovered: leads,
      leadsQualified: qualified,
      dealsPitched: pitched,
      dealsClosed: closed,
      grossRevenueInr: grossRev,
      cogsInr: cogs,
      grossProfitInr: grossProfit,
      fixedCostsInr: fixedCosts,
      netOperatingIncomeInr: netIncome,
      cumulativeRevenueInr: cumRevenue,
      cumulativeProfitInr: cumProfit,
    });
  }

  const totalLeads = projections.reduce((acc, p) => acc + p.leadsDiscovered, 0);
  const totalDeals = projections.reduce((acc, p) => acc + p.dealsClosed, 0);
  const totalGrossRev = cumRevenue;
  const totalGrossProfit = projections.reduce((acc, p) => acc + p.grossProfitInr, 0);
  const totalNetIncome = cumProfit;

  return {
    offerName: fullAssumptions.offerName,
    assumptions: fullAssumptions,
    projections,
    summary: {
      totalLeads,
      totalDealsClosed: totalDeals,
      totalGrossRevenueInr: totalGrossRev,
      totalGrossProfitInr: totalGrossProfit,
      totalNetOperatingIncomeInr: totalNetIncome,
      blendedCloseRatePercent: totalLeads > 0 ? Number(((totalDeals / totalLeads) * 100).toFixed(2)) : 0,
      averageMonthlyRevenueInr: Math.round(totalGrossRev / fullAssumptions.monthsProjected),
      profitMarginPercent: totalGrossRev > 0 ? Number(((totalNetIncome / totalGrossRev) * 100).toFixed(2)) : 0,
    },
  };
}

/**
 * Format the pro-forma projection as standard CSV.
 */
export function exportProFormaCsv(model: ProFormaResult): string {
  const headers = [
    "Period",
    "Leads Discovered",
    "Leads Qualified",
    "Deals Pitched",
    "Deals Closed",
    "Gross Revenue (INR)",
    "COGS (INR)",
    "Gross Profit (INR)",
    "Fixed Costs (INR)",
    "Net Operating Income (INR)",
    "Cumulative Revenue (INR)",
    "Cumulative Profit (INR)",
  ];

  const rows = model.projections.map((p) => [
    p.monthName,
    p.leadsDiscovered,
    p.leadsQualified,
    p.dealsPitched,
    p.dealsClosed,
    p.grossRevenueInr,
    p.cogsInr,
    p.grossProfitInr,
    p.fixedCostsInr,
    p.netOperatingIncomeInr,
    p.cumulativeRevenueInr,
    p.cumulativeProfitInr,
  ]);

  const summaryRow = [
    "TOTALS",
    model.summary.totalLeads,
    "-",
    "-",
    model.summary.totalDealsClosed,
    model.summary.totalGrossRevenueInr,
    "-",
    model.summary.totalGrossProfitInr,
    "-",
    model.summary.totalNetOperatingIncomeInr,
    model.summary.totalGrossRevenueInr,
    model.summary.totalNetOperatingIncomeInr,
  ];

  const lines = [
    `# Pro Forma Financial Model: ${model.offerName}`,
    `# Unit Price: INR ${model.assumptions.unitPriceInr.toLocaleString("en-IN")}`,
    headers.join(","),
    ...rows.map((r) => r.join(",")),
    summaryRow.join(","),
  ];

  return lines.join("\n");
}
