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

export function attemptIdentityKey(requestId: string, attemptNumber: number): string {
  return `${requestId}::${attemptNumber}`;
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

type LegacySpendRow = {
  costUsd: number;
  requestId: string | null;
  attemptNumber: number | null;
  createdAt: string | null;
};

type NewSpendRow = {
  costUsd: number;
  requestId: string | null;
  attemptNumber: number;
  createdAt: string | null;
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
    this.cutoverAt = opts?.cutoverAt ?? process.env.AI_USAGE_LEDGER_CUTOVER_AT ?? DEFAULT_AI_USAGE_CUTOVER_AT;
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
   * legacy provider_usage_events BEFORE cutover
   * + ai_execution_usage at/after cutover
   * + orphan post-cutover legacy attempts not present in the new ledger
   * with attempt-level (requestId + attemptNumber) dedupe — never requestId alone.
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
      const postCutover = primary.rows.filter((r) => (r.createdAt ?? "") >= cutover);
      return {
        ok: true,
        spentUsd: roundUsd(postCutover.reduce((s, r) => s + r.costUsd, 0)),
        source: "ai_execution_usage",
      };
    }
    if (!primary.ok && legacy.ok) {
      return { ok: true, spentUsd: legacy.sumUsd, source: "provider_usage_events" };
    }

    const primaryOk = primary as { ok: true; rows: NewSpendRow[] };
    const legacyOk = legacy as { ok: true; rows: LegacySpendRow[] };

    const newRows = primaryOk.rows.filter((r) => (r.createdAt ?? "") >= cutover);
    const seenAttempts = new Set<string>();
    let newUsd = 0;
    for (const row of newRows) {
      newUsd += row.costUsd;
      if (row.requestId) {
        seenAttempts.add(attemptIdentityKey(row.requestId, row.attemptNumber));
      }
    }

    let legacyUsd = 0;
    for (const row of legacyOk.rows) {
      const createdAt = row.createdAt ?? "";
      const beforeCutover = createdAt < cutover;
      const attemptKey =
        row.requestId != null
          ? attemptIdentityKey(row.requestId, row.attemptNumber ?? 1)
          : null;

      if (attemptKey && seenAttempts.has(attemptKey)) {
        continue; // exact dual-write / retry — count once from new ledger
      }

      if (beforeCutover) {
        legacyUsd += row.costUsd;
        continue;
      }

      // Post-cutover legacy: only count identifiable orphan attempts.
      // Rows without request identity must not silently double-count with new ledger.
      if (attemptKey) {
        legacyUsd += row.costUsd;
      }
    }

    return {
      ok: true,
      spentUsd: roundUsd(newUsd + legacyUsd),
      source: "combined",
    };
  }

  private async queryNewLedger(
    tenantId: string,
    monthStart: string,
  ): Promise<
    | { ok: true; rows: NewSpendRow[]; unavailable?: false }
    | { ok: false; unavailable: boolean; rows?: never }
  > {
    const select = this.client.from("ai_execution_usage").select;
    if (typeof select !== "function") return { ok: false, unavailable: true };
    try {
      const chain = select.call(
        this.client.from("ai_execution_usage"),
        "estimated_cost_usd,request_id,attempt_number,success,created_at",
      ) as {
        eq: (c: string, v: string) => {
          gte: (c: string, v: string) => PromiseLike<{
            data: Array<{
              estimated_cost_usd?: number | string;
              request_id?: string | null;
              attempt_number?: number | string | null;
              success?: boolean;
              created_at?: string;
            }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
      const { data, error } = await chain.eq("tenant_id", tenantId).gte("created_at", monthStart);
      if (error) return { ok: false, unavailable: isMissingRelation(error.message ?? "") };
      const rows = (data ?? [])
        .filter((r) => r.success !== false)
        .map((r) => ({
          costUsd: Number(r.estimated_cost_usd ?? 0),
          requestId: typeof r.request_id === "string" ? r.request_id : null,
          attemptNumber: Number(r.attempt_number ?? 1),
          createdAt: r.created_at ?? null,
        }));
      return { ok: true, rows };
    } catch (err) {
      return { ok: false, unavailable: isMissingRelation(err instanceof Error ? err.message : "") };
    }
  }

  private async queryLegacyLedger(
    tenantId: string,
    monthStart: string,
  ): Promise<
    | { ok: true; sumUsd: number; rows: LegacySpendRow[]; unavailable?: false }
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
              metadata?: { requestId?: string; attemptNumber?: number | string } | null;
              created_at?: string;
            }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
      const { data, error } = await chain.eq("tenant_id", tenantId).gte("created_at", monthStart);
      if (error) return { ok: false, unavailable: isMissingRelation(error.message ?? "") };
      const rows: LegacySpendRow[] = (data ?? []).map((r) => {
        const meta = r.metadata ?? null;
        const attemptRaw = meta?.attemptNumber;
        return {
          costUsd: Number(r.cost_cents ?? 0) / 100,
          requestId: typeof meta?.requestId === "string" ? meta.requestId : null,
          attemptNumber:
            attemptRaw == null || attemptRaw === ""
              ? null
              : Number(attemptRaw),
          createdAt: r.created_at ?? null,
        };
      });
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
