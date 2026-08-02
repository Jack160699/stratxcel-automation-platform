import crypto from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a user to complete the Google consent screen, short enough to limit a leaked state's usefulness.

function getStateSecret(): string {
  const secret = process.env.DRIVE_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("DRIVE_OAUTH_STATE_SECRET is not set — required to initiate Drive OAuth");
  return secret;
}

/**
 * CSRF protection for the OAuth flow: the state parameter round-tripped
 * through Google encodes the tenantId + userId + issue time, signed with
 * an HMAC so the callback can verify it wasn't forged and hasn't expired,
 * without needing server-side session storage for the OAuth flow itself.
 * Same signed-compact-token shape as @stratxcel/hermes's mission tokens,
 * reused here rather than reinvented.
 */
export function generateOAuthState(input: { tenantId: string; userId: string }): string {
  const payload = { tenantId: input.tenantId, userId: input.userId, issuedAtMs: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export type VerifyOAuthStateResult =
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; reason: "malformed" | "invalid_signature" | "expired" };

export function verifyOAuthState(state: string): VerifyOAuthStateResult {
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [encoded, signature] = parts;

  const expectedSignature = crypto.createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }

  let payload: { tenantId: string; userId: string; issuedAtMs: number };
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (Date.now() - payload.issuedAtMs > STATE_TTL_MS) return { ok: false, reason: "expired" };

  return { ok: true, tenantId: payload.tenantId, userId: payload.userId };
}

/** Builds the Google consent-screen URL. drive.file scope only — least-privilege: this app only ever sees files it itself created or the user explicitly opened with it, never the user's whole Drive. */
export function buildGoogleAuthorizeUrl(input: { state: string; redirectUri: string }): string {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_DRIVE_CLIENT_ID is not set");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/drive.file",
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
