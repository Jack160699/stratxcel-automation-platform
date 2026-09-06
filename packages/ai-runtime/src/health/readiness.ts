import type { AIProviderHealth, AIProviderId, FetchLike } from "../types.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";

export interface ReadinessCacheEntry {
  result: Omit<AIProviderHealth, "provider" | "circuitOpen">;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

/** ImageMediaRuntime calls models/{id}:generateContent */
export const GOOGLE_IMAGE_REQUIRED_GENERATION_METHODS = ["generateContent"] as const;
/** VideoMediaRuntime calls models/{id}:predictLongRunning */
export const GOOGLE_VIDEO_REQUIRED_GENERATION_METHODS = ["predictLongRunning"] as const;

export class ReadinessCache {
  private readonly store = new Map<string, ReadinessCacheEntry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(ttlMs = DEFAULT_TTL_MS, now: () => number = () => Date.now()) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get(key: string): Omit<AIProviderHealth, "provider" | "circuitOpen"> | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (this.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return hit.result;
  }

  set(key: string, result: Omit<AIProviderHealth, "provider" | "circuitOpen">): void {
    this.store.set(key, { result, expiresAt: this.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}

export function modelSupportsGenerationMethods(
  supported: readonly string[] | undefined,
  required: readonly string[],
): boolean {
  if (!required.length) return true;
  if (!supported?.length) return false;
  const normalized = new Set(supported.map((m) => m.trim()));
  return required.every((method) => normalized.has(method));
}

export async function probeGeminiReadiness(args: {
  apiKey: string | undefined;
  model?: string;
  fetchImpl?: FetchLike;
  cache?: ReadinessCache;
  /**
   * When set, HTTP 200 alone is insufficient — model metadata must advertise
   * these supportedGenerationMethods (cheap GET, no generation call).
   */
  requiredGenerationMethods?: readonly string[];
}): Promise<Omit<AIProviderHealth, "provider" | "circuitOpen">> {
  const methodKey = args.requiredGenerationMethods?.slice().sort().join(",") ?? "";
  const cacheKey = `google:${args.model ?? "default"}:${methodKey}`;
  const cached = args.cache?.get(cacheKey);
  if (cached) return cached;

  const now = new Date().toISOString();
  if (!args.apiKey) {
    const result = {
      configured: false,
      reachable: false,
      modelAvailable: false,
      lastCheckedAt: now,
      safeErrorCode: "GEMINI_NOT_CONFIGURED",
    };
    args.cache?.set(cacheKey, result);
    return result;
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const url = args.model
      ? `https://generativelanguage.googleapis.com/v1beta/models/${args.model}`
      : "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { "x-goog-api-key": args.apiKey },
    });
    if (!response.ok) {
      const result = {
        configured: true,
        reachable: response.status < 500,
        modelAvailable: false,
        lastCheckedAt: now,
        safeErrorCode: `GEMINI_HTTP_${response.status}`,
      };
      args.cache?.set(cacheKey, result);
      return result;
    }

    let modelAvailable = true;
    let safeErrorCode: string | null = null;
    if (args.requiredGenerationMethods?.length && args.model) {
      try {
        const json = (await response.json()) as {
          supportedGenerationMethods?: string[];
          name?: string;
        };
        const supported = json.supportedGenerationMethods ?? [];
        modelAvailable = modelSupportsGenerationMethods(supported, args.requiredGenerationMethods);
        if (!modelAvailable) {
          safeErrorCode = "GEMINI_METHOD_UNSUPPORTED";
        }
      } catch {
        modelAvailable = false;
        safeErrorCode = "GEMINI_METADATA_UNPARSEABLE";
      }
    }

    const result = {
      configured: true,
      reachable: true,
      modelAvailable,
      lastCheckedAt: now,
      safeErrorCode,
    };
    args.cache?.set(cacheKey, result);
    return result;
  } catch {
    const result = {
      configured: true,
      reachable: false,
      modelAvailable: false,
      lastCheckedAt: now,
      safeErrorCode: "GEMINI_NETWORK_FAILURE",
    };
    args.cache?.set(cacheKey, result);
    return result;
  }
}

export async function probeOpenAIReadiness(args: {
  apiKey: string | undefined;
  model?: string;
  fetchImpl?: FetchLike;
  cache?: ReadinessCache;
}): Promise<Omit<AIProviderHealth, "provider" | "circuitOpen">> {
  const cacheKey = `openai:${args.model ?? "default"}`;
  const cached = args.cache?.get(cacheKey);
  if (cached) return cached;

  const now = new Date().toISOString();
  if (!args.apiKey) {
    const result = {
      configured: false,
      reachable: false,
      modelAvailable: false,
      lastCheckedAt: now,
      safeErrorCode: "OPENAI_NOT_CONFIGURED",
    };
    args.cache?.set(cacheKey, result);
    return result;
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const url = args.model
      ? `https://api.openai.com/v1/models/${args.model}`
      : "https://api.openai.com/v1/models?limit=1";
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${args.apiKey}` },
    });
    // Never log auth headers or keys.
    if (!response.ok) {
      const category = classifyHttpStatus(response.status);
      if (category === "AUTH_CONFIGURATION") {
        // Still "configured" (key present) but not reachable/authorized.
      }
      const result = {
        configured: true,
        reachable: response.status !== 401,
        modelAvailable: response.status === 200,
        lastCheckedAt: now,
        safeErrorCode: `OPENAI_HTTP_${response.status}`,
      };
      args.cache?.set(cacheKey, result);
      return result;
    }
    const result = {
      configured: true,
      reachable: true,
      modelAvailable: true,
      lastCheckedAt: now,
      safeErrorCode: null,
    };
    args.cache?.set(cacheKey, result);
    return result;
  } catch {
    const result = {
      configured: true,
      reachable: false,
      modelAvailable: false,
      lastCheckedAt: now,
      safeErrorCode: "OPENAI_NETWORK_FAILURE",
    };
    args.cache?.set(cacheKey, result);
    return result;
  }
}

/**
 * Readiness probe for the remote local AI server. Per the connection brief
 * this server exposes GET /v1/health (liveness), GET /v1/ready (readiness)
 * and GET /v1/models (auth + model discovery) — distinct from Gemini/OpenAI's
 * single-GET probes because the remote server documents all three
 * separately. `reachable` is satisfied by /v1/ready succeeding (falls back
 * to /v1/health if the remote does not implement /v1/ready); `modelAvailable`
 * requires an authenticated /v1/models call to succeed and return at least
 * one model (or, when `model` is given, a matching model id).
 */
export async function probeLocalAIReadiness(args: {
  apiUrl: string | undefined;
  apiKey: string | undefined;
  model?: string;
  fetchImpl?: FetchLike;
  cache?: ReadinessCache;
}): Promise<Omit<AIProviderHealth, "provider" | "circuitOpen">> {
  const cacheKey = `local:${args.apiUrl ?? "unset"}:${args.model ?? "default"}`;
  const cached = args.cache?.get(cacheKey);
  if (cached) return cached;

  const now = new Date().toISOString();
  if (!args.apiUrl || !args.apiKey) {
    const result = {
      configured: false,
      reachable: false,
      modelAvailable: false,
      lastCheckedAt: now,
      safeErrorCode: "LOCAL_AI_NOT_CONFIGURED",
    };
    args.cache?.set(cacheKey, result);
    return result;
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const baseUrl = args.apiUrl.replace(/\/+$/, "");
  const authHeaders = { Authorization: `Bearer ${args.apiKey}` };

  let reachable = false;
  let reachError: string | null = null;
  try {
    const readyResponse = await fetchImpl(`${baseUrl}/v1/ready`, { method: "GET", headers: authHeaders });
    reachable = readyResponse.ok;
    if (!reachable) reachError = `LOCAL_AI_READY_HTTP_${readyResponse.status}`;
  } catch {
    reachError = "LOCAL_AI_READY_NETWORK_FAILURE";
  }
  if (!reachable) {
    try {
      const healthResponse = await fetchImpl(`${baseUrl}/v1/health`, { method: "GET", headers: authHeaders });
      reachable = healthResponse.ok;
      if (reachable) reachError = null;
      else reachError = `LOCAL_AI_HEALTH_HTTP_${healthResponse.status}`;
    } catch {
      reachError = reachError ?? "LOCAL_AI_HEALTH_NETWORK_FAILURE";
    }
  }

  let modelAvailable = false;
  let modelError: string | null = null;
  try {
    const modelsResponse = await fetchImpl(`${baseUrl}/v1/models`, { method: "GET", headers: authHeaders });
    if (!modelsResponse.ok) {
      modelError = `LOCAL_AI_MODELS_HTTP_${modelsResponse.status}`;
    } else {
      const json = (await modelsResponse.json()) as { data?: Array<{ id?: string }>; models?: Array<{ id?: string }> };
      const models = json.data ?? json.models ?? [];
      modelAvailable = args.model ? models.some((m) => m.id === args.model) : models.length > 0;
      if (!modelAvailable) modelError = "LOCAL_AI_MODEL_NOT_LISTED";
    }
  } catch {
    modelError = "LOCAL_AI_MODELS_NETWORK_FAILURE";
  }

  const result = {
    configured: true,
    reachable,
    modelAvailable,
    lastCheckedAt: now,
    safeErrorCode: reachError ?? modelError,
  };
  args.cache?.set(cacheKey, result);
  return result;
}

/**
 * Readiness probe for OpenRouter. GET https://openrouter.ai/api/v1/models
 * is OpenRouter's own documented, authenticated model-listing endpoint —
 * confirmed live against its published API reference on 2026-09-07, the
 * same source providers/openrouter.ts's own doc comment cites.
 */
export async function probeOpenRouterReadiness(args: {
  apiKey: string | undefined;
  model?: string;
  fetchImpl?: FetchLike;
  cache?: ReadinessCache;
}): Promise<Omit<AIProviderHealth, "provider" | "circuitOpen">> {
  const cacheKey = `openrouter:${args.model ?? "default"}`;
  const cached = args.cache?.get(cacheKey);
  if (cached) return cached;

  const now = new Date().toISOString();
  if (!args.apiKey) {
    const result = {
      configured: false,
      reachable: false,
      modelAvailable: false,
      lastCheckedAt: now,
      safeErrorCode: "OPENROUTER_NOT_CONFIGURED",
    };
    args.cache?.set(cacheKey, result);
    return result;
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: { Authorization: `Bearer ${args.apiKey}` },
    });
    if (!response.ok) {
      const result = {
        configured: true,
        reachable: response.status !== 401,
        modelAvailable: false,
        lastCheckedAt: now,
        safeErrorCode: `OPENROUTER_HTTP_${response.status}`,
      };
      args.cache?.set(cacheKey, result);
      return result;
    }
    const json = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = json.data ?? [];
    const modelAvailable = args.model ? models.some((m) => m.id === args.model) : models.length > 0;
    const result = {
      configured: true,
      reachable: true,
      modelAvailable,
      lastCheckedAt: now,
      safeErrorCode: modelAvailable ? null : "OPENROUTER_MODEL_NOT_LISTED",
    };
    args.cache?.set(cacheKey, result);
    return result;
  } catch {
    const result = {
      configured: true,
      reachable: false,
      modelAvailable: false,
      lastCheckedAt: now,
      safeErrorCode: "OPENROUTER_NETWORK_FAILURE",
    };
    args.cache?.set(cacheKey, result);
    return result;
  }
}

export function providerHealthSummary(
  provider: AIProviderId,
  probe: Omit<AIProviderHealth, "provider" | "circuitOpen">,
  circuitOpen: boolean,
): AIProviderHealth {
  return { provider, ...probe, circuitOpen };
}

export function assertNoSecretInObject(value: unknown): void {
  const text = JSON.stringify(value ?? {});
  if (/sk-[a-zA-Z0-9]{10,}/.test(text) || /AIza[0-9A-Za-z_-]{20,}/.test(text)) {
    throw new AIProviderError("INTERNAL_FAILURE", "secret_leak_detected_in_payload");
  }
}
