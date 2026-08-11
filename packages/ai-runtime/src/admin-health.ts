import { buildTaskPolicies } from "./policy/task-policies.ts";
import { DEPARTMENT_POLICY_MAP, assertAllDepartmentsMapped } from "./policy/department-map.ts";
import { ProviderCircuitBreaker } from "./health/circuit-breaker.ts";
import { probeGeminiReadiness, probeOpenAIReadiness, ReadinessCache } from "./health/readiness.ts";
import { resolveModelId } from "./catalog/models.ts";
import type { AIProviderHealth } from "./types.ts";

export type AdminProviderStatus =
  | "not_configured"
  | "configured"
  | "reachable"
  | "model_available"
  | "operational"
  | "degraded"
  | "circuit_open";

export interface AiAdminHealthSnapshot {
  gemini: AIProviderHealth & { status: AdminProviderStatus };
  openai: AIProviderHealth & { status: AdminProviderStatus };
  image: {
    configured: boolean;
    primaryModel: string;
    fallbackModel: string;
    status: AdminProviderStatus;
    storageReady: boolean;
  };
  video: {
    configured: boolean;
    economyModel: string;
    soraActive: false;
    status: AdminProviderStatus;
    durableStoreReady: boolean;
  };
  budgetLedgerReady: boolean;
  modelPolicySummary: Array<{ taskClass: string; primary: string; fallback: string | null }>;
  departmentMappingCount: { mapped: number; total: number };
  circuit: Array<{ key: string; failures: number; open: boolean }>;
  estimatedMonthSpendUsd: number | null;
  recentFallbackRate: number | null;
  hermesNote: string;
}

const readinessCache = new ReadinessCache();

function deriveStatus(
  probe: { configured: boolean; reachable: boolean; modelAvailable: boolean },
  circuitOpen: boolean,
  extrasOk = true,
): AdminProviderStatus {
  if (!probe.configured) return "not_configured";
  if (circuitOpen) return "circuit_open";
  if (probe.configured && probe.reachable && probe.modelAvailable && extrasOk) return "operational";
  if (probe.configured && probe.reachable && probe.modelAvailable) return "model_available";
  if (probe.configured && probe.reachable) return "reachable";
  if (probe.configured && !probe.reachable) return "degraded";
  return "configured";
}

export async function probeBudgetLedgerReady(supabase?: {
  from: (table: string) => {
    select: (cols: string) => {
      limit: (n: number) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
}): Promise<boolean> {
  if (!supabase) return false;
  try {
    const primary = await supabase.from("ai_execution_usage").select("estimated_cost_usd").limit(1);
    if (!primary.error) return true;
    const fallback = await supabase.from("provider_usage_events").select("cost_cents").limit(1);
    return !fallback.error;
  } catch {
    return false;
  }
}

export async function probeDurableVideoStoreReady(supabase?: {
  from: (table: string) => {
    select: (cols: string) => {
      limit: (n: number) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
}): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("ai_media_operations").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function probeCanonicalStorageReady(storage?: {
  isWritable: () => Promise<boolean>;
}): Promise<boolean> {
  if (!storage) return false;
  try {
    return await storage.isWritable();
  } catch {
    return false;
  }
}

export async function buildAiAdminHealthSnapshot(args?: {
  circuitBreaker?: ProviderCircuitBreaker;
  estimatedMonthSpendUsd?: number | null;
  recentFallbackRate?: number | null;
  fetchImpl?: typeof fetch;
  storageReady?: boolean;
  durableVideoStoreReady?: boolean;
  budgetLedgerReady?: boolean;
  supabase?: {
    from: (table: string) => {
      select: (cols: string) => {
        limit: (n: number) => PromiseLike<{ error: { message?: string } | null }>;
      };
    };
  };
  storage?: { isWritable: () => Promise<boolean> };
}): Promise<AiAdminHealthSnapshot> {
  const circuit = args?.circuitBreaker ?? new ProviderCircuitBreaker();
  const [geminiProbe, openaiProbe] = await Promise.all([
    probeGeminiReadiness({
      apiKey: process.env.GEMINI_API_KEY,
      model: resolveModelId("GOOGLE_CHEAP"),
      fetchImpl: args?.fetchImpl,
      cache: readinessCache,
    }),
    probeOpenAIReadiness({
      apiKey: process.env.OPENAI_API_KEY,
      model: resolveModelId("OPENAI_CHEAP_FALLBACK"),
      fetchImpl: args?.fetchImpl,
      cache: readinessCache,
    }),
  ]);

  const policies = buildTaskPolicies();
  const mapping = assertAllDepartmentsMapped();

  const [storageReady, durableVideoStoreReady, budgetLedgerReady] = await Promise.all([
    args?.storageReady != null
      ? Promise.resolve(args.storageReady)
      : probeCanonicalStorageReady(args?.storage),
    args?.durableVideoStoreReady != null
      ? Promise.resolve(args.durableVideoStoreReady)
      : probeDurableVideoStoreReady(args?.supabase),
    args?.budgetLedgerReady != null
      ? Promise.resolve(args.budgetLedgerReady)
      : probeBudgetLedgerReady(args?.supabase),
  ]);

  const geminiCircuit = circuit.isOpen("google", resolveModelId("GOOGLE_CHEAP"));
  const openaiCircuit = circuit.isOpen("openai", resolveModelId("OPENAI_CHEAP_FALLBACK"));

  return {
    gemini: {
      provider: "google",
      ...geminiProbe,
      circuitOpen: geminiCircuit,
      status: deriveStatus(geminiProbe, geminiCircuit),
    },
    openai: {
      provider: "openai",
      ...openaiProbe,
      circuitOpen: openaiCircuit,
      status: deriveStatus(openaiProbe, openaiCircuit),
    },
    image: {
      configured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
      primaryModel: resolveModelId("GOOGLE_IMAGE_STANDARD"),
      fallbackModel: resolveModelId("OPENAI_IMAGE_FALLBACK"),
      storageReady,
      status: deriveStatus(
        {
          configured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
          reachable: geminiProbe.reachable || openaiProbe.reachable,
          modelAvailable: geminiProbe.modelAvailable || openaiProbe.modelAvailable,
        },
        geminiCircuit && openaiCircuit,
        storageReady && budgetLedgerReady,
      ),
    },
    video: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      economyModel: resolveModelId("GOOGLE_VIDEO_ECONOMY"),
      soraActive: false,
      durableStoreReady: durableVideoStoreReady,
      status: deriveStatus(
        {
          configured: Boolean(process.env.GEMINI_API_KEY),
          reachable: geminiProbe.reachable,
          modelAvailable: geminiProbe.modelAvailable,
        },
        geminiCircuit,
        durableVideoStoreReady && storageReady && budgetLedgerReady,
      ),
    },
    budgetLedgerReady,
    modelPolicySummary: Object.values(policies).map((p) => ({
      taskClass: p.taskClass,
      primary: p.candidates.find((c) => c.role === "primary")?.model ?? "—",
      fallback: p.candidates.find((c) => c.role === "fallback")?.model ?? null,
    })),
    departmentMappingCount: {
      mapped: Object.keys(DEPARTMENT_POLICY_MAP).length,
      total: mapping.total,
    },
    circuit: circuit.snapshot().map((s) => ({ key: s.key, failures: s.failures, open: s.open })),
    estimatedMonthSpendUsd: args?.estimatedMonthSpendUsd ?? null,
    recentFallbackRate: args?.recentFallbackRate ?? null,
    hermesNote:
      "HERMES_EXTERNAL_MODEL_ROUTING: Hermes CEO/mission reasoning uses HERMES_DEFAULT_MODEL / HERMES_DEFAULT_PROVIDER on the Hermes host. WORKFORCE_DIRECT_AI_RUNTIME: specialist/direct AI calls use @stratxcel/ai-runtime.",
  };
}
