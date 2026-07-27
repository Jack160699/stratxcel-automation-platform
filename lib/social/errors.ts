/**
 * Shared Meta Graph/Instagram/Threads API error classification.
 * Graph-family APIs return errors as JSON (even sometimes with HTTP 200),
 * shaped roughly as: { error: { message, type, code, error_subcode } }.
 * This gives providers and the worker a consistent way to tell a permanent
 * failure (bad/expired token, missing permission, OAuth denial) apart from a
 * transient one (rate limit, provider-side error) worth retrying.
 */

export type MetaErrorCategory =
  | "rate_limit"
  | "invalid_token"
  | "permission"
  | "oauth_denied"
  | "malformed_response"
  | "unknown";

export class MetaApiError extends Error {
  readonly category: MetaErrorCategory;
  readonly retryable: boolean;
  readonly httpStatus?: number;

  constructor(message: string, category: MetaErrorCategory, retryable: boolean, httpStatus?: number) {
    super(message);
    this.name = "MetaApiError";
    this.category = category;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

/**
 * Parses a failed fetch Response from a Meta-family API into a categorized
 * MetaApiError. Falls back to a malformed_response error if the body isn't
 * the expected JSON shape (never throws itself — always returns an error).
 */
export async function toMetaApiError(res: Response, context: string): Promise<MetaApiError> {
  const status = res.status;
  let body: GraphErrorBody | null = null;
  let rawText = "";
  try {
    rawText = await res.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    // not JSON — leave body null, we'll fall back to raw text
  }

  if (status === 429) {
    return new MetaApiError(`${context}: rate limited (429)`, "rate_limit", true, status);
  }

  const code = body?.error?.code;
  const message = body?.error?.message ?? rawText.slice(0, 300) ?? `HTTP ${status}`;

  // Known Meta error codes: 190 = invalid/expired OAuth token, 200/10 = permission
  // denied, 4/17/32/613 = rate/throughput limits.
  if (code === 190) {
    return new MetaApiError(`${context}: ${message}`, "invalid_token", false, status);
  }
  if (code === 10 || code === 200) {
    return new MetaApiError(`${context}: ${message}`, "permission", false, status);
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return new MetaApiError(`${context}: ${message}`, "rate_limit", true, status);
  }
  if (!body) {
    return new MetaApiError(`${context}: malformed response (HTTP ${status})`, "malformed_response", true, status);
  }

  return new MetaApiError(`${context}: ${message}`, "unknown", true, status);
}
