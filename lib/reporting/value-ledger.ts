export interface ValueLedgerEntry {
  id?: string;
  tenantId: string;
  cycleMonth: string; // 'YYYY-MM'
  planId?: string;
  serviceKey: string;
  missionId?: string;
  deliverableTitle: string;
  deliverableSummary: string;
  artifactRef?: string;
  resultMetric?: string;
  resultValue?: string;
  customerVisible?: boolean;
  createdAt?: string;
}

export interface MonthlyValueReport {
  tenantId: string;
  cycleMonth: string;
  totalDeliverablesCompleted: number;
  servicesDelivered: Array<{
    serviceKey: string;
    deliverablesCount: number;
    highlights: string[];
  }>;
  keyOutcomes: string[];
  metricsAchieved: Array<{ metric: string; value: string }>;
  executiveSummary: string;
}

/**
 * Value Ledger Service.
 * Records immutable deliverables and outcome receipts, and aggregates monthly proof-of-value.
 */
export class ValueLedgerService {
  private inMemoryStore: ValueLedgerEntry[] = [];

  /**
   * Records a deliverable or execution receipt into the Value Ledger.
   */
  async recordDeliverable(entry: ValueLedgerEntry): Promise<ValueLedgerEntry> {
    const record: ValueLedgerEntry = {
      ...entry,
      id: entry.id ?? `val-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      customerVisible: entry.customerVisible ?? true,
      createdAt: entry.createdAt ?? new Date().toISOString(),
    };
    this.inMemoryStore.push(record);
    return record;
  }

  /**
   * Retrieves all entries for a tenant within a specific cycle month.
   */
  async listEntriesForMonth(
    tenantId: string,
    cycleMonth: string,
  ): Promise<ValueLedgerEntry[]> {
    return this.inMemoryStore.filter(
      (e) => e.tenantId === tenantId && e.cycleMonth === cycleMonth,
    );
  }

  /**
   * Compiles the full 26th Monthly Work & Value Report.
   */
  async generateMonthlyValueReport(
    tenantId: string,
    cycleMonth: string,
    businessName = "Your Business",
  ): Promise<MonthlyValueReport> {
    const entries = await this.listEntriesForMonth(tenantId, cycleMonth);
    const visibleEntries = entries.filter((e) => e.customerVisible !== false);

    const serviceMap = new Map<string, { count: number; highlights: string[] }>();
    const metrics: Array<{ metric: string; value: string }> = [];

    for (const entry of visibleEntries) {
      const current = serviceMap.get(entry.serviceKey) ?? { count: 0, highlights: [] };
      current.count++;
      if (current.highlights.length < 3) {
        current.highlights.push(entry.deliverableTitle);
      }
      serviceMap.set(entry.serviceKey, current);

      if (entry.resultMetric && entry.resultValue) {
        metrics.push({ metric: entry.resultMetric, value: entry.resultValue });
      }
    }

    const servicesDelivered = [...serviceMap.entries()].map(([serviceKey, data]) => ({
      serviceKey,
      deliverablesCount: data.count,
      highlights: data.highlights,
    }));

    const keyOutcomes = visibleEntries
      .slice(0, 5)
      .map((e) => `${e.deliverableTitle}: ${e.deliverableSummary}`);

    const summary =
      visibleEntries.length > 0
        ? `In ${cycleMonth}, StratXcel autonomously executed ${visibleEntries.length} growth actions across ${servicesDelivered.length} key growth areas for ${businessName}.`
        : `In ${cycleMonth}, StratXcel foundation setup and initial discovery was prepared for ${businessName}.`;

    return {
      tenantId,
      cycleMonth,
      totalDeliverablesCompleted: visibleEntries.length,
      servicesDelivered,
      keyOutcomes,
      metricsAchieved: metrics,
      executiveSummary: summary,
    };
  }
}

export const valueLedgerService = new ValueLedgerService();
