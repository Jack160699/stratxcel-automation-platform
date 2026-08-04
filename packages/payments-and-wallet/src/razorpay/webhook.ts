import crypto from "node:crypto";

/**
 * Razorpay signs webhook deliveries with HMAC-SHA256 of the raw request
 * body, keyed by the webhook secret configured in the Razorpay dashboard,
 * hex-encoded in the X-Razorpay-Signature header (no "sha256=" prefix).
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

/**
 * Verifies the signature appended to customer redirect callback URLs for Razorpay Payment Links.
 * Formula: HMAC-SHA256(payment_link_id + "|" + payment_link_reference_id + "|" + payment_link_status + "|" + payment_id, secret)
 */
export function verifyRazorpayCallbackSignature(params: {
  paymentLinkId: string;
  paymentLinkReferenceId: string;
  paymentLinkStatus: string;
  paymentId: string;
  signature: string;
  secret: string;
}): boolean {
  if (!params.signature || !params.secret) return false;

  const payload = `${params.paymentLinkId}|${params.paymentLinkReferenceId}|${params.paymentLinkStatus}|${params.paymentId}`;
  const expectedHex = crypto.createHmac("sha256", params.secret).update(payload, "utf8").digest("hex");

  const provided = Buffer.from(params.signature, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}
