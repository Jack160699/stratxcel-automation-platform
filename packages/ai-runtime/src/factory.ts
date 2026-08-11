import { GeminiTextProvider } from "./providers/gemini.ts";
import { OpenAITextProvider } from "./providers/openai.ts";
import { ProviderCircuitBreaker } from "./health/circuit-breaker.ts";
import { SupabaseUsageRecorder, type AIUsageRecorder } from "./usage/recorder.ts";
import { AIRuntime, type AIRuntimeDeps } from "./runtime.ts";
import { createBudgetEnvelope } from "./budget/envelope.ts";
import type { AIBudgetEnvelope, PlanTier } from "./types.ts";
import { resolveMonthlyBudgetUsd } from "./policy/task-policies.ts";

export interface TenantAIRuntimeFactoryInput {
  tenantId: string;
  missionId?: string | null;
  sessionId?: string | null;
  /** Active commercial plan for COGS ceiling. */
  plan: PlanTier;
  /** Optional override for custom plans. */
  monthlyBudgetUsd?: number | null;
  spentUsdThisMonth: number;
  supabase?: {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
      select?: (cols: string) => {
        eq: (col: string, val: string) => {
          gte?: (col: string, val: string) => PromiseLike<{ data: Array<{ estimated_cost_usd?: number }> | null; error: unknown }>;
        };
      };
    };
  };
  usageRecorder?: AIUsageRecorder;
  circuitBreaker?: ProviderCircuitBreaker;
  deps?: Partial<AIRuntimeDeps>;
}

const sharedCircuit = new ProviderCircuitBreaker();

export function getSharedCircuitBreaker(): ProviderCircuitBreaker {
  return sharedCircuit;
}

/**
 * Canonical production AI Runtime factory.
 * Attaches usage recorder + shared circuit breaker; resolves budget envelope from plan + spend.
 */
export function createTenantAIRuntime(input: TenantAIRuntimeFactoryInput): {
  runtime: AIRuntime;
  budgetEnvelope: AIBudgetEnvelope;
} {
  if (!input.tenantId || input.tenantId === "social-session") {
    throw new Error("tenant_required_for_billable_ai");
  }

  const budgetEnvelope = createBudgetEnvelope({
    plan: input.plan,
    spentUsdThisMonth: input.spentUsdThisMonth,
    monthlyBudgetUsd: input.monthlyBudgetUsd,
  });

  const usageRecorder =
    input.usageRecorder ??
    (input.supabase ? new SupabaseUsageRecorder(input.supabase) : undefined);

  const runtime = new AIRuntime({
    google: input.deps?.google ?? new GeminiTextProvider(),
    openai: input.deps?.openai ?? new OpenAITextProvider(),
    circuitBreaker: input.circuitBreaker ?? sharedCircuit,
    usageRecorder,
    ...input.deps,
  });

  return { runtime, budgetEnvelope };
}

export async function resolveTenantMonthSpendUsd(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          gte: (col: string, val: string) => PromiseLike<{
            data: Array<{ estimated_cost_usd?: number | string }> | null;
            error: unknown;
          }>;
        };
      };
    };
  },
  tenantId: string,
  now = new Date(),
): Promise<number> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await supabase
    .from("ai_execution_usage")
    .select("estimated_cost_usd")
    .eq("tenant_id", tenantId)
    .gte("created_at", monthStart);
  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
}

export async function resolveTenantPlanTier(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          in: (col: string, vals: string[]) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => {
                maybeSingle: () => PromiseLike<{ data: { plan_tier?: string } | null; error: unknown }>;
              };
            };
          };
        };
      };
    };
  },
  tenantId: string,
): Promise<PlanTier> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_tier")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "authenticated", "pending"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tier = (data?.plan_tier ?? "starter").toLowerCase();
  if (tier === "growth" || tier === "business" || tier === "scale" || tier === "custom") return tier;
  return "starter";
}

export { resolveMonthlyBudgetUsd };
