import crypto from "node:crypto";

/**
 * Signed, expiring OAuth state for the Meta connect flow (CSRF protection).
 * The state token itself is opaque to the browser: {payload}.{hmac}, base64url.
 * A hash of it is also stored in social_oauth_states so it can only be
 * redeemed once and only before it expires.
 */

const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StatePayload {
  provider: "google_business" | "google" | "instagram" | "facebook" | "threads" | "linkedin" | "youtube" | string;
  nonce: string;
  issuedAt: number;
  redirectTo?: string;
  tenantId?: string;
}

function getSecret(): string {
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("SOCIAL_OAUTH_STATE_SECRET is not set — required for OAuth state signing");
  }
  return secret;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

export function createSignedState(
  provider: StatePayload["provider"],
  redirectTo?: string,
  tenantId?: string
): { token: string; hash: string; expiresAt: Date } {
  const payload: StatePayload = {
    provider,
    nonce: crypto.randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
    redirectTo,
    tenantId,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(payloadB64);
  const token = `${payloadB64}.${sig}`;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash, expiresAt: new Date(Date.now() + TTL_MS) };
}

export function verifySignedState(
  token: string
): { valid: true; payload: StatePayload; hash: string } | { valid: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [payloadB64, sig] = parts;

  const expectedSig = sign(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "bad_payload" };
  }

  if (Date.now() - payload.issuedAt > TTL_MS) {
    return { valid: false, reason: "expired" };
  }

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { valid: true, payload, hash };
}

export const OAUTH_STATE_TTL_MS = TTL_MS;

/**
 * Where a failed OAuth callback should send the customer back to.
 *
 * Found live during E2E testing: the callback route used to collapse any
 * /app-prefixed redirectTo (e.g. /app/integrations, where a real customer
 * clicks "Reconnect account") down to the literal string "/app" on failure
 * — so a real reconnect attempt that hit a genuine backend error (expired
 * state, token exchange failure, persistence failure) silently bounced the
 * customer to the dashboard home instead of back to the page they were on,
 * with no visible error (home never reads the oauth/connect_error query
 * params). Preserve the actual redirectTo so failures land where the
 * customer can see what happened.
 */
export function resolveOAuthFailureRedirect(redirectTo: string | undefined, fallback = "/admin/social"): string {
  return redirectTo && redirectTo.startsWith("/app") ? redirectTo : fallback;
}
