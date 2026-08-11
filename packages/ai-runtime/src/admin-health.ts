import { buildTaskPolicies } from "./policy/task-policies.ts";
import { DEPARTMENT_POLICY_MAP, assertAllDepartmentsMapped } from "./policy/department-map.ts";
import { ProviderCircuitBreaker } from "./health/circuit-breaker.ts";
import { probeGeminiReadiness, probeOpenAIReadiness, ReadinessCache } from "./health/readiness.ts";
import { resolveModelId } from "./catalog/models.ts";
import type { AIProviderHealth } from "./types.ts";

export interface AiAdminHealthSnapshot {
  gemini: AIProviderHealth;
  openai: AIProviderHealth;
  image: { configured: boolean; primaryModel: string; fallbackModel: string };
  video: { configured: boolean; economyModel: string; soraActive: false };
  modelPolicySummary: Array<{ taskClass: string; primary: string; fallback: string | null }>;
  departmentMappingCount: { mapped: number; total: number };
  circuit: Array<{ key: string; failures: number; open: boolean }>;
  estimatedMonthSpendUsd: number | null;
  hermesNote: string;
}

const readinessCache = new ReadinessCache();

export async function buildAiAdminHealthSnapshot(args?: {
  circuitBreaker?: ProviderCircuitBreaker;
  estimatedMonthSpendUsd?: number | null;
  fetchImpl?: typeof fetch;
}): Promise<AiAdminHealthSnapshot> {
  const circuit = args?.circuitBreaker ?? new ProviderCircuitBreaker();
  const [geminiProbe, openaiProbe] = await Promise.all([
    probeGeminiReadiness({
      apiKey: process.env.GEMINI_API_KEY,
      fetchImpl: args?.fetchImpl,
      cache: readinessCache,
    }),
    probeOpenAIReadiness({
      apiKey: process.env.OPENAI_API_KEY,
      fetchImpl: args?.fetchImpl,
      cache: readinessCache,
    }),
  ]);

  const policies = buildTaskPolicies();
  const mapping = assertAllDepartmentsMapped();

  return {
    gemini: {
      provider: "google",
      ...geminiProbe,
      circuitOpen: circuit.isOpen("google", resolveModelId("GOOGLE_CHEAP")),
    },
    openai: {
      provider: "openai",
      ...openaiProbe,
      circuitOpen: circuit.isOpen("openai", resolveModelId("OPENAI_CHEAP_FALLBACK")),
    },
    image: {
      configured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
      primaryModel: resolveModelId("GOOGLE_IMAGE_STANDARD"),
      fallbackModel: resolveModelId("OPENAI_IMAGE_FALLBACK"),
    },
    video: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      economyModel: resolveModelId("GOOGLE_VIDEO_ECONOMY"),
      soraActive: false,
    },
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
    hermesNote:
      "Hermes CEO/mission reasoning backend is externally configured (HERMES_DEFAULT_MODEL / HERMES_DEFAULT_PROVIDER / OpenRouter on Hermes host). Stratxcel specialist direct AI calls use ai-runtime.",
  };
}
