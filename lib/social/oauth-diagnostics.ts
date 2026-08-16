import { CANONICAL_ORIGIN } from "../reporting/site.ts";
import { getCanonicalSocialRedirectUri } from "./oauth-origin.ts";
import { getProvider } from "./providers/index.ts";

export type OAuthStage =
  | "connect_url"
  | "authorization"
  | "callback_received"
  | "state_verified"
  | "token_exchange"
  | "identity_fetch"
  | "provider_resource_check"
  | "connection_persisted"
  | "rehydrated";

export interface OAuthDiagnosticEvent {
  provider: string;
  stage: OAuthStage;
  status: "success" | "failure" | "info";
  reason?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  error?: unknown;
}

export interface ProviderConfigDiagnostics {
  provider: string;
  configured: boolean;
  clientIdPresent: boolean;
  clientSecretPresent: boolean;
  canonicalRedirectUri: string;
  expectedProductionOrigin: string;
  oauthMode: string;
  requiredScopes: string[];
  missingEnvVars: string[];
}

const PROVIDER_ENV_MAP: Record<
  string,
  { clientIdKeys: string[]; clientSecretKeys: string[]; oauthMode: string }
> = {
  google_business: {
    clientIdKeys: [
      "GOOGLE_BUSINESS_CLIENT_ID",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_SEARCH_OAUTH_CLIENT_ID",
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
    ],
    clientSecretKeys: [
      "GOOGLE_BUSINESS_CLIENT_SECRET",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_SEARCH_OAUTH_CLIENT_SECRET",
    ],
    oauthMode: "OAuth 2.0 (Offline Access + GBP Scope)",
  },
  instagram: {
    clientIdKeys: ["META_INSTAGRAM_APP_ID"],
    clientSecretKeys: ["META_INSTAGRAM_APP_SECRET"],
    oauthMode: "Meta Instagram Login (Long-lived Token)",
  },
  facebook: {
    clientIdKeys: ["META_APP_ID"],
    clientSecretKeys: ["META_APP_SECRET"],
    oauthMode: "Facebook Login Dialog (Page Token)",
  },
  youtube: {
    clientIdKeys: ["YOUTUBE_CLIENT_ID"],
    clientSecretKeys: ["YOUTUBE_CLIENT_SECRET"],
    oauthMode: "Google OAuth 2.0 (YouTube Data API v3)",
  },
  threads: {
    clientIdKeys: ["META_THREADS_APP_ID"],
    clientSecretKeys: ["META_THREADS_APP_SECRET"],
    oauthMode: "Meta Threads API (Two-stage Token Exchange)",
  },
  linkedin: {
    clientIdKeys: ["LINKEDIN_CLIENT_ID"],
    clientSecretKeys: ["LINKEDIN_CLIENT_SECRET"],
    oauthMode: "OAuth 2.0 (OpenID Connect + Share on LinkedIn)",
  },
  x: {
    clientIdKeys: ["X_CLIENT_ID", "TWITTER_CLIENT_ID"],
    clientSecretKeys: ["X_CLIENT_SECRET", "TWITTER_CLIENT_SECRET"],
    oauthMode: "OAuth 2.0 (PKCE S256 + Confidential Client)",
  },
};

/**
 * Sanitizes diagnostic details to strictly ensure no sensitive access tokens,
 * client secrets, or auth codes ever escape into logs or audit entries.
 */
function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> {
  if (!details) return {};
  const clean: Record<string, unknown> = {};
  const SENSITIVE = /token|secret|code|key|password|authorization|cookie/i;

  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE.test(k)) {
      clean[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      clean[k] = sanitizeDetails(v as Record<string, unknown>);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Structured diagnostic logger for OAuth stages.
 */
export function recordOAuthDiagnostic(event: OAuthDiagnosticEvent): void {
  const timestamp = new Date().toISOString();
  const safeDetails = sanitizeDetails(event.details);
  const errorMessage =
    event.error instanceof Error
      ? event.error.message
      : typeof event.error === "string"
      ? event.error
      : undefined;

  const logPayload = {
    tag: "OAuthDiagnostic",
    timestamp,
    provider: event.provider,
    stage: event.stage,
    status: event.status,
    reason: event.reason,
    statusCode: event.statusCode,
    details: safeDetails,
    ...(errorMessage ? { error: errorMessage } : {}),
  };

  if (event.status === "failure") {
    console.error(`[OAuthDiagnostic:ERROR] [${event.provider}] [${event.stage}]`, JSON.stringify(logPayload));
  } else {
    console.log(`[OAuthDiagnostic:INFO] [${event.provider}] [${event.stage}]`, JSON.stringify(logPayload));
  }
}

/**
 * Returns safe server-side configuration diagnostics for social providers
 * without revealing any secrets, tokens, or auth codes.
 */
export function getProviderConfigDiagnostics(providerFilter?: string): Record<string, ProviderConfigDiagnostics> {
  const providersToCheck = providerFilter
    ? [providerFilter]
    : ["google_business", "instagram", "facebook", "youtube", "threads", "linkedin", "x"];

  const results: Record<string, ProviderConfigDiagnostics> = {};

  for (const p of providersToCheck) {
    const canonicalKey = p === "google" ? "google_business" : p;
    const config = PROVIDER_ENV_MAP[canonicalKey];
    if (!config) continue;

    const clientIdPresent = config.clientIdKeys.some((k) => !!process.env[k]);
    const clientSecretPresent = config.clientSecretKeys.some((k) => !!process.env[k]);
    const missingEnvVars: string[] = [];

    if (!clientIdPresent) {
      missingEnvVars.push(config.clientIdKeys[0]);
    }
    if (!clientSecretPresent) {
      missingEnvVars.push(config.clientSecretKeys[0]);
    }

    let requiredScopes: string[] = [];
    try {
      requiredScopes = getProvider(canonicalKey).requiredScopes;
    } catch {
      // If provider not loaded yet
    }

    results[canonicalKey] = {
      provider: canonicalKey,
      configured: clientIdPresent && clientSecretPresent,
      clientIdPresent,
      clientSecretPresent,
      canonicalRedirectUri: getCanonicalSocialRedirectUri(canonicalKey),
      expectedProductionOrigin: CANONICAL_ORIGIN,
      oauthMode: config.oauthMode,
      requiredScopes,
      missingEnvVars,
    };
  }

  return results;
}
