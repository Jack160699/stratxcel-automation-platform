/**
 * Generalized Google OAuth token adapter for the Operating Brain's own
 * Google connectors (Gmail/Calendar/Drive). Deliberately a separate OAuth
 * client (GOOGLE_OWNER_BRAIN_CLIENT_ID/SECRET) from the existing
 * GOOGLE_DRIVE_CLIENT_ID/SECRET used by packages/storage's BYOS Drive
 * feature — that one is a customer-tenant-facing "connect your Drive"
 * flow with drive.file scope; this one is the owner's own single-owner
 * consent with owner-brain-specific read-only scopes. Sharing a client
 * would blur two different consent screens (different app name a user
 * sees) and two different security boundaries.
 */

const SCOPE_BY_SOURCE: Record<string, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  google_calendar: "https://www.googleapis.com/auth/calendar.readonly",
  google_drive: "https://www.googleapis.com/auth/drive.readonly",
};

const GOOGLE_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Google access was denied. Approve the requested read-only permission and try again.",
  admin_policy_enforced: "Your Google Workspace administrator has blocked this permission.",
  disallowed_useragent: "Google sign-in cannot be completed in this browser. Try again in a supported browser.",
  org_internal: "This Google OAuth app is restricted to accounts in its organization.",
  redirect_uri_mismatch: "The Google OAuth callback URL is not configured correctly.",
  temporarily_unavailable: "Google OAuth is temporarily unavailable. Please try again.",
};

/** Maps provider errors to bounded, non-secret text safe for UI/database use. */
export function safeGoogleOAuthError(error: string | null, errorDescription: string | null): { code: string; message: string } {
  const normalized = error?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 64) || "oauth_error";
  const knownMessage = GOOGLE_OAUTH_ERROR_MESSAGES[normalized];
  if (knownMessage) return { code: normalized, message: knownMessage };

  // Google descriptions can contain account or policy details, so never persist
  // or reflect them verbatim. Their presence is useful only as a generic hint.
  return {
    code: normalized,
    message: errorDescription ? "Google could not authorize this connection. Review the consent screen and try again." : "Google OAuth did not complete. Please try again.",
  };
}

export function scopeForGoogleSource(sourceKey: string): string {
  const scope = SCOPE_BY_SOURCE[sourceKey];
  if (!scope) throw new Error(`No Google scope registered for source ${sourceKey}`);
  return scope;
}

export function buildGoogleAuthorizeUrl(input: { state: string; redirectUri: string; sourceKey: string }): string {
  const clientId = process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_OWNER_BRAIN_CLIENT_ID is not set");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: scopeForGoogleSource(input.sourceKey),
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

function getCredentials() {
  const clientId = process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OWNER_BRAIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_OWNER_BRAIN_CLIENT_ID/GOOGLE_OWNER_BRAIN_CLIENT_SECRET are not set");
  return { clientId, clientSecret };
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getCredentials();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed: HTTP ${response.status}`);
  const result = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresInSeconds: result.expires_in };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const { clientId, clientSecret } = getCredentials();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed: HTTP ${response.status}`);
  const result = (await response.json()) as { access_token: string; expires_in: number };
  return { accessToken: result.access_token, expiresInSeconds: result.expires_in };
}
