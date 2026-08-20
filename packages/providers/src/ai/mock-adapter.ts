/**
 * Mock AI Provider & Model Router with Fallback
 */

import type { AIProvider, AIGenerateInput, AIGenerateResult } from "./interface.ts";
import type { CapabilityHealthResult } from "../config/health.ts";

export class MockAIProvider implements AIProvider {
  public name = "mock_ai";

  public async generate(input: AIGenerateInput): Promise<AIGenerateResult> {
    const lastMsg = input.messages[input.messages.length - 1]?.content || "";
    return {
      text: `Mock AI response for task ${input.taskClass}: ${lastMsg.slice(0, 100)}`,
      provider: "mock_ai",
      model: input.tier === "PREMIUM" ? "mock-premium" : "mock-standard",
      inputTokens: 50,
      outputTokens: 80,
      estimatedCostUsd: 0.0001,
      latencyMs: 15,
    };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "ai",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export class AIRouter {
  private providers: Map<string, AIProvider> = new Map();

  constructor() {
    this.registerProvider(new MockAIProvider());
  }

  public registerProvider(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  public async executeWithFallback(input: AIGenerateInput): Promise<AIGenerateResult> {
    const preferred = input.preferredProvider ? this.providers.get(input.preferredProvider) : undefined;
    const candidates = preferred
      ? [preferred, ...Array.from(this.providers.values()).filter((p) => p.name !== preferred.name)]
      : Array.from(this.providers.values());

    let lastErr: unknown;
    for (const provider of candidates) {
      try {
        return await provider.generate(input);
      } catch (err: unknown) {
        lastErr = err;
      }
    }

    throw lastErr || new Error("No AI provider available");
  }
}

export const aiRouter = new AIRouter();
