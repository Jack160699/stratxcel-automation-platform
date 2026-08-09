import crypto from "node:crypto";

/**
 * Google OAuth for the Search & Discovery module's tenant-scoped, read-only
 * Search Console + GA4 integration.
 *
 * Deliberately NOT the same OAuth client as:
 *  - Google login / One Tap (NEXT_PUBLIC_GOOGLE_CLIENT_ID) — that proves who
 *    a human is; it grants no API scopes and must never be treated as a
 *    tenant provider authorization.
 *  - Google Drive (GOOGLE_DRIVE_CLIENT_ID / DRIVE_OAUTH_STATE_SECRET, see
 *    packages/storage/src/drive/oauth.ts) — a separate integration surface
 *    with its own consent-screen scope declaration (drive.file). Reusing it
 *    here would force Drive's OAuth client through Google's sensitive-scope
 *    verification for webmasters.readonly/analytics.readonly it doesn't
 *    need, and would couple two independent "disconnect" blast radii.
 * A dedicated client keeps consent-screen scope declarations, verification
 * status, and revocation blast radius scoped to exactly this feature.
 *
 * Verified against official Google documentation (fetched during this task,
 * not recalled from training data):
 *  - Authorization endpoint: https://accounts.google.com/o/oauth2/v2/auth
 *    (developers.google.com/identity/protocols/oauth2/web-server)
 *  - Token endpoint: https://oauth2.googleapis.com/token (same doc)
 *  - Revocation endpoint: POST https://oauth2.googleapis.com/revoke with a
 *    form-encoded `token` parameter (same doc, #tokenrevoke)
 *  - offline access requires `access_type=offline`; a refresh token is only
 *    guaranteed on a authorization that also carries `prompt=consent`
 *    (same doc) — handled by always sending prompt=consent below and by
 *    NEVER overwriting a stored refresh token with an absent one on the
 *    callback side (see callback route).
 *  - incremental authorization uses `include_granted_scopes=true` (same doc)
 *  - Search Console read-only scope: https://www.googleapis.com/auth/webmasters.readonly
 *    (developers.google.com/webmaster-tools/v1/how-tos/authorizing)
 *  - GA4 read-only scope: https://www.googleapis.com/auth/analytics.readonly
 *    (developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes, matching the Drive OAuth precedent.
const STATE_PURPOSE = "search_google_connect";

export const GOOGLE_SEARCH_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

function getStateSecret(): string {
  const secret = process.env.SEARCH_GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("SEARCH_GOOGLE_OAUTH_STATE_SECRET is not set — required to initiate Google Search/GA4 OAuth");
  return secret;
}

/**
 * CSRF protection + tenant/user binding for the OAuth round trip. A
 * dedicated `purpose` field is included (and checked) so a state minted for
 * this flow can never be replayed against a different OAuth callback even
 * if a secret were ever accidentally shared — belt and braces on top of
 * using a wholly separate signing secret from every other OAuth flow in the
 * app (Drive, Meta/social).
 */
export function generateOAuthState(input: { tenantId: string; userId: string }): string {
  const payload = { purpose: STATE_PURPOSE, tenantId: input.tenantId, userId: input.userId, nonce: crypto.randomBytes(12).toString("base64url"), issuedAtMs: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export type VerifyOAuthStateResult =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; reason: "malformed" | "invalid_signature" | "expired" | "wrong_purpose" };

export function verifyOAuthState(state: string): VerifyOAuthStateResult {
  if (typeof state !== "string" || state.length === 0 || state.length > 2048) return { ok: false, reason: "malformed" };
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [encoded, signature] = parts;

  let expectedSignature: string;
  try {
    expectedSignature = crypto.createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }

  let payload: { purpose?: string; tenantId?: string; userId?: string; issuedAtMs?: number };
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload.tenantId !== "string" || typeof payload.userId !== "string" || typeof payload.issuedAtMs !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.purpose !== STATE_PURPOSE) return { ok: false, reason: "wrong_purpose" };
  if (Date.now() - payload.issuedAtMs > STATE_TTL_MS) return { ok: false, reason: "expired" };

  return { ok: true, tenantId: payload.tenantId, userId: payload.userId };
}

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_SEARCH_OAUTH_CLIENT_ID/GOOGLE_SEARCH_OAUTH_CLIENT_SECRET are not set");
  return { clientId, clientSecret };
}

/**
 * Builds the Google consent-screen URL requesting the minimum read-only
 * scopes for both Search Console and GA4 in one authorization. Always
 * requests offline access + forces the consent screen so a refresh token is
 * reliably issued (Google only guarantees a refresh token on a
 * prompt=consent authorization — see module doc comment).
 */
export function buildGoogleAuthorizeUrl(input: { state: string; redirectUri: string }): string {
  const { clientId } = getClientCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SEARCH_SCOPES.join(" "),
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string | null; // Google omits this on re-consent when a valid grant already exists for this exact scope set without prompt=consent forcing a new one — see callback route for the "never destroy an existing refresh token with an absent one" handling.
  expiresInSeconds: number;
  grantedScopes: string[];
}

export interface RefreshedAccessToken {
  accessToken: string;
  expiresInSeconds: number;
}

export interface GoogleTokenAdapter {
  exchangeCodeForTokens(code: string, redirectUri: string): Promise<ExchangedTokens>;
  refreshAccessToken(refreshToken: string): Promise<RefreshedAccessToken>;
  /** Best-effort revocation. Never throws — a revoke failure must not block local disconnect. */
  revokeToken(token: string): Promise<{ revoked: boolean }>;
}

export function createGoogleSearchTokenAdapter(): GoogleTokenAdapter {
  return {
    async exchangeCodeForTokens(code, redirectUri) {
      const { clientId, clientSecret } = getClientCredentials();
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Google token exchange failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
      const result = (await response.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
      return {
        accessToken: result.access_token,
        refreshToken: result.refresh_token ?? null,
        expiresInSeconds: result.expires_in,
        grantedScopes: result.scope ? result.scope.split(" ").filter(Boolean) : [],
      };
    },

    async refreshAccessToken(refreshToken) {
      const { clientId, clientSecret } = getClientCredentials();
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Google token refresh failed: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
      const result = (await response.json()) as { access_token: string; expires_in: number };
      return { accessToken: result.access_token, expiresInSeconds: result.expires_in };
    },

    async revokeToken(token) {
      try {
        const response = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
        return { revoked: response.ok };
      } catch {
        return { revoked: false };
      }
    },
  };
}
