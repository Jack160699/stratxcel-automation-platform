import { createSupabaseServiceClient } from "../supabase/service.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * STRATXCEL zero-waste image-spend brief Section 7 ("Provider health
 * visibility"): a real, evidence-based signal the existing readiness
 * probe (packages/ai-runtime/src/admin-health.ts) does not provide.
 * `probeGeminiReadiness`/`probeOpenAIReadiness` answer "is the API
 * reachable and configured right now" -- a point-in-time connectivity
 * check. It cannot say "every real attempt over the last day has
 * actually been falling back to the pricier provider" -- exactly the
 * real condition the image-spend cost forensics investigation found
 * (26 of 26 real successful generations this period used the OpenAI
 * fallback; zero successful Gemini image calls were recorded for this
 * tenant across the whole queried window). This reads the real usage
 * ledger directly (the same table the forensics investigation queried),
 * never a live provider call of its own -- checking this costs nothing.
 */
export type ImageProviderHealthStatus = "PRIMARY_HEALTHY" | "PRIMARY_DEGRADED" | "FALLBACK_ACTIVE" | "NO_RECENT_DATA";

export interface ImageProviderHealthReport {
  status: ImageProviderHealthStatus;
  windowHours: number;
  totalCalls: number;
  primarySuccessCount: number;
  fallbackCount: number;
  /** 0-1, or null when there is no real call in the window to compute a rate from. */
  fallbackRate: number | null;
  /**
   * Real, observed ratio of fallback cost/call to primary cost/call within
   * this same window -- null (never fabricated/guessed) unless the window
   * has at least one real successful call on EACH provider to compute it
   * from. Right now, with zero real primary successes recorded, this is
   * honestly null -- reported as such, not invented.
   */
  observedCostMultiplier: number | null;
  message: string;
}

export async function assessImageProviderHealth(
  service: ServiceClient,
  tenantId: string,
  windowHours = 24
): Promise<ImageProviderHealthReport> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await service
    .from("ai_execution_usage")
    .select("provider, fallback_used, success, estimated_cost_usd, media_units")
    .eq("tenant_id", tenantId)
    .eq("task_class", "IMAGE")
    .gte("created_at", windowStart);

  if (error || !data || data.length === 0) {
    return {
      status: "NO_RECENT_DATA",
      windowHours,
      totalCalls: 0,
      primarySuccessCount: 0,
      fallbackCount: 0,
      fallbackRate: null,
      observedCostMultiplier: null,
      message: error
        ? `Image-provider health could not be assessed: usage ledger unreadable (${error.message}).`
        : `No image-generation calls recorded for this tenant in the last ${windowHours}h.`,
    };
  }

  const rows = data as Array<{ provider: string | null; fallback_used: boolean | null; success: boolean | null; estimated_cost_usd: number | string | null; media_units: number | string | null }>;
  const totalCalls = rows.length;
  const primarySuccesses = rows.filter((r) => r.success && !r.fallback_used);
  const fallbackRows = rows.filter((r) => r.success && r.fallback_used);
  const primarySuccessCount = primarySuccesses.length;
  const fallbackCount = fallbackRows.length;
  const fallbackRate = totalCalls > 0 ? fallbackCount / totalCalls : null;

  const perCallCost = (row: { estimated_cost_usd: number | string | null; media_units: number | string | null }) => {
    const cost = Number(row.estimated_cost_usd) || 0;
    const units = Number(row.media_units) || 1;
    return units > 0 ? cost / units : cost;
  };
  let observedCostMultiplier: number | null = null;
  if (primarySuccessCount > 0 && fallbackCount > 0) {
    const avgPrimary = primarySuccesses.reduce((s, r) => s + perCallCost(r), 0) / primarySuccessCount;
    const avgFallback = fallbackRows.reduce((s, r) => s + perCallCost(r), 0) / fallbackCount;
    observedCostMultiplier = avgPrimary > 0 ? avgFallback / avgPrimary : null;
  }

  let status: ImageProviderHealthStatus;
  let message: string;
  if (fallbackRate === 0) {
    status = "PRIMARY_HEALTHY";
    message = `Primary image provider is healthy: all ${totalCalls} real generation(s) in the last ${windowHours}h succeeded on the primary provider.`;
  } else if (fallbackRate === 1) {
    status = "FALLBACK_ACTIVE";
    const costNote = observedCostMultiplier != null
      ? ` The fallback is currently costing ~${observedCostMultiplier.toFixed(1)}x the primary provider's real observed per-image cost.`
      : " Real cost impact cannot be computed this window -- zero primary-provider successes to compare against.";
    message = `Primary image provider unavailable; fallback provider is currently handling 100% of real generation (${fallbackCount} of ${totalCalls} in the last ${windowHours}h), increasing estimated image cost.${costNote}`;
  } else {
    status = "PRIMARY_DEGRADED";
    message = `Primary image provider is degraded: ${fallbackCount} of ${totalCalls} real generations in the last ${windowHours}h fell back to the secondary provider.`;
  }

  return { status, windowHours, totalCalls, primarySuccessCount, fallbackCount, fallbackRate, observedCostMultiplier, message };
}
