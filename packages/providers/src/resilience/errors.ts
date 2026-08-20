/**
 * Normalized Provider Error Taxonomy
 */

export type ProviderErrorCode =
  | "AUTHENTICATION_FAILED"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "QUOTA_EXCEEDED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "UNSUPPORTED"
  | "UNKNOWN";

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly provider: string;
  public readonly capability: string;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(params: {
    message: string;
    code: ProviderErrorCode;
    provider: string;
    capability: string;
    statusCode?: number;
    isRetryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(`[${params.capability}:${params.provider}] ${params.code}: ${params.message}`);
    this.name = "ProviderError";
    this.code = params.code;
    this.provider = params.provider;
    this.capability = params.capability;
    this.statusCode = params.statusCode;
    this.isRetryable = params.isRetryable ?? (params.code === "RATE_LIMITED" || params.code === "TIMEOUT" || params.code === "UNAVAILABLE");
    this.details = params.details;
  }
}

export function normalizeProviderError(
  err: unknown,
  capability: string,
  provider: string
): ProviderError {
  if (err instanceof ProviderError) return err;

  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  let code: ProviderErrorCode = "PROVIDER_ERROR";
  if (lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("auth") || lower.includes("key")) {
    code = "AUTHENTICATION_FAILED";
  } else if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    code = "RATE_LIMITED";
  } else if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    code = "TIMEOUT";
  } else if (lower.includes("quota") || lower.includes("insufficient funds") || lower.includes("402")) {
    code = "QUOTA_EXCEEDED";
  } else if (lower.includes("not found") || lower.includes("404")) {
    code = "NOT_FOUND";
  } else if (lower.includes("conflict") || lower.includes("already exists") || lower.includes("409")) {
    code = "CONFLICT";
  } else if (lower.includes("unavailable") || lower.includes("503") || lower.includes("bad gateway")) {
    code = "UNAVAILABLE";
  }

  return new ProviderError({
    message: msg,
    code,
    provider,
    capability,
  });
}
