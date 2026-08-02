import crypto from "node:crypto";

/**
 * Razorpay signs webhook deliveries with HMAC-SHA256 of the raw request
 * body, keyed by the webhook secret configured in the Razorpay dashboard,
 * hex-encoded in the X-Razorpay-Signature header (no "sha256=" prefix,
 * unlike Meta's convention — a real difference between the two providers,
 * not an inconsistency in this code).
 * https://razorpay.com/docs/webhooks/validate-test/
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): boolean {
  if (!signatureHeader || !webhookSecret) return false;

  const expectedHex = crypto.createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");

  const provided = Buffer.from(signatureHeader, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}
