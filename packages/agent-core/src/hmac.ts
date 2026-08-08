import { createHmac, timingSafeEqual, createHash } from "node:crypto";

/**
 * HMAC verification for the internal WhatsApp agent endpoint
 * (POST /api/internal/agent/whatsapp). Modeled directly on the strongest
 * existing precedent in this repo — packages/whatsapp/src/legacy-bridge/auth.ts's
 * verifyLegacyShadowRequest() — which already combines HMAC-SHA256 with
 * timestamp freshness and nonce replay protection. This is a fresh
 * implementation (not a reused import) because it authenticates a distinct
 * caller (AWS -> this endpoint) with its own secret,
 * STRATXCEL_AGENT_CHANNEL_SECRET — NEVER SUPABASE_SERVICE_ROLE_KEY, and never
 * logged.
 *
 * Nonce replay protection here is the same "fail-closed, in-process cache is
 * a fast-path defense, the real durable defense is a DB-level uniqueness
 * constraint" shape as the legacy-bridge precedent: durable idempotency for
 * this endpoint is providerMessageId uniqueness on agent_runs (see
 * sessions/repository.ts startAgentRun), not this in-memory nonce cache
 * alone — the cache exists to reject replay cheaply before hitting the DB.
 */

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const NONCE_TTL_MS = 10 * 60 * 1000;
const NONCE_CACHE_MAX = 10_000;

const seenNonces = new Map<string, number>();

function pruneNonceCache(nowMs: number): void {
  if (seenNonces.size <= NONCE_CACHE_MAX) return;
  for (const [nonce, expiry] of seenNonces) {
    if (expiry <= nowMs) seenNonces.delete(nonce);
  }
}

export interface VerifyAgentChannelRequestInput {
  rawBody: string;
  timestampHeader: string | null;
  nonceHeader: string | null;
  signatureHeader: string | null;
}

export type VerifyAgentChannelRequestResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "missing_headers" | "bad_signature" | "stale_timestamp" | "replayed_nonce" };

/** Canonical signed string, matching the shape the caller (AWS) must build:
 *  `${timestamp}.${nonce}.${sha256(rawBody)}` */
function canonicalMessage(timestamp: string, nonce: string, rawBody: string): string {
  const bodyDigest = createHash("sha256").update(rawBody, "utf8").digest("hex");
  return `${timestamp}.${nonce}.${bodyDigest}`;
}

export function verifyAgentChannelRequest(input: VerifyAgentChannelRequestInput): VerifyAgentChannelRequestResult {
  const secret = process.env.STRATXCEL_AGENT_CHANNEL_SECRET;
  if (!secret) return { ok: false, reason: "not_configured" };

  if (!input.timestampHeader || !input.nonceHeader || !input.signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  const timestampSeconds = Number(input.timestampHeader);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: "stale_timestamp" };
  const nowSeconds = Date.now() / 1000;
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const message = canonicalMessage(input.timestampHeader, input.nonceHeader, input.rawBody);
  const expectedSignature = createHmac("sha256", secret).update(message, "utf8").digest("hex");

  const provided = Buffer.from(input.signatureHeader, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  // Only burn a nonce slot after every other check passed, so a rejected
  // request can be legitimately retried with the same nonce.
  const nowMs = Date.now();
  pruneNonceCache(nowMs);
  const existingExpiry = seenNonces.get(input.nonceHeader);
  if (existingExpiry && existingExpiry > nowMs) {
    return { ok: false, reason: "replayed_nonce" };
  }
  seenNonces.set(input.nonceHeader, nowMs + NONCE_TTL_MS);

  return { ok: true };
}

/** Exposed for tests only, to reset in-process nonce cache between cases. */
export function __resetNonceCacheForTests(): void {
  seenNonces.clear();
}

/**
 * Counterpart to verifyAgentChannelRequest() — builds the headers a caller
 * (the WhatsApp worker) must send. Shares the exact same canonicalization
 * logic so the two sides can never silently drift apart. Returns null if
 * STRATXCEL_AGENT_CHANNEL_SECRET is not configured (fail closed — the
 * caller must not send an unsigned/garbage request).
 */
export function buildAgentChannelSignature(
  rawBody: string
): { timestamp: string; nonce: string; signature: string } | null {
  const secret = process.env.STRATXCEL_AGENT_CHANNEL_SECRET;
  if (!secret) return null;

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = createHash("sha256").update(`${timestamp}:${Math.random()}:${rawBody.length}`).digest("hex").slice(0, 32);
  const message = canonicalMessage(timestamp, nonce, rawBody);
  const signature = createHmac("sha256", secret).update(message, "utf8").digest("hex");

  return { timestamp, nonce, signature };
}
