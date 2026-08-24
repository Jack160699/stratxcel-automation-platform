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
  /** ai_execution_failure diagnostics: which attempt actually failed, not
   * just that "all attempts" collectively did. Never secrets — provider,
   * model, and timing metadata only. */
  attemptCount?: number;
  lastAttemptProvider?: string | null;
  lastAttemptModel?: string | null;
  lastAttemptLatencyMs?: number | null;
  lastAttemptErrorCategory?: string | null;
  requestedTimeoutMs?: number;
  /** Compact "provider/model:outcome@latencyMs" per attempt, every attempt
   * — not just the last. E.g. "google/gemini-3.6-flash:PROVIDER_FAILURE@9ms,
   * openai/gpt-5.4-mini:RATE_LIMIT@80199ms". */
  allAttempts?: string | null;
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
