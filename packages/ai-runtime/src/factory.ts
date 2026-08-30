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
  /** Real missions.id only — never social session UUID. */
  missionId?: string | null;
  /** Social/conversational session identity. */
  sessionId?: string | null;
  plan: PlanTier;
  monthlyBudgetUsd?: number | null;
  spentUsdThisMonth: number;
  /**
   * Production customer AI requires a usage writer.
   * Default true — set internalUnmetered for explicit test/agency paths.
   */
  productionBillable?: boolean;
  /** Explicit opt-out for tests / internal non-customer work. */
  internalUnmetered?: boolean;
  /** Service-role client for ledger writes AFTER owner/tenant authorization. */
  internalWriteClient?: ConstructorParameters<typeof SupabaseUsageRecorder>[0];
  /** @deprecated Use internalWriteClient — never pass RLS owner client for ledger writes. */
  supabase?: ConstructorParameters<typeof SupabaseUsageRecorder>[0];
  usageRecorder?: AIUsageRecorder;
  circuitBreaker?: ProviderCircuitBreaker;
  deps?: Partial<AIRuntimeDeps>;
}

export interface TenantMediaRuntimeFactoryInput {
  tenantId: string;
  ownerId: string;
  /** Real missions.id only. */
  missionId?: string | null;
  sessionId?: string | null;
  plan: PlanTier;
  spentUsdThisMonth: number;
  monthlyBudgetUsd?: number | null;
  productionBillable?: boolean;
  internalUnmetered?: boolean;
  /** Service-role client for durable ops + media + metering. */
  internalWriteClient: SupabaseCanonicalMediaClient &
    ConstructorParameters<typeof SupabaseUsageRecorder>[0] & {
      from: (table: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts?: { onConflict?: string },
        ) => PromiseLike<{ error: { message: string } | null }>;
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
            in?: (col: string, vals: string[]) => PromiseLike<{
              data: Array<Record<string, unknown>> | null;
              error: { message: string } | null;
            }>;
            gte?: (col: string, val: string) => PromiseLike<{
              data: Array<{ estimated_cost_usd?: number | string; cost_cents?: number | string }> | null;
              error: unknown;
            }>;
          };
        };
        insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> & {
          select?: (cols: string) => {
            single: () => PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
          };
        };
        delete?: () => { eq: (col: string, val: string) => PromiseLike<{ error: { message: string } | null }> };
      };
    };
  usageRecorder?: AIUsageRecorder;
  circuitBreaker?: ProviderCircuitBreaker;
}

const sharedCircuit = new ProviderCircuitBreaker();

export function getSharedCircuitBreaker(): ProviderCircuitBreaker {
  return sharedCircuit;
}

function assertRealMissionId(missionId: string | null | undefined): string | null {
  if (missionId == null || missionId === "") return null;
  if (missionId.startsWith("mission_") || missionId.startsWith("session_")) {
    throw new Error("mission_id_must_be_real_missions_row_or_null");
  }
  return missionId;
}

/**
 * Canonical production AI Runtime factory.
 * Billable customer AI requires an explicit usage writer (service role).
 */
export function createTenantAIRuntime(input: TenantAIRuntimeFactoryInput): {
  runtime: AIRuntime;
  budgetEnvelope: AIBudgetEnvelope;
  usageRecorder: AIUsageRecorder | undefined;
} {
  if (!input.tenantId || input.tenantId === "social-session") {
    throw new Error("tenant_required_for_billable_ai");
  }
  assertRealMissionId(input.missionId);

  const billable = input.internalUnmetered ? false : input.productionBillable !== false;

  const usageRecorder =
    input.usageRecorder ??
    (input.internalWriteClient
      ? new SupabaseUsageRecorder(input.internalWriteClient)
      : undefined);

  if (billable && !usageRecorder) {
    throw new Error("usage_writer_required_for_billable_ai");
  }

  const budgetEnvelope = createBudgetEnvelope({
    plan: input.plan,
    spentUsdThisMonth: input.spentUsdThisMonth,
    monthlyBudgetUsd: input.monthlyBudgetUsd,
  });

  const runtime = new AIRuntime({
    ...input.deps,
    google: input.deps?.google ?? new GeminiTextProvider(),
    openai: input.deps?.openai ?? new OpenAITextProvider(),
    circuitBreaker: input.circuitBreaker ?? input.deps?.circuitBreaker ?? sharedCircuit,
    usageRecorder: input.deps?.usageRecorder ?? usageRecorder,
    defaultSessionId: input.sessionId ?? input.deps?.defaultSessionId ?? null,
  });

  return { runtime, budgetEnvelope, usageRecorder };
}

/**
 * Production media factory — durable video store + canonical storage + usage ledger
 * via service-role internalWriteClient only (never InMemory in production).
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
  assertRealMissionId(input.missionId);
  if (!input.internalWriteClient) {
    throw new Error("internal_write_client_required_for_media");
  }

  const billable = input.internalUnmetered ? false : input.productionBillable !== false;
  const usageRecorder =
    input.usageRecorder ?? new SupabaseUsageRecorder(input.internalWriteClient);
  if (billable && !usageRecorder) {
    throw new Error("usage_writer_required_for_billable_ai");
  }

  const budgetEnvelope = createBudgetEnvelope({
    plan: input.plan,
    spentUsdThisMonth: input.spentUsdThisMonth,
    monthlyBudgetUsd: input.monthlyBudgetUsd,
  });

  const storage = new SupabaseCanonicalMediaStorage({
    client: input.internalWriteClient,
    ownerId: input.ownerId,
    tenantId: input.tenantId,
  });
  const videoStore = new SupabaseVideoOperationStore(input.internalWriteClient);
  const images = new ImageMediaRuntime({
    storage,
    requireStorageForOperational: true,
    circuitBreaker: input.circuitBreaker ?? sharedCircuit,
    usageRecorder,
    budgetEnvelope,
    sessionId: input.sessionId ?? null,
    missionId: input.missionId ?? null,
  });
  const video = new VideoMediaRuntime({
    store: videoStore,
    storage,
    usageRecorder,
    budgetEnvelope,
    sessionId: input.sessionId ?? null,
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
  const recorder = new SupabaseUsageRecorder(
    supabase as ConstructorParameters<typeof SupabaseUsageRecorder>[0],
  );
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return recorder.resolveMonthSpend!(tenantId, monthKey);
}

// Real defect found live (StratXcel platform-closure session): every
// current v3 self-service tier (seo/social/seo_and_social/advanced_seo/
// advanced_social/advanced_growth -- including StratXcel's own real,
// active advanced_growth plan) silently fell through to "starter", the
// cheapest AI-COGS budget bucket, below. This map fixes that WITHOUT
// inventing any new budget dollar figures (a real product/finance
// decision this module has no authority to guess at) -- it classifies
// each real v3 tier to whichever EXISTING legacy budget bucket its real
// price is closest to, extending the same price-ordered relationship this
// file's own DEFAULT_MONTHLY_BUDGET_USD table already encodes for the
// four legacy tiers, applied mechanically rather than defaulted to the
// lowest bucket for every unrecognized value.
//
// Real prices, from packages/payments-and-wallet/src/plans.ts
// PLAN_DEFINITIONS (priceCents, GST-inclusive) -- kept as a local literal
// map rather than a cross-package import: @stratxcel/ai-runtime currently
// declares zero workspace dependencies by design, and this fix does not
// warrant introducing one.
//   v3:     seo=2999  social=3999  seo_and_social=6998  advanced_seo=9999
//           advanced_social=8499  advanced_growth=18498
//   legacy: starter=2999  growth=7999  business=15999  scale=29999
// Nearest-by-price classification:
//   seo(2999)->starter(exact)  social(3999)->starter(|1000|<|4000|)
//   seo_and_social(6998)->growth(|1001|<|3999|)  advanced_seo(9999)->growth(|2000|<|6000|)
//   advanced_social(8499)->growth(|500|<|7500|)  advanced_growth(18498)->business(|2499|<|11501|)
const V3_TIER_TO_LEGACY_BUDGET_BUCKET: Record<string, Exclude<PlanTier, "custom">> = {
  seo: "starter",
  social: "starter",
  seo_and_social: "growth",
  advanced_seo: "growth",
  advanced_social: "growth",
  advanced_growth: "business",
};

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
  if (tier in V3_TIER_TO_LEGACY_BUDGET_BUCKET) return V3_TIER_TO_LEGACY_BUDGET_BUCKET[tier];
  return "starter";
}

export { resolveMonthlyBudgetUsd, assertRealMissionId };
export type { MonthSpendResolution };
