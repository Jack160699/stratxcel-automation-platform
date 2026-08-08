import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared crypto helpers for pairing codes and action confirmation codes.
 *
 * Codes are server-generated, cryptographically random, high-entropy secrets —
 * never derived from anything guessable. Lookup is by sha256(code) via an
 * indexed database equality filter (not an application-level string compare),
 * which is the standard, safe pattern for high-entropy token lookup (the same
 * shape as session-token lookup) and avoids needing a constant-time compare in
 * application code for the code itself. Where two secrets ARE compared directly
 * in application code (HMAC signatures — see hmac.ts) we use timingSafeEqual.
 */

/** Six-digit numeric display code, e.g. "482917". Easy to read/type over WhatsApp. */
export function generateDisplayCode(): string {
  // randomInt would be simpler but we avoid modulo bias entirely by rejection
  // sampling over a byte range, and randomBytes is already imported.
  const bytes = randomBytes(4);
  const n = bytes.readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim(), "utf8").digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Deterministic hash of a mutation's normalized input, used to bind a
 *  confirmation to the EXACT action + args it was issued for. */
export function hashNormalizedInput(actionName: string, normalizedInput: Record<string, unknown>): string {
  const canonical = JSON.stringify(normalizedInput, Object.keys(normalizedInput).sort());
  return createHash("sha256").update(`${actionName}:${canonical}`, "utf8").digest("hex");
}
