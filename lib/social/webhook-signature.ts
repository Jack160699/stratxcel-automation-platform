import crypto from "node:crypto";

/**
 * Verifies Meta's X-Hub-Signature-256 header: HMAC-SHA256 of the raw request
 * body, keyed by the receiving app's secret, hex-encoded and prefixed
 * "sha256=". Must run against the raw (unparsed) body — re-serializing JSON
 * before hashing would produce a different signature than Meta computed.
 * https://developers.facebook.com/docs/messenger-platform/webhooks#security
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [scheme, providedHex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !providedHex) return false;

  const expectedHex = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const provided = Buffer.from(providedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

/** Provider -> the app secret env var that signs its webhook deliveries. */
export function getWebhookAppSecret(provider: string): string | null {
  switch (provider) {
    case "instagram":
      return process.env.META_INSTAGRAM_APP_SECRET ?? null;
    case "facebook":
      return process.env.META_APP_SECRET ?? null;
    case "threads":
      return process.env.META_THREADS_APP_SECRET ?? null;
    default:
      return null;
  }
}
