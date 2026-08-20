/**
 * 9-Point Domain Purchase Protection & Safety Validator
 *
 * Every domain purchase MUST satisfy all 9 criteria before any
 * external registrar call is initiated:
 *   1. Authenticated customer (User ID present)
 *   2. Correct tenant scoping (Tenant ID verified)
 *   3. Explicit purchase confirmation (User explicitly confirmed checkout)
 *   4. Current server-side quote (No client-manipulated prices)
 *   5. Verified payment reference (Payment order confirmed by webhook)
 *   6. Unique idempotency key (Prevents duplicate charges/registrations)
 *   7. Valid legal registrant info (Name, email, phone, country)
 *   8. Supported TLD (Validated against permitted registry list)
 *   9. Quote window valid (Quote created within last 15 minutes)
 */

export const SUPPORTED_TLDS = new Set([
  "com",
  "in",
  "co.in",
  "org",
  "net",
  "io",
  "ai",
  "co",
  "store",
  "shop",
  "online",
  "site",
  "tech",
  "app",
  "dev",
]);

export interface DomainPurchaseRequest {
  userId: string;
  tenantId: string;
  domainName: string;
  customerConfirmed: boolean;
  serverQuoteCents: number;
  serverQuoteCurrency: string;
  quoteTimestampMs: number;
  paymentOrderId: string;
  paymentVerified: boolean;
  idempotencyKey: string;
  registrant: {
    name: string;
    email: string;
    phone: string;
    country: string;
    organization?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
}

export interface PurchaseValidationResult {
  valid: boolean;
  errors: string[];
  normalizedDomain: string;
  tld: string;
}

const MAX_QUOTE_AGE_MS = 15 * 60 * 1000; // 15 minutes

export function validateDomainPurchaseCriteria(req: DomainPurchaseRequest): PurchaseValidationResult {
  const errors: string[] = [];

  // 1. Authenticated User
  if (!req.userId || typeof req.userId !== "string" || req.userId.trim().length === 0) {
    errors.push("Authenticated customer ID is required.");
  }

  // 2. Tenant Scoping
  if (!req.tenantId || typeof req.tenantId !== "string" || req.tenantId.trim().length === 0) {
    errors.push("Tenant ID is required.");
  }

  // 3. Explicit Customer Confirmation
  if (req.customerConfirmed !== true) {
    errors.push("Explicit customer purchase confirmation is required. Domains cannot be auto-purchased.");
  }

  // Normalize Domain & Extract TLD
  const normalizedDomain = (req.domainName || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const parts = normalizedDomain.split(".");
  const tld = parts.length > 2 && parts[parts.length - 2] === "co"
    ? `co.${parts[parts.length - 1]}`
    : parts[parts.length - 1] || "";

  // 8. Supported TLD
  if (!normalizedDomain || parts.length < 2 || !SUPPORTED_TLDS.has(tld)) {
    errors.push(`Invalid or unsupported domain extension '.${tld}'. Supported TLDs: ${Array.from(SUPPORTED_TLDS).slice(0, 8).join(", ")}, etc.`);
  }

  // 4. Server-Side Quote
  if (!req.serverQuoteCents || req.serverQuoteCents <= 0) {
    errors.push("Valid server-side quote price is required.");
  }

  // 9. Quote Validity Window
  const quoteAge = Date.now() - req.quoteTimestampMs;
  if (isNaN(req.quoteTimestampMs) || quoteAge > MAX_QUOTE_AGE_MS || quoteAge < -60_000) {
    errors.push("Domain price quote has expired (15-minute window). Please refresh domain search.");
  }

  // 5. Payment Verification
  if (!req.paymentOrderId || req.paymentVerified !== true) {
    errors.push("Verified payment order is required before domain registration.");
  }

  // 6. Idempotency Key
  if (!req.idempotencyKey || req.idempotencyKey.trim().length === 0) {
    errors.push("Idempotency key is required to prevent double registration.");
  }

  // 7. Legal Registrant Details
  if (!req.registrant || !req.registrant.name?.trim()) {
    errors.push("Legal registrant name is mandatory for ICANN domain ownership.");
  }
  if (!req.registrant?.email?.trim() || !req.registrant.email.includes("@")) {
    errors.push("Valid legal registrant email is required.");
  }
  if (!req.registrant?.phone?.trim() || req.registrant.phone.replace(/\D/g, "").length < 7) {
    errors.push("Valid legal registrant phone number is required.");
  }
  if (!req.registrant?.country?.trim()) {
    errors.push("Legal registrant country code is required.");
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedDomain,
    tld,
  };
}
