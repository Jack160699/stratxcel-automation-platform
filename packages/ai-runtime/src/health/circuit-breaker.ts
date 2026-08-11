import type { AIProviderId } from "../types.ts";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  now?: () => number;
}

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

/**
 * Cross-tenant-safe circuit breaker: only tracks provider/model keys,
 * never customer payloads.
 */
export class ProviderCircuitBreaker {
  private readonly states = new Map<string, CircuitState>();
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.failureThreshold = config?.failureThreshold ?? Number(process.env.AI_PROVIDER_CIRCUIT_BREAKER_THRESHOLD ?? 5);
    this.cooldownMs = config?.cooldownMs ?? Number(process.env.AI_PROVIDER_CIRCUIT_BREAKER_COOLDOWN_MS ?? 60_000);
    this.now = config?.now ?? (() => Date.now());
  }

  private key(provider: AIProviderId, model: string): string {
    return `${provider}:${model}`;
  }

  isOpen(provider: AIProviderId, model: string): boolean {
    const state = this.states.get(this.key(provider, model));
    if (state?.openedAt == null) return false;
    if (this.now() - state.openedAt >= this.cooldownMs) {
      // Half-open: allow a probe by clearing open flag but keeping failure count soft.
      state.openedAt = null;
      state.failures = Math.max(0, state.failures - 1);
      return false;
    }
    return true;
  }

  recordSuccess(provider: AIProviderId, model: string): void {
    this.states.set(this.key(provider, model), { failures: 0, openedAt: null });
  }

  recordFailure(provider: AIProviderId, model: string): void {
    const key = this.key(provider, model);
    const prev = this.states.get(key) ?? { failures: 0, openedAt: null };
    const failures = prev.failures + 1;
    const openedAt = failures >= this.failureThreshold ? this.now() : prev.openedAt;
    this.states.set(key, { failures, openedAt });
  }

  snapshot(): Array<{ key: string; failures: number; open: boolean; openedAt: number | null }> {
    const out: Array<{ key: string; failures: number; open: boolean; openedAt: number | null }> = [];
    for (const [key, state] of this.states) {
      const [provider, model] = key.split(":") as [AIProviderId, string];
      out.push({
        key,
        failures: state.failures,
        open: this.isOpen(provider, model),
        openedAt: state.openedAt,
      });
    }
    return out;
  }

  reset(): void {
    this.states.clear();
  }
}
