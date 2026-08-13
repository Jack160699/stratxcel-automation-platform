import { loadEmailRuntimeConfig } from "../config.ts";
import type {
  EmailErrorCategory,
  EmailProvider,
  EmailProviderSendOutcome,
  EmailSendRequest,
} from "../types.ts";

const RESEND_API = "https://api.resend.com";
/** Sending-access runtime: POST /emails is the only Resend HTTP call. */

function categorizeHttpFailure(status: number, message: string): {
  retryable: boolean;
  errorCategory: EmailErrorCategory;
  errorCode: string;
} {
  const lower = message.toLowerCase();
  if (status === 408 || status === 429) {
    return { retryable: true, errorCategory: status === 429 ? "rate_limited" : "timeout", errorCode: `HTTP_${status}` };
  }
  if (status >= 500) {
    return { retryable: true, errorCategory: "provider_5xx", errorCode: `HTTP_${status}` };
  }
  if (status === 401 || status === 403) {
    return { retryable: false, errorCategory: "auth_config", errorCode: `HTTP_${status}` };
  }
  if (
    lower.includes("not verified") ||
    lower.includes("unverified") ||
    lower.includes("domain is not verified") ||
    lower.includes("from address")
  ) {
    return { retryable: false, errorCategory: "sender_unverified", errorCode: "SENDER_UNVERIFIED" };
  }
  if (status === 422 || lower.includes("invalid") || lower.includes("recipient")) {
    return { retryable: false, errorCategory: "invalid_recipient", errorCode: `HTTP_${status}` };
  }
  if (status >= 400) {
    return { retryable: false, errorCategory: "hard_reject", errorCode: `HTTP_${status}` };
  }
  return { retryable: false, errorCategory: "unknown", errorCode: `HTTP_${status}` };
}

function safeErrorMessage(raw: string): string {
  return raw
    .replace(/re_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/sk_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 280);
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly apiKey: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly sendTimeoutMs: number;

  constructor(options: {
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
    sendTimeoutMs?: number;
    /** Accepted for compatibility; readiness is configuration-only and does not probe Resend admin APIs. */
    probeTimeoutMs?: number;
  } = {}) {
    const config = loadEmailRuntimeConfig();
    this.apiKey = options.apiKey ?? process.env.RESEND_API_KEY?.trim() ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sendTimeoutMs = options.sendTimeoutMs ?? config.providerTimeoutMs;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  async send(request: EmailSendRequest): Promise<EmailProviderSendOutcome> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        provider: this.name,
        retryable: false,
        errorCode: "NOT_CONFIGURED",
        errorCategory: "not_configured",
        errorSafe: "RESEND_API_KEY is not configured",
      };
    }

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };
      if (request.idempotencyKey) {
        headers["Idempotency-Key"] = request.idempotencyKey;
      }

      const body: Record<string, unknown> = {
        from: request.from,
        to: [request.to],
        subject: request.subject,
        html: request.html,
        text: request.text,
      };
      if (request.replyTo) body.reply_to = request.replyTo;
      if (request.headers) body.headers = request.headers;
      if (request.tags) body.tags = request.tags;

      const response = await fetchWithTimeout(
        this.fetchImpl,
        `${RESEND_API}/emails`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        },
        this.sendTimeoutMs
      );

      const rawText = await response.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }

      if (!response.ok) {
        const message =
          typeof parsed.message === "string"
            ? parsed.message
            : typeof parsed.name === "string"
              ? parsed.name
              : `Resend request failed (${response.status})`;
        const categorized = categorizeHttpFailure(response.status, message);
        return {
          ok: false,
          provider: this.name,
          retryable: categorized.retryable,
          errorCode: categorized.errorCode,
          errorCategory: categorized.errorCategory,
          errorSafe: safeErrorMessage(message),
          httpStatus: response.status,
        };
      }

      const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
      if (!id) {
        return {
          ok: false,
          provider: this.name,
          retryable: true,
          errorCode: "MISSING_PROVIDER_MESSAGE_ID",
          errorCategory: "provider_5xx",
          errorSafe: "Resend returned success without a message id",
          httpStatus: response.status,
        };
      }

      return {
        ok: true,
        provider: this.name,
        providerMessageId: id,
        safeMetadata: { httpStatus: response.status },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = /timeout|aborted|AbortError/i.test(message);
      return {
        ok: false,
        provider: this.name,
        retryable: true,
        errorCode: isTimeout ? "TIMEOUT" : "NETWORK",
        errorCategory: isTimeout ? "timeout" : "network",
        errorSafe: safeErrorMessage(message),
      };
    }
  }

  /**
   * Configuration knowledge only. A sending-access key must not call
   * Resend domain-list, API-key admin, or account-admin endpoints.
   * Delivery proof is a persisted SENT row with provider_message_id.
   */
  async probeReadiness() {
    const config = loadEmailRuntimeConfig();
    if (!this.isConfigured()) {
      return {
        configured: false,
        reachable: false,
        senderVerified: null,
        detail: "RESEND_API_KEY is not set",
      };
    }

    const senderConfigured = Boolean(config.from && config.from.includes("@"));
    return {
      configured: true,
      reachable: null,
      senderVerified: null,
      detail: senderConfigured
        ? "Resend sending key is configured; domain and account APIs are not probed. Delivery proof requires a real provider send."
        : "RESEND_API_KEY is set but EMAIL_FROM is missing or invalid",
    };
  }
}
