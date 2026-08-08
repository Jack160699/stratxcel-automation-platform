import crypto from "crypto";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const NONCE_TTL_MS = 10 * 60 * 1000;
const NONCE_CACHE_MAX = 10_000;

/** In-process nonce cache — process-lifetime defense-in-depth against a captured request being replayed verbatim. The durable defense is the DB-level unique (source_system, source_event_id) index on whatsapp_shadow_events, which survives restarts and works across instances; this catches obvious same-instance replay quickly without a network round trip. */
const seenNonces = new Map<string, number>();

function cleanupNonces(now: number) {
  for (const [nonce, expiry] of seenNonces) {
    if (expiry <= now) seenNonces.delete(nonce);
  }
  while (seenNonces.size > NONCE_CACHE_MAX) {
    const first = seenNonces.keys().next().value;
    if (first === undefined) break;
    seenNonces.delete(first);
  }
}

export interface LegacyShadowAuthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verifies the internal shadow-ingest request. Requires:
 *   - a shared secret (WHATSAPP_LEGACY_SHADOW_SECRET, server-only, never in
 *     client code, never the same value as any Meta app secret)
 *   - HMAC-SHA256 over the raw request body, timing-safe compared
 *   - a timestamp within a bounded clock-skew window
 *   - a nonce not seen before (process-lifetime cache)
 * If the secret is unset, the endpoint is entirely inert (fails closed) —
 * exactly like the rest of this task's "unconfigured = no-op" pattern.
 */
export function verifyLegacyShadowRequest(input: { rawBody: Buffer; signatureHeader: string | null; timestamp: number; nonce: string }): LegacyShadowAuthResult {
  const secret = process.env.WHATSAPP_LEGACY_SHADOW_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };

  if (!Number.isFinite(input.timestamp)) return { ok: false, reason: "invalid_timestamp" };
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - input.timestamp) > MAX_CLOCK_SKEW_SECONDS) return { ok: false, reason: "timestamp_out_of_window" };

  if (!input.nonce || typeof input.nonce !== "string" || input.nonce.length < 8) return { ok: false, reason: "invalid_nonce" };
  const now = Date.now();
  cleanupNonces(now);
  if (seenNonces.has(input.nonce)) return { ok: false, reason: "nonce_replayed" };

  if (!input.signatureHeader || !input.signatureHeader.startsWith("sha256=")) return { ok: false, reason: "missing_signature" };
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(input.rawBody).digest("hex");
  const a = Buffer.from(input.signatureHeader, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "signature_mismatch" };

  // Only claim the nonce once every other check has passed — an invalid
  // request should not burn a legitimate future nonce slot.
  seenNonces.set(input.nonce, now + NONCE_TTL_MS);
  return { ok: true };
}
