import { buildTaskPolicies } from "./policy/task-policies.ts";
import { DEPARTMENT_POLICY_MAP, assertAllDepartmentsMapped } from "./policy/department-map.ts";
import { ProviderCircuitBreaker } from "./health/circuit-breaker.ts";
import { probeGeminiReadiness, probeOpenAIReadiness, ReadinessCache, GOOGLE_IMAGE_REQUIRED_GENERATION_METHODS, GOOGLE_VIDEO_REQUIRED_GENERATION_METHODS } from "./health/readiness.ts";
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
    primaryModelAvailable: boolean;
    fallbackModelAvailable: boolean;
  };
  video: {
    configured: boolean;
    economyModel: string;
    soraActive: false;
    status: AdminProviderStatus;
    durableStoreReady: boolean;
    economyModelAvailable: boolean;
  };
  research: {
    aiRuntimeAvailable: boolean;
    geminiConfigured: boolean;
    geminiModelCallable: boolean;
    googleSearchGrounding: "supported_unverified" | "not_configured";
    openaiConfigured: boolean;
    openaiLiveStatus: "deferred_owner_wallet" | "configured" | "not_configured";
    researchWebImplementation: "AVAILABLE" | "NOT_CONFIGURED" | "FAIL";
    researchSerpImplementation: "AVAILABLE" | "NOT_CONFIGURED" | "FAIL";
    searchConsoleNote: string;
    status: AdminProviderStatus;
  };
  budgetLedgerReady: boolean;
  serviceMeteringWriterReady: boolean;
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

/** Service-role metering writer must be available for production OPERATIONAL claims. */
export async function probeServiceMeteringWriterReady(args?: {
  hasServiceRoleKey?: boolean;
  supabase?: {
    from: (table: string) => {
      select: (cols: string) => {
        limit: (n: number) => PromiseLike<{ error: { message?: string } | null }>;
      };
    };
  };
}): Promise<boolean> {
  const hasKey =
    args?.hasServiceRoleKey ?? Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasKey) return false;
  return probeBudgetLedgerReady(args?.supabase);
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
  serviceMeteringWriterReady?: boolean;
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
  const imagePrimary = resolveModelId("GOOGLE_IMAGE_STANDARD");
  const imageFallback = resolveModelId("OPENAI_IMAGE_FALLBACK");
  const videoEconomy = resolveModelId("GOOGLE_VIDEO_ECONOMY");

  const [geminiProbe, openaiProbe, imagePrimaryProbe, imageFallbackProbe, videoEconomyProbe] =
    await Promise.all([
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
      // Actual media models — text readiness must not imply image/video readiness.
      // Require generation methods used by ImageMediaRuntime / VideoMediaRuntime.
      probeGeminiReadiness({
        apiKey: process.env.GEMINI_API_KEY,
        model: imagePrimary,
        fetchImpl: args?.fetchImpl,
        cache: readinessCache,
        requiredGenerationMethods: GOOGLE_IMAGE_REQUIRED_GENERATION_METHODS,
      }),
      process.env.OPENAI_API_KEY
        ? probeOpenAIReadiness({
            apiKey: process.env.OPENAI_API_KEY,
            model: imageFallback,
            fetchImpl: args?.fetchImpl,
            cache: readinessCache,
          })
        : Promise.resolve({
            configured: false,
            reachable: false,
            modelAvailable: false,
            lastCheckedAt: new Date().toISOString(),
            safeErrorCode: "OPENAI_NOT_CONFIGURED",
          }),
      probeGeminiReadiness({
        apiKey: process.env.GEMINI_API_KEY,
        model: videoEconomy,
        fetchImpl: args?.fetchImpl,
        cache: readinessCache,
        requiredGenerationMethods: GOOGLE_VIDEO_REQUIRED_GENERATION_METHODS,
      }),
    ]);

  const policies = buildTaskPolicies();
  const mapping = assertAllDepartmentsMapped();

  const [storageReady, durableVideoStoreReady, budgetLedgerReady, serviceMeteringWriterReady] =
    await Promise.all([
      args?.storageReady != null
        ? Promise.resolve(args.storageReady)
        : probeCanonicalStorageReady(args?.storage),
      args?.durableVideoStoreReady != null
        ? Promise.resolve(args.durableVideoStoreReady)
        : probeDurableVideoStoreReady(args?.supabase),
      args?.budgetLedgerReady != null
        ? Promise.resolve(args.budgetLedgerReady)
        : probeBudgetLedgerReady(args?.supabase),
      args?.serviceMeteringWriterReady != null
        ? Promise.resolve(args.serviceMeteringWriterReady)
        : probeServiceMeteringWriterReady({ supabase: args?.supabase }),
    ]);

  const geminiCircuit = circuit.isOpen("google", resolveModelId("GOOGLE_CHEAP"));
  const openaiCircuit = circuit.isOpen("openai", resolveModelId("OPENAI_CHEAP_FALLBACK"));
  const imageCircuit = circuit.isOpen("google", imagePrimary) && circuit.isOpen("openai", imageFallback);
  const videoCircuit = circuit.isOpen("google", videoEconomy);

  const imageModelAvailable =
    imagePrimaryProbe.modelAvailable ||
    (Boolean(process.env.OPENAI_API_KEY) && imageFallbackProbe.modelAvailable);
  const imageReachable = imagePrimaryProbe.reachable || imageFallbackProbe.reachable;
  const researchPolicy = policies.RESEARCH;
  const googleSearchGrounding = researchPolicy?.allowGoogleSearchGrounding
    ? geminiProbe.configured
      ? ("supported_unverified" as const)
      : ("not_configured" as const)
    : ("not_configured" as const);
  const researchWebImplementation =
    geminiProbe.configured || openaiProbe.configured
      ? ("AVAILABLE" as const)
      : ("NOT_CONFIGURED" as const);
  const researchStatus = deriveStatus(
    {
      configured: geminiProbe.configured || openaiProbe.configured,
      reachable: geminiProbe.reachable || openaiProbe.reachable,
      modelAvailable: geminiProbe.modelAvailable || openaiProbe.modelAvailable,
    },
    geminiCircuit && openaiCircuit,
    false,
  );

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
      primaryModel: imagePrimary,
      fallbackModel: imageFallback,
      storageReady,
      primaryModelAvailable: imagePrimaryProbe.modelAvailable,
      fallbackModelAvailable: imageFallbackProbe.modelAvailable,
      status: deriveStatus(
        {
          configured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
          reachable: imageReachable,
          modelAvailable: imageModelAvailable,
        },
        imageCircuit,
        storageReady && budgetLedgerReady && serviceMeteringWriterReady,
      ),
    },
    video: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      economyModel: videoEconomy,
      soraActive: false,
      durableStoreReady: durableVideoStoreReady,
      economyModelAvailable: videoEconomyProbe.modelAvailable,
      status: deriveStatus(
        {
          configured: Boolean(process.env.GEMINI_API_KEY),
          reachable: videoEconomyProbe.reachable,
          modelAvailable: videoEconomyProbe.modelAvailable,
        },
        videoCircuit,
        durableVideoStoreReady && storageReady && budgetLedgerReady && serviceMeteringWriterReady,
      ),
    },
    research: {
      aiRuntimeAvailable: true,
      geminiConfigured: geminiProbe.configured,
      geminiModelCallable: geminiProbe.modelAvailable,
      googleSearchGrounding,
      openaiConfigured: openaiProbe.configured,
      openaiLiveStatus: openaiProbe.configured
        ? ("deferred_owner_wallet" as const)
        : ("not_configured" as const),
      researchWebImplementation,
      researchSerpImplementation: "NOT_CONFIGURED",
      searchConsoleNote:
        "Search Console is owned-property evidence only; research.serp Workforce bind incomplete.",
      status: researchStatus,
    },
    budgetLedgerReady,
    serviceMeteringWriterReady,
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
      "HERMES_EXTERNAL_MODEL_ROUTING: Hermes CEO/mission reasoning uses HERMES_DEFAULT_MODEL / HERMES_DEFAULT_PROVIDER on the Hermes host. WORKFORCE_DIRECT_AI_RUNTIME: specialist/direct AI calls use @stratxcel/ai-runtime. RESEARCH: Hermes attach_research_evidence only; native Hermes web/browser tools remain disabled.",
  };
}
