import type { AIProviderHealth, AIProviderId, FetchLike } from "../types.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";

export interface ReadinessCacheEntry {
  result: Omit<AIProviderHealth, "provider" | "circuitOpen">;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

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

export async function probeGeminiReadiness(args: {
  apiKey: string | undefined;
  model?: string;
  fetchImpl?: FetchLike;
  cache?: ReadinessCache;
}): Promise<Omit<AIProviderHealth, "provider" | "circuitOpen">> {
  const cacheKey = `google:${args.model ?? "default"}`;
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
