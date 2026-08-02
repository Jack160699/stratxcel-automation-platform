import crypto from "node:crypto";

/**
 * Shared low-level HMAC-SHA256 signing used both for outbound requests to
 * Hermes (HermesHttpAdapter signs its request bodies so Hermes can verify
 * the call really came from StratExcel) and for the mission-scoped tool
 * tokens in token.ts (a different payload, same primitive). Kept as one
 * signing function rather than two so there is exactly one place that
 * could get the HMAC construction wrong.
 */
export function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = signPayload(payload, secret);
  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(provided, expectedBuf);
}
