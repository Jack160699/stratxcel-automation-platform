import type { CapabilityKey } from "../capabilities/types.ts";
import { listProvidersForCapability } from "./registry.ts";
import {
  allowsFailover,
  isRetryableProviderError,
  type CapabilityProvider,
  type ProviderErrorCategory,
  type ProviderExecuteInput,
  type ProviderExecuteResult,
} from "./types.ts";

export interface FailoverOptions {
  maxAttempts?: number;
  /** Preferred provider order; falls back to registry order. */
  preferredProviderKeys?: readonly string[];
  sleepMs?: (ms: number) => Promise<void>;
}

export interface FailoverOutcome {
  result: ProviderExecuteResult;
  attempts: number;
  providersTried: readonly string[];
}

const DEFAULT_MAX_ATTEMPTS = 3;

function orderProviders(
  providers: CapabilityProvider[],
  preferred?: readonly string[],
): CapabilityProvider[] {
  if (!preferred?.length) return providers;
  const byKey = new Map(providers.map((p) => [p.key, p]));
  const ordered: CapabilityProvider[] = [];
  for (const key of preferred) {
    const p = byKey.get(key);
    if (p) {
      ordered.push(p);
      byKey.delete(key);
    }
  }
  for (const p of byKey.values()) ordered.push(p);
  return ordered;
}

/**
 * Bounded failover across configured providers for the same capability.
 * POLICY_BLOCK / AUTH_CONFIGURATION / INVALID_INPUT never hop providers.
 */
export async function executeWithFailover(
  capability: CapabilityKey | string,
  input: ProviderExecuteInput,
  options: FailoverOptions = {},
): Promise<FailoverOutcome> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 5));
  const providers = orderProviders(listProvidersForCapability(capability), options.preferredProviderKeys).filter(
    (p) => p.status === "IMPLEMENTED",
  );

  if (providers.length === 0) {
    return {
      result: {
        ok: false,
        providerKey: "none",
        errorCategory: "AUTH_CONFIGURATION",
        errorMessage: "No IMPLEMENTED provider registered for capability",
      },
      attempts: 0,
      providersTried: [],
    };
  }

  const tried: string[] = [];
  let last: ProviderExecuteResult | null = null;
  let attempts = 0;
  let providerIndex = 0;

  while (attempts < maxAttempts && providerIndex < providers.length) {
    const provider = providers[providerIndex]!;
    tried.push(provider.key);
    attempts += 1;

    const result = await provider.execute({ ...input, capability });
    last = result;
    if (result.ok) {
      return { result, attempts, providersTried: tried };
    }

    const category = result.errorCategory as ProviderErrorCategory | undefined;
    if (!allowsFailover(category)) {
      return { result, attempts, providersTried: tried };
    }

    if (isRetryableProviderError(category) && providerIndex === providers.length - 1) {
      // Same provider retry budget already counted via attempts; if only one provider, retry it.
      if (attempts < maxAttempts && providers.length === 1) {
        if (options.sleepMs) await options.sleepMs(0);
        continue;
      }
    }

    providerIndex += 1;
    if (options.sleepMs) await options.sleepMs(0);
  }

  return {
    result:
      last ??
      ({
        ok: false,
        providerKey: "none",
        errorCategory: "PROVIDER_FAILURE",
        errorMessage: "Failover exhausted",
      } satisfies ProviderExecuteResult),
    attempts,
    providersTried: tried,
  };
}
