import { GeminiTextProvider } from "./providers/gemini.ts";
import { OpenAITextProvider } from "./providers/openai.ts";
import { ProviderCircuitBreaker } from "./health/circuit-breaker.ts";
import {
  SupabaseUsageRecorder,
  type AIUsageRecorder,
  type MonthSpendResolution,
} from "./usage/recorder.ts";
import { AIRuntime, type AIRuntimeDeps } from "./runtime.ts";
import { createBudgetEnvelope } from "./budget/envelope.ts";
import type { AIBudgetEnvelope, PlanTier } from "./types.ts";
import { resolveMonthlyBudgetUsd } from "./policy/task-policies.ts";
import {
  SupabaseCanonicalMediaStorage,
  type CanonicalMediaStorage,
  type SupabaseCanonicalMediaClient,
} from "./media/canonical-storage.ts";
import { ImageMediaRuntime } from "./media/image.ts";
import { SupabaseVideoOperationStore, VideoMediaRuntime } from "./media/video.ts";

export interface TenantAIRuntimeFactoryInput {
  tenantId: string;
  missionId?: string | null;
  sessionId?: string | null;
  /** Active commercial plan for COGS ceiling. */
  plan: PlanTier;
  /** Optional override for custom plans. */
  monthlyBudgetUsd?: number | null;
  spentUsdThisMonth: number;
  supabase?: ConstructorParameters<typeof SupabaseUsageRecorder>[0];
  usageRecorder?: AIUsageRecorder;
  circuitBreaker?: ProviderCircuitBreaker;
  deps?: Partial<AIRuntimeDeps>;
}

export interface TenantMediaRuntimeFactoryInput {
  tenantId: string;
  ownerId: string;
  missionId?: string | null;
  plan: PlanTier;
  spentUsdThisMonth: number;
  monthlyBudgetUsd?: number | null;
  supabase: SupabaseCanonicalMediaClient & ConstructorParameters<typeof SupabaseUsageRecorder>[0] & {
    from: (table: string) => {
      upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => PromiseLike<{ error: { message: string } | null }>;
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
          gte?: (col: string, val: string) => PromiseLike<{
            data: Array<{ estimated_cost_usd?: number | string; cost_cents?: number | string }> | null;
            error: unknown;
          }>;
        };
      };
      insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
  usageRecorder?: AIUsageRecorder;
  circuitBreaker?: ProviderCircuitBreaker;
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

/**
 * Production media factory — injects durable video store + canonical media storage + usage ledger.
 */
export function createTenantMediaRuntime(input: TenantMediaRuntimeFactoryInput): {
  images: ImageMediaRuntime;
  video: VideoMediaRuntime;
  storage: CanonicalMediaStorage;
  budgetEnvelope: AIBudgetEnvelope;
  usageRecorder: AIUsageRecorder;
} {
  if (!input.tenantId || input.tenantId === "social-session") {
    throw new Error("tenant_required_for_billable_ai");
  }
  const budgetEnvelope = createBudgetEnvelope({
    plan: input.plan,
    spentUsdThisMonth: input.spentUsdThisMonth,
    monthlyBudgetUsd: input.monthlyBudgetUsd,
  });
  const usageRecorder = input.usageRecorder ?? new SupabaseUsageRecorder(input.supabase);
  const storage = new SupabaseCanonicalMediaStorage({
    client: input.supabase,
    ownerId: input.ownerId,
  });
  const videoStore = new SupabaseVideoOperationStore(input.supabase);
  const images = new ImageMediaRuntime({
    storage,
    requireStorageForOperational: true,
    circuitBreaker: input.circuitBreaker ?? sharedCircuit,
    usageRecorder,
    budgetEnvelope,
  });
  const video = new VideoMediaRuntime({
    store: videoStore,
    storage,
    usageRecorder,
    budgetEnvelope,
  });
  return { images, video, storage, budgetEnvelope, usageRecorder };
}

export async function resolveTenantMonthSpendUsd(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          gte: (col: string, val: string) => PromiseLike<{
            data: Array<{ estimated_cost_usd?: number | string; cost_cents?: number | string }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  },
  tenantId: string,
  now = new Date(),
): Promise<number> {
  const resolved = await resolveTenantMonthSpend(supabase, tenantId, now);
  if (!resolved.ok) {
    throw new Error(`month_spend_${resolved.reason}`);
  }
  return resolved.spentUsd;
}

/** Safe spend resolution — unavailable ledger must NOT silently become $0. */
export async function resolveTenantMonthSpend(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          gte: (col: string, val: string) => PromiseLike<{
            data: Array<{ estimated_cost_usd?: number | string; cost_cents?: number | string }> | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  },
  tenantId: string,
  now = new Date(),
): Promise<MonthSpendResolution> {
  const recorder = new SupabaseUsageRecorder(supabase as ConstructorParameters<typeof SupabaseUsageRecorder>[0]);
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return recorder.resolveMonthSpend!(tenantId, monthKey);
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
export type { MonthSpendResolution };
