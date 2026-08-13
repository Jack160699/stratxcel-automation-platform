import type { EmailErrorCategory, EmailEventType } from "./types.ts";

const SECRET_PATTERN = /token|secret|password|api[_-]?key|authorization|credential|resend/i;

export type EmailOperationalEvent =
  | "email_enqueued"
  | "email_send_started"
  | "email_send_succeeded"
  | "email_send_retry"
  | "email_send_failed";

export interface EmailOperationalPayload {
  event: EmailOperationalEvent;
  eventType?: EmailEventType;
  templateKey?: string;
  tenantId?: string | null;
  attempt?: number;
  provider?: string;
  errorCategory?: EmailErrorCategory;
  correlationId?: string | null;
  outboxId?: string;
  status?: string;
}

function sanitize(payload: EmailOperationalPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SECRET_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && /re_[A-Za-z0-9_]+|sk_[A-Za-z0-9_]+|Bearer\s+\S+/i.test(value)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Safe operational logging — never logs email bodies, API keys, or auth headers.
 */
export function emitEmailOperationalEvent(payload: EmailOperationalPayload): void {
  const safe = sanitize(payload);
  // Structured single-line JSON for log drains; console is the existing convention.
  console.info("[email-runtime]", JSON.stringify(safe));
}
