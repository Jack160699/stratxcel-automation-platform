import { createHash, randomBytes } from "node:crypto";

export const AUDIT_GO_FREE_LIST_PRICE_CENTS = 99900;
export const AUDIT_GO_FREE_PRODUCT_SCOPE = "audit_fee" as const;
export const AUDIT_GO_FREE_PAYMENT_PURPOSE = "audit_fee" as const;

export const SUBSCRIPTION_GO_FREE_PRODUCT_SCOPE = "subscription_payment" as const;
export const SUBSCRIPTION_GO_FREE_PAYMENT_PURPOSE = "subscription_payment" as const;

export type PromoPublicError =
  | "This code is invalid."
  | "This code has expired."
  | "This code has already been used."
  | "This code isn't available for this product."
  | "This plan isn't available for GoFree activation."
  | "This workspace already has an active plan.";

const PUBLIC_MESSAGES: Record<string, PromoPublicError> = {
  invalid_code: "This code is invalid.",
  disabled: "This code is invalid.",
  not_yet_valid: "This code is invalid.",
  email_restricted: "This code is invalid.",
  order_not_found: "This code is invalid.",
  cross_tenant: "This code is invalid.",
  order_not_payable: "This code is invalid.",
  fee_mismatch: "This code is invalid.",
  order_email_mismatch: "This code is invalid.",
  invalid_email: "This code is invalid.",
  invalid_list_price: "This code is invalid.",
  missing_order: "This code is invalid.",
  missing_idempotency_key: "This code is invalid.",
  missing_tenant: "This code is invalid.",
  tenant_not_found: "This code is invalid.",
  price_mismatch: "This code is invalid.",
  expired: "This code has expired.",
  max_uses: "This code has already been used.",
  per_customer_limit: "This code has already been used.",
  wrong_product: "This code isn't available for this product.",
  subscription_payment: "This code isn't available for this product.",
  audit_fee: "This code isn't available for this product.",
  plan_not_self_checkout: "This plan isn't available for GoFree activation.",
  tenant_already_has_subscription: "This workspace already has an active plan.",
};

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashPromoCode(normalizedCode: string): string {
  return createHash("sha256").update(`stratxcel:go-free:v1:${normalizedCode}`, "utf8").digest("hex");
}

export function promoCodePrefix(normalizedCode: string): string {
  if (normalizedCode.length <= 8) return normalizedCode.slice(0, 4) || "CODE";
  return `${normalizedCode.slice(0, 5)}…`;
}

/** Cryptographically secure AUDIT-XXXX-XXXX style codes. */
export function generateAuditGoFreeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let left = "";
  let right = "";
  for (let i = 0; i < 4; i++) left += alphabet[bytes[i]! % alphabet.length];
  for (let i = 4; i < 8; i++) right += alphabet[bytes[i]! % alphabet.length];
  return `AUDIT-${left}-${right}`;
}

/** Cryptographically secure SUB-XXXX-XXXX style codes for subscription GoFree trials. */
export function generateSubscriptionGoFreeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let left = "";
  let right = "";
  for (let i = 0; i < 4; i++) left += alphabet[bytes[i]! % alphabet.length];
  for (let i = 4; i < 8; i++) right += alphabet[bytes[i]! % alphabet.length];
  return `SUB-${left}-${right}`;
}

export function publicPromoMessage(reason: string | null | undefined): PromoPublicError {
  if (!reason) return "This code is invalid.";
  return PUBLIC_MESSAGES[reason] ?? "This code is invalid.";
}

export { isAuditCreditProvenanceEligible } from "@stratxcel/payments-and-wallet";

export function isPromoFundedAudit(order: {
  fulfilment_source?: string | null;
  actual_paid_cents?: number | null;
}): boolean {
  return order.fulfilment_source === "promo" || order.actual_paid_cents === 0;
}

export function isCustomPromoCodeFormat(normalized: string): boolean {
  return /^[A-Z0-9][A-Z0-9_-]{2,47}$/.test(normalized);
}
