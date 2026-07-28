/**
 * Shared cross-provider API error classification (Meta Graph/Instagram/
 * Threads, LinkedIn, YouTube/Google). Each provider's fetch failures get
 * parsed into the same MetaApiError shape so worker.ts has exactly one place
 * that decides retryable vs. permanent vs. "mark account reauth_required" —
 * it never needs to know which platform produced the error. The name
 * "MetaApiError" predates the multi-platform provider set; kept as-is to
 * avoid a churn-only rename across call sites.
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

interface LinkedInErrorBody {
  message?: string;
  serviceErrorCode?: number;
  status?: number;
  code?: string;
}

/**
 * LinkedIn's REST API returns errors as { message, serviceErrorCode, status }
 * (or occasionally { code, message } for OAuth-specific failures). There is
 * no single numeric code space shared across all LinkedIn products, so
 * classification leans on the HTTP status plus the "code" string field.
 */
export async function toLinkedInApiError(res: Response, context: string): Promise<MetaApiError> {
  const status = res.status;
  let body: LinkedInErrorBody | null = null;
  let rawText = "";
  try {
    rawText = await res.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    // not JSON
  }

  const message = body?.message ?? rawText.slice(0, 300) ?? `HTTP ${status}`;

  if (status === 429) {
    return new MetaApiError(`${context}: rate limited (429)`, "rate_limit", true, status);
  }
  if (status === 401 || body?.code === "REVOKED_ACCESS_TOKEN" || body?.code === "EXPIRED_ACCESS_TOKEN") {
    return new MetaApiError(`${context}: ${message}`, "invalid_token", false, status);
  }
  if (status === 403) {
    return new MetaApiError(`${context}: ${message}`, "permission", false, status);
  }
  if (!body) {
    return new MetaApiError(`${context}: malformed response (HTTP ${status})`, "malformed_response", true, status);
  }

  return new MetaApiError(`${context}: ${message}`, "unknown", true, status);
}

interface GoogleErrorBody {
  error?:
    | string
    | {
        code?: number;
        message?: string;
        errors?: { reason?: string; message?: string }[];
        status?: string;
      };
  error_description?: string;
}

/**
 * Google API (YouTube Data API v3) errors are shaped as
 * { error: { code, message, errors: [{ reason }], status } }. "status" is
 * the gRPC-style string (UNAUTHENTICATED, PERMISSION_DENIED, ...); "reason"
 * on the nested errors array distinguishes quota/rate-limit from other 403s.
 */
export async function toYouTubeApiError(res: Response, context: string): Promise<MetaApiError> {
  const status = res.status;
  let body: GoogleErrorBody | null = null;
  let rawText = "";
  try {
    rawText = await res.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    // not JSON
  }

  const apiError = typeof body?.error === "object" ? body.error : undefined;
  const oauthError = typeof body?.error === "string" ? body.error : undefined;
  const message = apiError?.message ?? body?.error_description ?? oauthError ?? rawText.slice(0, 300) ?? `HTTP ${status}`;
  const reason = apiError?.errors?.[0]?.reason;
  const googleStatus = apiError?.status;

  if (status === 429 || reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return new MetaApiError(`${context}: rate/quota limited`, "rate_limit", true, status);
  }
  if (
    status === 401 ||
    googleStatus === "UNAUTHENTICATED" ||
    oauthError === "invalid_grant" ||
    oauthError === "invalid_token"
  ) {
    return new MetaApiError(`${context}: ${message}`, "invalid_token", false, status);
  }
  if (status === 403 || googleStatus === "PERMISSION_DENIED") {
    return new MetaApiError(`${context}: ${message}`, "permission", false, status);
  }
  if (!body) {
    return new MetaApiError(`${context}: malformed response (HTTP ${status})`, "malformed_response", true, status);
  }

  return new MetaApiError(`${context}: ${message}`, "unknown", true, status);
}
