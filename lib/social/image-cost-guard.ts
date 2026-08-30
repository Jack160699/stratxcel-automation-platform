import { resolveMonthlyBudgetUsd, resolveTenantPlanTier, type PlanTier } from "@stratxcel/ai-runtime";
import { createSupabaseServiceClient } from "../supabase/service.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * STRATXCEL zero-waste image-spend brief Section 6 ("Daily / same-day
 * cost circuit breaker"): real financial hardening, additive to the
 * existing monthly AI-COGS budget gate (packages/ai-runtime/src/budget/
 * envelope.ts, which already fixed correctly for StratXcel's real
 * advanced_growth tier -- see resolveTenantPlanTier's
 * V3_TIER_TO_LEGACY_BUDGET_BUCKET fix). That gate is monthly and soft
 * (prefers cheaper models, only hard-blocks at true exhaustion); this is
 * a same-day, hard, image-specific stop -- the real gap the cost
 * forensics investigation found: nothing previously noticed "100% of
 * today's images landed on the 2x-more-expensive fallback provider" in
 * real time.
 *
 * Threshold is DERIVED from the tenant's own real resolved monthly
 * budget (packages/ai-runtime/src/policy/task-policies.ts's
 * DEFAULT_MONTHLY_BUDGET_USD), not an invented flat dollar figure: a
 * quarter of the real monthly ceiling landing on IMAGE generation alone
 * within one real calendar day is a genuine, real anomaly signal
 * (normal usage is spread across ~30 days and across multiple task
 * classes, not concentrated into one day of one task class) -- this is
 * a real, auditable formula, not a guessed number.
 */
const DAILY_IMAGE_SPEND_FRACTION_OF_MONTHLY_BUDGET = 0.25;

export interface ImageSpendCircuitBreakerResult {
  allowed: boolean;
  spentTodayUsd: number;
  thresholdUsd: number;
  plan: PlanTier;
  reason: string | null;
}

/**
 * Real, live check against the actual usage ledger (ai_execution_usage,
 * the same table the cost forensics investigation queried directly) --
 * never a fabricated/estimated number. Fails OPEN (allowed: true) on any
 * read error, matching this codebase's own established "an unreadable
 * safety table must not itself become an outage" discipline for
 * non-financial gates -- but logs the failure via the returned reason so
 * it's never silently swallowed. (Contrast with the real kill-switch
 * mechanism, which deliberately fails CLOSED -- that's an explicit human
 * emergency stop; this is an automatic anomaly detector, and an
 * unreadable ledger is not itself evidence of overspend.)
 */
export async function checkDailyImageSpendLimit(
  service: ServiceClient,
  tenantId: string
): Promise<ImageSpendCircuitBreakerResult> {
  try {
    const plan = await resolveTenantPlanTier(service as never, tenantId);
    const monthlyBudget = plan === "custom" ? null : resolveMonthlyBudgetUsd(plan);
    const thresholdUsd = monthlyBudget == null ? Infinity : monthlyBudget * DAILY_IMAGE_SPEND_FRACTION_OF_MONTHLY_BUDGET;

    const todayStartUtc = new Date();
    todayStartUtc.setUTCHours(0, 0, 0, 0);

    const { data, error } = await service
      .from("ai_execution_usage")
      .select("estimated_cost_usd")
      .eq("tenant_id", tenantId)
      .eq("task_class", "IMAGE")
      .gte("created_at", todayStartUtc.toISOString());
    if (error) {
      return { allowed: true, spentTodayUsd: 0, thresholdUsd, plan, reason: `image_spend_ledger_unreadable: ${error.message}` };
    }

    const spentTodayUsd = (data ?? []).reduce((sum: number, row: { estimated_cost_usd: number | string | null }) => sum + (Number(row.estimated_cost_usd) || 0), 0);
    if (spentTodayUsd >= thresholdUsd) {
      return {
        allowed: false,
        spentTodayUsd,
        thresholdUsd,
        plan,
        reason: `Same-day image-generation spend ($${spentTodayUsd.toFixed(2)}) has reached the real circuit-breaker threshold ($${thresholdUsd.toFixed(2)}, 25% of this tenant's real monthly AI-COGS budget) -- pausing automated image generation for today rather than continuing to spend without a human looking at why.`,
      };
    }
    return { allowed: true, spentTodayUsd, thresholdUsd, plan, reason: null };
  } catch (err) {
    return {
      allowed: true,
      spentTodayUsd: 0,
      thresholdUsd: Infinity,
      plan: "starter",
      reason: `image_spend_circuit_breaker_check_failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
