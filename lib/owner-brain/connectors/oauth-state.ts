import crypto from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret(): string {
  const secret = process.env.OWNER_BRAIN_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("OWNER_BRAIN_OAUTH_STATE_SECRET is not set — required to initiate an Operating Brain OAuth connection");
  return secret;
}

/**
 * Same signed-compact-token CSRF pattern as packages/storage's Drive OAuth
 * state (generateOAuthState/verifyOAuthState) — reimplemented here rather
 * than imported because it also needs to round-trip which sourceKey the
 * flow is for (Drive's doesn't need that, it's single-purpose).
 */
export function generateOwnerBrainOAuthState(input: { ownerId: string; sourceKey: string }): string {
  const payload = { ownerId: input.ownerId, sourceKey: input.sourceKey, issuedAtMs: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export type VerifyOwnerBrainStateResult =
  | { ok: true; ownerId: string; sourceKey: string }
  | { ok: false; reason: "malformed" | "invalid_signature" | "expired" };

export function verifyOwnerBrainOAuthState(state: string): VerifyOwnerBrainStateResult {
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [encoded, signature] = parts;

  const expected = crypto.createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { ok: false, reason: "invalid_signature" };
  }

  let payload: { ownerId: string; sourceKey: string; issuedAtMs: number };
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() - payload.issuedAtMs > STATE_TTL_MS) return { ok: false, reason: "expired" };
  return { ok: true, ownerId: payload.ownerId, sourceKey: payload.sourceKey };
}
