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
}

/** In-memory recorder for tests — enforces tenant attribution. */
export class InMemoryUsageRecorder implements AIUsageRecorder {
  readonly entries: AIUsageRecord[] = [];

  async record(entry: AIUsageRecord): Promise<void> {
    if (!entry.tenantId) throw new Error("tenant_required");
    this.entries.push({ ...entry });
  }

  async sumSpendUsdForTenantMonth(tenantId: string, monthKey: string): Promise<number> {
    return this.entries
      .filter((e) => e.tenantId === tenantId && e.createdAt.startsWith(monthKey) && e.success)
      .reduce((sum, e) => sum + e.estimatedCostUsd, 0);
  }

  forTenant(tenantId: string): AIUsageRecord[] {
    return this.entries.filter((e) => e.tenantId === tenantId);
  }

  reset(): void {
    this.entries.length = 0;
  }
}

/**
 * Persists to ai_execution_usage (additive migration) when a Supabase-like client is provided.
 * Falls back to provider_usage_events shape via metadata when preferred.
 */
export class SupabaseUsageRecorder implements AIUsageRecorder {
  private readonly client: {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
      select?: (cols: string) => unknown;
    };
  };

  constructor(client: {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
      select?: (cols: string) => unknown;
    };
  }) {
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
    const { error } = await this.client.from("ai_execution_usage").insert(row);
    if (error) {
      // Dual-write to existing BYOK usage ledger for compatibility.
      await this.client.from("provider_usage_events").insert({
        tenant_id: entry.tenantId,
        provider_key: entry.provider ?? "unknown",
        mission_id: entry.missionId,
        capability: `ai.${entry.taskClass}`,
        units: entry.inputTokens + entry.outputTokens,
        cost_cents: costCents,
        metadata: {
          model: entry.model,
          requestId: entry.requestId,
          fallbackUsed: entry.fallbackUsed,
          estimatedCostUsd: entry.estimatedCostUsd,
        },
      });
    }
  }

  async sumSpendUsdForTenantMonth(tenantId: string, monthKey: string): Promise<number> {
    const monthStart = `${monthKey}-01T00:00:00.000Z`;
    const select = this.client.from("ai_execution_usage").select;
    if (typeof select !== "function") return 0;
    const chain = select.call(this.client.from("ai_execution_usage"), "estimated_cost_usd") as {
      eq: (col: string, val: string) => {
        gte: (col: string, val: string) => PromiseLike<{
          data: Array<{ estimated_cost_usd?: number | string }> | null;
          error: unknown;
        }>;
      };
    };
    const { data, error } = await chain.eq("tenant_id", tenantId).gte("created_at", monthStart);
    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
  }
}
