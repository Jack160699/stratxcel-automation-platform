import { createHash } from "node:crypto";

const EMAIL_RE =
  /^(?=.{3,254}$)(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const PLACEHOLDER_LOCALS = new Set([
  "example",
  "test",
  "user",
  "noreply",
  "no-reply",
  "null",
  "undefined",
  "placeholder",
  "fake",
  "sample",
]);

const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "localhost",
  "invalid",
  "email.com",
  "mailinator.com",
]);

const SECRET_LOOKING = /^(sk_|rk_|whsec_|Bearer\s|eyJ|-----BEGIN)/i;

export type RecipientValidationFailure =
  | "empty"
  | "malformed"
  | "header_injection"
  | "placeholder"
  | "secret_looking"
  | "too_long";

export interface RecipientValidationResult {
  ok: true;
  normalized: string;
  hash: string;
}

export interface RecipientValidationError {
  ok: false;
  reason: RecipientValidationFailure;
}

export function hashRecipient(normalized: string): string {
  return createHash("sha256").update(normalized.toLowerCase()).digest("hex");
}

function hasHeaderInjection(value: string): boolean {
  return /[\r\n\0]/.test(value);
}

/**
 * Normalize + validate a recipient. Production rejects obvious placeholders
 * unless allowTestRecipients is true (explicit test mode).
 */
export function validateRecipient(
  raw: string | null | undefined,
  options: { allowTestRecipients?: boolean } = {}
): RecipientValidationResult | RecipientValidationError {
  if (raw == null || String(raw).trim() === "") {
    return { ok: false, reason: "empty" };
  }

  const trimmed = String(raw).trim();
  if (trimmed.length > 254) return { ok: false, reason: "too_long" };
  if (hasHeaderInjection(trimmed)) return { ok: false, reason: "header_injection" };
  if (SECRET_LOOKING.test(trimmed)) return { ok: false, reason: "secret_looking" };

  const normalized = trimmed.toLowerCase();
  if (!EMAIL_RE.test(normalized)) return { ok: false, reason: "malformed" };

  const [local, domain] = normalized.split("@");
  if (!options.allowTestRecipients) {
    if (PLACEHOLDER_LOCALS.has(local) || PLACEHOLDER_DOMAINS.has(domain)) {
      return { ok: false, reason: "placeholder" };
    }
    if (domain.endsWith(".test") || domain.endsWith(".local") || domain.endsWith(".invalid")) {
      return { ok: false, reason: "placeholder" };
    }
  }

  return { ok: true, normalized, hash: hashRecipient(normalized) };
}

/** Strip CR/LF from subject / display-name / reply-to to prevent header injection. */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\0]+/g, " ").trim();
}

export function assertSafeHeaderValue(value: string, field: string): string {
  if (hasHeaderInjection(value)) {
    throw new Error(`HEADER_INJECTION:${field}`);
  }
  return sanitizeHeaderValue(value);
}
