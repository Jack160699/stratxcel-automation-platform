import type { AIErrorCategory, AIFallbackReason } from "./types.ts";

export function isTransientFallbackWorthy(category: AIErrorCategory | undefined): boolean {
  return (
    category === "TRANSIENT" ||
    category === "TIMEOUT" ||
    category === "RATE_LIMIT" ||
    category === "CREDIT" ||
    category === "PROVIDER_FAILURE"
  );
}

/** Never hop providers for these. */
export function isNonHopError(category: AIErrorCategory | undefined): boolean {
  return (
    category === "SAFETY_REFUSAL" ||
    category === "COMPLIANCE" ||
    category === "ENTITLEMENT" ||
    category === "TENANT_ISOLATION" ||
    category === "PERMISSION" ||
    category === "APPROVAL_REQUIRED" ||
    category === "SHADOW" ||
    category === "INVALID_INPUT" ||
    category === "BUDGET_EXHAUSTED"
  );
}

export function classifyHttpStatus(status: number): AIErrorCategory {
  if (status === 402) return "CREDIT";
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMIT";
  if (status === 401 || status === 403) return "AUTH_CONFIGURATION";
  if (status >= 500) return "PROVIDER_FAILURE";
  if (status === 400) return "INVALID_INPUT";
  return "PROVIDER_FAILURE";
}

export function fallbackReasonForCategory(category: AIErrorCategory): AIFallbackReason {
  switch (category) {
    case "CREDIT":
      return "http_402";
    case "TIMEOUT":
      return "timeout";
    case "RATE_LIMIT":
      return "http_429";
    case "PROVIDER_FAILURE":
      return "http_5xx";
    case "TRANSIENT":
      return "network_failure";
    default:
      return "provider_unhealthy";
  }
}

export function userSafeErrorMessage(category: AIErrorCategory | undefined): string {
  switch (category) {
    case "RATE_LIMIT":
    case "TIMEOUT":
    case "TRANSIENT":
    case "PROVIDER_FAILURE":
    case "CREDIT":
      return "AI service temporarily unavailable";
    case "BUDGET_EXHAUSTED":
      return "Usage limit reached";
    case "INSUFFICIENT_EVIDENCE":
      return "Needs human review";
    case "SAFETY_REFUSAL":
    case "COMPLIANCE":
      return "Needs human review";
    case "NOT_CONFIGURED":
    case "AUTH_CONFIGURATION":
      return "AI service temporarily unavailable";
    case "ENTITLEMENT":
    case "PERMISSION":
    case "APPROVAL_REQUIRED":
    case "SHADOW":
      return "Needs human review";
    default:
      return "Task queued for retry";
  }
}

export function classifyProviderError(err: unknown): AIErrorCategory {
  if (!err) return "INTERNAL_FAILURE";
  if (typeof err === "object" && err !== null && "category" in err) {
    return (err as { category: AIErrorCategory }).category;
  }
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("safety") || lower.includes("refused") || lower.includes("blocked content")) {
    return "SAFETY_REFUSAL";
  }
  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("etimedout")) {
    return "TIMEOUT";
  }
  if (lower.includes("429") || lower.includes("rate limit")) return "RATE_LIMIT";
  if (lower.includes("402") || lower.includes("insufficient")) return "CREDIT";
  if (lower.includes("econnreset") || lower.includes("network") || lower.includes("fetch failed")) {
    return "TRANSIENT";
  }
  if (/\b5\d\d\b/.test(message) || lower.includes("http 5")) return "PROVIDER_FAILURE";
  if (lower.includes("not configured")) return "NOT_CONFIGURED";
  return "PROVIDER_FAILURE";
}

export class AIProviderError extends Error {
  readonly category: AIErrorCategory;
  readonly status?: number;

  constructor(category: AIErrorCategory, message: string, status?: number) {
    super(message);
    this.name = "AIProviderError";
    this.category = category;
    this.status = status;
  }
}
