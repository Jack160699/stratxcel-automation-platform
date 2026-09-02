import { createSupabaseServiceClient } from "../supabase/service.ts";

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

interface ValueLedgerRow {
  id: string;
  tenant_id: string;
  cycle_month: string;
  plan_id: string | null;
  service_key: string;
  mission_id: string | null;
  deliverable_title: string;
  deliverable_summary: string;
  artifact_ref: string | null;
  result_metric: string | null;
  result_value: string | null;
  customer_visible: boolean;
  created_at: string;
}

function rowToEntry(row: ValueLedgerRow): ValueLedgerEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    cycleMonth: row.cycle_month,
    planId: row.plan_id ?? undefined,
    serviceKey: row.service_key,
    missionId: row.mission_id ?? undefined,
    deliverableTitle: row.deliverable_title,
    deliverableSummary: row.deliverable_summary,
    artifactRef: row.artifact_ref ?? undefined,
    resultMetric: row.result_metric ?? undefined,
    resultValue: row.result_value ?? undefined,
    customerVisible: row.customer_visible,
    createdAt: row.created_at,
  };
}

/**
 * Value Ledger Service.
 * Records immutable deliverables and outcome receipts, and aggregates monthly proof-of-value.
 *
 * Real, Postgres-backed persistence (value_ledger_entries table) -- this
 * class originally stored everything in a private in-memory array, the
 * same anti-pattern already fixed elsewhere this session
 * (website_intelligence_cache, Update 53: "never in-memory -- would not
 * survive serverless invocations"). Found unwired and in-memory during the
 * final rescan (Update 60); fixed here rather than left open, since fixing
 * it is a narrow, safe, same-session change -- every method here was
 * already declared async (the in-memory version just never needed to
 * await anything), so no caller anywhere needs to change at all.
 *
 * The real Supabase client is resolved LAZILY (inside each method, never at
 * construction or module-load time -- the specific, hard-learned lesson
 * from Update 36, where an eagerly-resolved singleton dependency broke the
 * real production build) UNLESS an explicit client is injected via the
 * constructor, which real tests use to stay isolated from any live
 * database (see lib/billing/__tests__/monthly-adaptive-renewal.test.ts,
 * which pre-dates this fix and already relied on constructing its own
 * ValueLedgerService instance -- the same injection point
 * MonthlyRenewalEngine.execute26thMonthlyReport's own `ledger?:
 * ValueLedgerService` override already uses for the same reason).
 *
 * Uses createSupabaseServiceClient (lib/supabase/service.ts) directly,
 * NOT lib/tenants/tenant-context.ts's getTenantServiceContext --
 * tenant-context.ts carries `import "server-only"` and a transitive
 * next/headers import, which fails to even load under plain
 * `node --experimental-strip-types` (confirmed live while building this
 * fix). createSupabaseServiceClient's own header comment documents this
 * exact tradeoff already: deliberately no `server-only`, specifically so
 * it stays importable by this repo's plain-node test files.
 */
export class ValueLedgerService {
  private injectedSupabase: unknown;

  constructor(injectedSupabase?: unknown) {
    this.injectedSupabase = injectedSupabase;
  }

  private supabase() {
    return (this.injectedSupabase ?? createSupabaseServiceClient()) as ReturnType<typeof createSupabaseServiceClient>;
  }

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
    const { error } = await this.supabase()
      .from("value_ledger_entries")
      .insert({
        id: record.id,
        tenant_id: record.tenantId,
        cycle_month: record.cycleMonth,
        plan_id: record.planId ?? null,
        service_key: record.serviceKey,
        mission_id: record.missionId ?? null,
        deliverable_title: record.deliverableTitle,
        deliverable_summary: record.deliverableSummary,
        artifact_ref: record.artifactRef ?? null,
        result_metric: record.resultMetric ?? null,
        result_value: record.resultValue ?? null,
        customer_visible: record.customerVisible,
        created_at: record.createdAt,
      });
    if (error) throw new Error(`VALUE_LEDGER_RECORD_FAILED: ${error.message}`);
    return record;
  }

  /**
   * Retrieves all entries for a tenant within a specific cycle month.
   */
  async listEntriesForMonth(
    tenantId: string,
    cycleMonth: string,
  ): Promise<ValueLedgerEntry[]> {
    const { data, error } = await this.supabase()
      .from("value_ledger_entries")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("cycle_month", cycleMonth)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`VALUE_LEDGER_LIST_FAILED: ${error.message}`);
    return ((data ?? []) as ValueLedgerRow[]).map(rowToEntry);
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
