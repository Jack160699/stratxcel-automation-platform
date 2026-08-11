import type { CapabilityKey } from "../capabilities/types.ts";
import type { CapabilityProvider } from "./types.ts";

const PROVIDERS = new Map<string, CapabilityProvider>();

export function registerProvider(provider: CapabilityProvider): void {
  if (PROVIDERS.has(provider.key)) {
    throw new Error(`duplicate_provider:${provider.key}`);
  }
  PROVIDERS.set(provider.key, provider);
}

export function resetProviderRegistryForTests(): void {
  PROVIDERS.clear();
}

export function getProvider(key: string): CapabilityProvider | undefined {
  return PROVIDERS.get(key);
}

export function listProviders(): CapabilityProvider[] {
  return [...PROVIDERS.values()];
}

export function listProvidersForCapability(capability: CapabilityKey | string): CapabilityProvider[] {
  return listProviders().filter((p) => p.capabilityKeys.includes(capability as CapabilityKey));
}

/** Alias used by capability execution readiness reconciliation. */
export function getProvidersForCapability(capability: CapabilityKey | string): CapabilityProvider[] {
  return listProvidersForCapability(capability);
}

export function assertProvider(key: string): CapabilityProvider {
  const p = getProvider(key);
  if (!p) throw new Error(`unknown_provider:${key}`);
  return p;
}
