/** Structured safe logs — never secrets, tokens, or raw customer payloads. */

export interface SafeAiLogEvent {
  event: string;
  provider?: string;
  model?: string;
  taskClass?: string;
  latencyMs?: number;
  tokens?: number;
  estimatedCostUsd?: number;
  fallbackUsed?: boolean;
  escalationLevel?: number;
  safeErrorCategory?: string;
  detail?: string;
}

const SECRET_PATTERN = /(?:sk-[a-zA-Z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[^\s]+)/gi;

export function sanitizeLogValue(value: string): string {
  return value.replace(SECRET_PATTERN, "[REDACTED]");
}

export function safeAiLog(event: SafeAiLogEvent): void {
  const payload = {
    ...event,
    detail: event.detail ? sanitizeLogValue(event.detail) : undefined,
  };
  console.info("[ai-runtime]", JSON.stringify(payload));
}
