/**
 * AI Provider Interface & Model Router
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export type ModelTier = "LOW" | "MEDIUM" | "PREMIUM";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIGenerateInput {
  tenantId: string;
  taskClass: string;
  messages: AIMessage[];
  tier?: ModelTier;
  preferredProvider?: "google" | "openai" | "anthropic" | "mock";
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
  temperature?: number;
}

export interface AIGenerateResult {
  text: string;
  json?: unknown;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
}

export interface AIProvider {
  name: string;
  generate: (input: AIGenerateInput) => Promise<AIGenerateResult>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}
