import crypto from "node:crypto";

/**
 * CSRF-protecting signed state for the WhatsApp Embedded Signup flow —
 * same {payload}.{hmac} base64url scheme as lib/social/oauth-state.ts's
 * Meta connect flow, deliberately re-implemented here (not imported) so
 * @stratxcel/whatsapp stays independently importable by the standalone
 * whatsapp-worker without pulling in the Next.js app, matching this
 * package's existing precedent (see webhook.ts's own signature-verification
 * duplication).
 */
const TTL_MS = 10 * 60 * 1000;

interface EmbeddedSignupStatePayload {
  tenantId: string;
  nonce: string;
  issuedAt: number;
}

function getSecret(): string {
  const secret = process.env.WHATSAPP_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("WHATSAPP_OAUTH_STATE_SECRET is not set — required to start Embedded Signup");
  return secret;
}

export function createEmbeddedSignupState(tenantId: string): string {
  const payload: EmbeddedSignupStatePayload = { tenantId, nonce: crypto.randomBytes(16).toString("hex"), issuedAt: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export type VerifyEmbeddedSignupStateResult = { valid: true; tenantId: string } | { valid: false; reason: string };

export function verifyEmbeddedSignupState(token: string): VerifyEmbeddedSignupStateResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };
  const [payloadB64, sig] = parts;

  const expectedSig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload: EmbeddedSignupStatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (Date.now() - payload.issuedAt > TTL_MS) return { valid: false, reason: "expired" };
  return { valid: true, tenantId: payload.tenantId };
}
