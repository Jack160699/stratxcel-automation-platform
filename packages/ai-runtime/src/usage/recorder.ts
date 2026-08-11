import type { AIErrorCategory, AIFallbackReason, AIProviderId, AITaskClass } from "../types.ts";

export interface AIUsageRecord {
  tenantId: string;
  missionId: string | null;
  department: string | null;
  specialistRole: string | null;
  taskClass: AITaskClass;
  provider: AIProviderId | null;
  model: string | null;
  attemptNumber: number;
  fallbackUsed: boolean;
  fallbackReason: AIFallbackReason;
  escalationLevel: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  /** Provider call succeeded (billable), even if quality gate later failed. */
  success: boolean;
  errorCategory: AIErrorCategory | null;
  selectionReason: string;
  requestId: string;
  createdAt: string;
  mediaUnits?: number;
}

export interface AIUsageRecorder {
  record(entry: AIUsageRecord): Promise<void>;
  sumSpendUsdForTenantMonth?(tenantId: string, monthKey: string): Promise<number>;
  resolveMonthSpend?(tenantId: string, monthKey: string): Promise<MonthSpendResolution>;
}

export type MonthSpendResolution =
  | { ok: true; spentUsd: number; source: "ai_execution_usage" | "provider_usage_events" | "combined" }
  | { ok: false; spentUsd: null; reason: "ledger_unavailable" | "query_failed" };

/** In-memory recorder for tests — enforces tenant attribution. */
export class InMemoryUsageRecorder implements AIUsageRecorder {
  readonly entries: AIUsageRecord[] = [];

  async record(entry: AIUsageRecord): Promise<void> {
    if (!entry.tenantId) throw new Error("tenant_required");
    this.entries.push({ ...entry });
  }

  async sumSpendUsdForTenantMonth(tenantId: string, monthKey: string): Promise<number> {
    const resolved = await this.resolveMonthSpend(tenantId, monthKey);
    if (!resolved.ok) throw new Error(resolved.reason);
    return resolved.spentUsd;
  }

  async resolveMonthSpend(tenantId: string, monthKey: string): Promise<MonthSpendResolution> {
    const spentUsd = this.entries
      .filter((e) => e.tenantId === tenantId && e.createdAt.startsWith(monthKey) && e.success)
      .reduce((sum, e) => sum + e.estimatedCostUsd, 0);
    return { ok: true, spentUsd, source: "ai_execution_usage" };
  }

  forTenant(tenantId: string): AIUsageRecord[] {
    return this.entries.filter((e) => e.tenantId === tenantId);
  }

  reset(): void {
    this.entries.length = 0;
  }
}

type SupabaseLike = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
    select?: (cols: string) => unknown;
  };
};

/**
 * Persists to ai_execution_usage; falls back to provider_usage_events on write/read.
 * Unavailable ledger must NOT silently report $0.
 */
export class SupabaseUsageRecorder implements AIUsageRecorder {
  private readonly client: SupabaseLike;

  constructor(client: SupabaseLike) {
    this.client = client;
  }

  async record(entry: AIUsageRecord): Promise<void> {
    const costCents = Math.round(entry.estimatedCostUsd * 100);
    const row = {
      tenant_id: entry.tenantId,
      mission_id: entry.missionId,
      department: entry.department,
      specialist_role: entry.specialistRole,
      task_class: entry.taskClass,
      provider: entry.provider,
      model: entry.model,
      attempt_number: entry.attemptNumber,
      fallback_used: entry.fallbackUsed,
      fallback_reason: entry.fallbackReason,
      escalation_level: entry.escalationLevel,
      input_tokens: entry.inputTokens,
      cached_input_tokens: entry.cachedInputTokens,
      output_tokens: entry.outputTokens,
      estimated_cost_usd: entry.estimatedCostUsd,
      latency_ms: entry.latencyMs,
      success: entry.success,
      error_category: entry.errorCategory,
      selection_reason: entry.selectionReason,
      request_id: entry.requestId,
      media_units: entry.mediaUnits ?? 0,
      created_at: entry.createdAt,
    };
    const primary = await this.client.from("ai_execution_usage").insert(row);
    if (!primary.error) return;

    const fallback = await this.client.from("provider_usage_events").insert({
      tenant_id: entry.tenantId,
      provider_key: entry.provider ?? "unknown",
      mission_id: entry.missionId,
      capability: `ai.${entry.taskClass}`,
      units: entry.inputTokens + entry.outputTokens + (entry.mediaUnits ?? 0),
      cost_cents: costCents,
      metadata: {
        model: entry.model,
        requestId: entry.requestId,
        fallbackUsed: entry.fallbackUsed,
        estimatedCostUsd: entry.estimatedCostUsd,
        success: entry.success,
        selectionReason: entry.selectionReason,
        mediaUnits: entry.mediaUnits ?? 0,
      },
      created_at: entry.createdAt,
    });
    if (fallback.error) {
      throw new Error(`usage_ledger_write_failed:${fallback.error.message}`);
    }
  }

  async sumSpendUsdForTenantMonth(tenantId: string, monthKey: string): Promise<number> {
    const resolved = await this.resolveMonthSpend(tenantId, monthKey);
    if (!resolved.ok) throw new Error(resolved.reason);
    return resolved.spentUsd;
  }

  async resolveMonthSpend(tenantId: string, monthKey: string): Promise<MonthSpendResolution> {
    const monthStart = `${monthKey}-01T00:00:00.000Z`;

    const primary = await this.queryEstimatedCostUsd("ai_execution_usage", "estimated_cost_usd", tenantId, monthStart);
    if (primary.ok) {
      return { ok: true, spentUsd: primary.sum, source: "ai_execution_usage" };
    }

    const legacy = await this.queryCostCents("provider_usage_events", tenantId, monthStart);
    if (legacy.ok) {
      return { ok: true, spentUsd: legacy.sumCents / 100, source: "provider_usage_events" };
    }

    if (primary.unavailable && legacy.unavailable) {
      return { ok: false, spentUsd: null, reason: "ledger_unavailable" };
    }
    return { ok: false, spentUsd: null, reason: "query_failed" };
  }

  private async queryEstimatedCostUsd(
    table: string,
    col: string,
    tenantId: string,
    monthStart: string,
  ): Promise<{ ok: true; sum: number } | { ok: false; unavailable: boolean }> {
    const select = this.client.from(table).select;
    if (typeof select !== "function") return { ok: false, unavailable: true };
    try {
      const chain = select.call(this.client.from(table), col) as {
        eq: (c: string, v: string) => {
          gte: (c: string, v: string) => PromiseLike<{
            data: Array<Record<string, unknown>> | null;
            error: { message?: string } | null;
          }>;
        };
      };
      const { data, error } = await chain.eq("tenant_id", tenantId).gte("created_at", monthStart);
      if (error) {
        return { ok: false, unavailable: isMissingRelation(error.message ?? "") };
      }
      const sum = (data ?? []).reduce((s, row) => s + Number(row[col] ?? 0), 0);
      return { ok: true, sum };
    } catch (err) {
      return { ok: false, unavailable: isMissingRelation(err instanceof Error ? err.message : "") };
    }
  }

  private async queryCostCents(
    table: string,
    tenantId: string,
    monthStart: string,
  ): Promise<{ ok: true; sumCents: number } | { ok: false; unavailable: boolean }> {
    const select = this.client.from(table).select;
    if (typeof select !== "function") return { ok: false, unavailable: true };
    try {
      const chain = select.call(this.client.from(table), "cost_cents") as {
        eq: (c: string, v: string) => {
          gte: (c: string, v: string) => PromiseLike<{
            data: Array<{ cost_cents?: number | string }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
      const { data, error } = await chain.eq("tenant_id", tenantId).gte("created_at", monthStart);
      if (error) {
        return { ok: false, unavailable: isMissingRelation(error.message ?? "") };
      }
      const sumCents = (data ?? []).reduce((s, row) => s + Number(row.cost_cents ?? 0), 0);
      return { ok: true, sumCents };
    } catch (err) {
      return { ok: false, unavailable: isMissingRelation(err instanceof Error ? err.message : "") };
    }
  }
}

function isMissingRelation(message: string): boolean {
  return /does not exist|could not find the table|schema cache|undefined table/i.test(message);
}
