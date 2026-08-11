import type { AIErrorCategory, AIFallbackReason, AIProviderId, AITaskClass } from "../types.ts";

export interface AIUsageRecord {
  tenantId: string;
  /** Real missions.id only — never social session UUID. */
  missionId: string | null;
  /** Social/conversational session identity — not a missions FK. */
  sessionId?: string | null;
  correlationId?: string | null;
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
  /** Provider call succeeded (billable), even if quality/storage later failed. */
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
  resolveMonthSpend?(
    tenantId: string,
    monthKey: string,
    opts?: { cutoverAt?: string },
  ): Promise<MonthSpendResolution>;
}

export type MonthSpendResolution =
  | {
      ok: true;
      spentUsd: number;
      source: "ai_execution_usage" | "provider_usage_events" | "combined";
    }
  | { ok: false; spentUsd: null; reason: "ledger_unavailable" | "query_failed" };

function isDuplicateKey(message: string): boolean {
  return /duplicate key|unique constraint|already exists/i.test(message);
}

function isMissingRelation(message: string): boolean {
  return /does not exist|could not find the table|schema cache|undefined table/i.test(message);
}

/** In-memory recorder for tests — enforces tenant attribution + attempt idempotency. */
export class InMemoryUsageRecorder implements AIUsageRecorder {
  readonly entries: AIUsageRecord[] = [];

  async record(entry: AIUsageRecord): Promise<void> {
    if (!entry.tenantId) throw new Error("tenant_required");
    const dup = this.entries.find(
      (e) =>
        e.tenantId === entry.tenantId &&
        e.requestId === entry.requestId &&
        e.attemptNumber === entry.attemptNumber,
    );
    if (dup) return; // idempotent success
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
 * Service-role usage writer for ai_execution_usage.
 * Falls back to provider_usage_events only when the primary table is missing —
 * never on duplicate-key (idempotent success).
 */
export class SupabaseUsageRecorder implements AIUsageRecorder {
  private readonly client: SupabaseLike;
  private readonly cutoverAt: string;

  constructor(
    client: SupabaseLike,
    opts?: { cutoverAt?: string },
  ) {
    this.client = client;
    this.cutoverAt = opts?.cutoverAt ?? process.env.AI_USAGE_LEDGER_CUTOVER_AT ?? "2026-08-11T00:00:00.000Z";
  }

  async record(entry: AIUsageRecord): Promise<void> {
    const costCents = Math.round(entry.estimatedCostUsd * 100);
    const row = {
      tenant_id: entry.tenantId,
      mission_id: entry.missionId,
      session_id: entry.sessionId ?? null,
      correlation_id: entry.correlationId ?? null,
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
    if (isDuplicateKey(primary.error.message)) return; // idempotent success — do NOT dual-write

    if (isMissingRelation(primary.error.message)) {
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
          attemptNumber: entry.attemptNumber,
          sessionId: entry.sessionId ?? null,
          fallbackUsed: entry.fallbackUsed,
          estimatedCostUsd: entry.estimatedCostUsd,
          success: entry.success,
          selectionReason: entry.selectionReason,
          mediaUnits: entry.mediaUnits ?? 0,
        },
        created_at: entry.createdAt,
      });
      if (fallback.error) {
        if (isDuplicateKey(fallback.error.message)) return;
        throw new Error(`usage_ledger_write_failed:${fallback.error.message}`);
      }
      return;
    }

    throw new Error(`usage_ledger_write_failed:${primary.error.message}`);
  }

  async sumSpendUsdForTenantMonth(tenantId: string, monthKey: string): Promise<number> {
    const resolved = await this.resolveMonthSpend(tenantId, monthKey);
    if (!resolved.ok) throw new Error(resolved.reason);
    return resolved.spentUsd;
  }

  /**
   * Cutover-safe month spend:
   * legacy rows (no overlapping requestId) + new ledger rows, without double-counting.
   */
  async resolveMonthSpend(
    tenantId: string,
    monthKey: string,
    opts?: { cutoverAt?: string },
  ): Promise<MonthSpendResolution> {
    const monthStart = `${monthKey}-01T00:00:00.000Z`;
    const cutover = opts?.cutoverAt ?? this.cutoverAt;

    const primary = await this.queryNewLedger(tenantId, monthStart);
    const legacy = await this.queryLegacyLedger(tenantId, monthStart);

    if (!primary.ok && primary.unavailable && !legacy.ok && legacy.unavailable) {
      return { ok: false, spentUsd: null, reason: "ledger_unavailable" };
    }
    if (!primary.ok && !legacy.ok) {
      return { ok: false, spentUsd: null, reason: "query_failed" };
    }

    if (primary.ok && !legacy.ok) {
      return { ok: true, spentUsd: primary.sum, source: "ai_execution_usage" };
    }
    if (!primary.ok && legacy.ok) {
      return { ok: true, spentUsd: legacy.sumUsd, source: "provider_usage_events" };
    }

    // Combined with requestId dedupe.
    const primaryOk = primary as { ok: true; sum: number; requestIds: string[] };
    const legacyOk = legacy as {
      ok: true;
      sumUsd: number;
      rows: Array<{ costUsd: number; requestId: string | null; createdAt: string | null }>;
    };
    const seen = new Set(primaryOk.requestIds);
    let legacyUsd = 0;
    for (const row of legacyOk.rows) {
      if (row.requestId && seen.has(row.requestId)) continue;
      legacyUsd += row.costUsd;
    }
    return {
      ok: true,
      spentUsd: roundUsd(primaryOk.sum + legacyUsd),
      source: "combined",
    };
  }

  private async queryNewLedger(
    tenantId: string,
    monthStart: string,
  ): Promise<
    | { ok: true; sum: number; requestIds: string[]; unavailable?: false }
    | { ok: false; unavailable: boolean; sum?: number; requestIds?: string[] }
  > {
    const select = this.client.from("ai_execution_usage").select;
    if (typeof select !== "function") return { ok: false, unavailable: true };
    try {
      const chain = select.call(
        this.client.from("ai_execution_usage"),
        "estimated_cost_usd,request_id,success",
      ) as {
        eq: (c: string, v: string) => {
          gte: (c: string, v: string) => PromiseLike<{
            data: Array<{
              estimated_cost_usd?: number | string;
              request_id?: string | null;
              success?: boolean;
            }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
      const { data, error } = await chain.eq("tenant_id", tenantId).gte("created_at", monthStart);
      if (error) return { ok: false, unavailable: isMissingRelation(error.message ?? "") };
      const rows = (data ?? []).filter((r) => r.success !== false);
      const sum = rows.reduce((s, row) => s + Number(row.estimated_cost_usd ?? 0), 0);
      const requestIds = rows.map((r) => r.request_id).filter((id): id is string => Boolean(id));
      return { ok: true, sum, requestIds };
    } catch (err) {
      return { ok: false, unavailable: isMissingRelation(err instanceof Error ? err.message : "") };
    }
  }

  private async queryLegacyLedger(
    tenantId: string,
    monthStart: string,
  ): Promise<
    | {
        ok: true;
        sumUsd: number;
        rows: Array<{ costUsd: number; requestId: string | null; createdAt: string | null }>;
        unavailable?: false;
      }
    | { ok: false; unavailable: boolean; sumUsd?: number; rows?: never }
  > {
    const select = this.client.from("provider_usage_events").select;
    if (typeof select !== "function") return { ok: false, unavailable: true };
    try {
      const chain = select.call(
        this.client.from("provider_usage_events"),
        "cost_cents,metadata,created_at",
      ) as {
        eq: (c: string, v: string) => {
          gte: (c: string, v: string) => PromiseLike<{
            data: Array<{
              cost_cents?: number | string;
              metadata?: { requestId?: string } | null;
              created_at?: string;
            }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
      const { data, error } = await chain.eq("tenant_id", tenantId).gte("created_at", monthStart);
      if (error) return { ok: false, unavailable: isMissingRelation(error.message ?? "") };
      const rows = (data ?? []).map((r) => ({
        costUsd: Number(r.cost_cents ?? 0) / 100,
        requestId: typeof r.metadata?.requestId === "string" ? r.metadata.requestId : null,
        createdAt: r.created_at ?? null,
      }));
      const sumUsd = rows.reduce((s, r) => s + r.costUsd, 0);
      return { ok: true, sumUsd, rows };
    } catch (err) {
      return { ok: false, unavailable: isMissingRelation(err instanceof Error ? err.message : "") };
    }
  }
}

function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Default cutover instant for migration-month accounting tests/helpers. */
export const DEFAULT_AI_USAGE_CUTOVER_AT = "2026-08-11T00:00:00.000Z";
