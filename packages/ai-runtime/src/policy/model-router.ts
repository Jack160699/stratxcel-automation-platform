import { MODEL_CATALOG, type ModelCatalogKey } from "../catalog/models.ts";

export type TaskType =
  | "evidence_extraction"
  | "seo_technical"
  | "requirement_reasoning"
  | "content_generation"
  | "social_creative"
  | "ad_copy"
  | "customer_copilot"
  | "quality_critic"
  | "plan_architecture";

export interface ModelRoutingDecision {
  taskType: TaskType;
  customerPlanTier: "Standard" | "Premium" | "Free";
  selectedModel: string;
  provider: "google" | "openai" | "openrouter";
  reason: string;
  estimatedCostPerCallCents: number;
  maxTokens: number;
  temperature: number;
}

export function routeModelForTask(
  taskType: TaskType,
  customerPlanTier: "Standard" | "Premium" | "Free" = "Standard",
): ModelRoutingDecision {
  switch (taskType) {
    case "evidence_extraction":
      return {
        taskType,
        customerPlanTier,
        selectedModel: "gemini-3.5-flash-lite",
        provider: "google",
        reason: "Fast, cost-efficient model with high throughput for deterministic schema extraction.",
        estimatedCostPerCallCents: 0.1,
        maxTokens: 2000,
        temperature: 0.1,
      };

    case "seo_technical":
    case "customer_copilot":
      return {
        taskType,
        customerPlanTier,
        selectedModel: "gemini-3.6-flash",
        provider: "google",
        reason: "Low-latency balanced model optimized for conversational speed and technical parsing.",
        estimatedCostPerCallCents: 0.3,
        maxTokens: 2500,
        temperature: 0.2,
      };

    case "requirement_reasoning":
    case "plan_architecture":
    case "quality_critic":
      return {
        taskType,
        customerPlanTier,
        selectedModel: "gemini-3.6-pro",
        provider: "google",
        reason: "Deep reasoning model required for multi-factor requirement synthesis and quality review.",
        estimatedCostPerCallCents: 1.5,
        maxTokens: 4000,
        temperature: 0.2,
      };

    case "content_generation":
    case "social_creative":
    case "ad_copy":
      if (customerPlanTier === "Premium") {
        return {
          taskType,
          customerPlanTier,
          selectedModel: "gemini-3.6-pro",
          provider: "google",
          reason: "Premium plan quality standard: high-fidelity creative styling, brand nuance, and persuasive copy.",
          estimatedCostPerCallCents: 1.8,
          maxTokens: 4000,
          temperature: 0.7,
        };
      }
      return {
        taskType,
        customerPlanTier,
        selectedModel: "gemini-3.6-flash",
        provider: "google",
        reason: "Standard plan tier: reliable structured creative generation within budget boundaries.",
        estimatedCostPerCallCents: 0.5,
        maxTokens: 2500,
        temperature: 0.5,
      };

    default:
      return {
        taskType,
        customerPlanTier,
        selectedModel: "gemini-3.6-flash",
        provider: "google",
        reason: "Default balanced model selection.",
        estimatedCostPerCallCents: 0.3,
        maxTokens: 2000,
        temperature: 0.3,
      };
  }
}
