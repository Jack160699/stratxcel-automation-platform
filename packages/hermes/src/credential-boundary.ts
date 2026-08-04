/**
 * Structural enforcement of docs/hermes/SECRETS_AND_SECURITY.md's core
 * rule: Hermes never holds a raw production credential for any external
 * system Stratxcel manages on a tenant's behalf. This module doesn't
 * implement the Stratxcel MCP tool server (still design-only, per that
 * doc) — it's the "no new server" enforcement point this phase can ship:
 * a real, testable guard that scans any object about to cross the
 * Stratxcel<->Hermes boundary (mission context, tool input, tool output)
 * for values shaped like the forbidden credential kinds, and throws
 * rather than silently letting one through. Defense-in-depth alongside,
 * not instead of, "we simply never put these values in the context/tool
 * result objects in the first place."
 */

export type ForbiddenCredentialKind =
  | "supabase_service_role"
  | "vercel_token"
  | "github_owner_token"
  | "meta_whatsapp_token"
  | "razorpay_secret"
  | "production_ssh_key"
  | "docker_socket";

export const FORBIDDEN_CREDENTIAL_KINDS: readonly ForbiddenCredentialKind[] = [
  "supabase_service_role",
  "vercel_token",
  "github_owner_token",
  "meta_whatsapp_token",
  "razorpay_secret",
  "production_ssh_key",
  "docker_socket",
];

export class ForbiddenCredentialError extends Error {
  constructor(kind: ForbiddenCredentialKind, path: string) {
    super(`Refusing to send a value shaped like a ${kind} credential to Hermes (found at "${path}")`);
    this.name = "ForbiddenCredentialError";
  }
}

/** Key-name patterns — catches an accidentally-included field regardless of its value's shape. */
const FORBIDDEN_KEY_PATTERNS: Array<{ kind: ForbiddenCredentialKind; pattern: RegExp }> = [
  { kind: "supabase_service_role", pattern: /service[_-]?role/i },
  { kind: "vercel_token", pattern: /vercel[_-]?(token|api[_-]?key)/i },
  { kind: "github_owner_token", pattern: /github[_-]?(token|pat)/i },
  { kind: "meta_whatsapp_token", pattern: /(meta|whatsapp)[_-]?(token|access[_-]?token)/i },
  { kind: "razorpay_secret", pattern: /razorpay[_-]?(key[_-]?secret|secret)/i },
  { kind: "production_ssh_key", pattern: /ssh[_-]?(private[_-]?)?key/i },
  { kind: "docker_socket", pattern: /docker\.sock|docker[_-]?socket/i },
];

/** Value-content patterns — catches a forbidden credential even under an innocuous key name. */
const FORBIDDEN_VALUE_PATTERNS: Array<{ kind: ForbiddenCredentialKind; pattern: RegExp }> = [
  { kind: "github_owner_token", pattern: /^gh[pousr]_[A-Za-z0-9]{20,}$/ },
  { kind: "production_ssh_key", pattern: /-----BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY-----/ },
  { kind: "docker_socket", pattern: /\/var\/run\/docker\.sock/ },
];

function checkKey(key: string, path: string): void {
  for (const { kind, pattern } of FORBIDDEN_KEY_PATTERNS) {
    if (pattern.test(key)) throw new ForbiddenCredentialError(kind, path);
  }
}

function checkValue(value: string, path: string): void {
  for (const { kind, pattern } of FORBIDDEN_VALUE_PATTERNS) {
    if (pattern.test(value)) throw new ForbiddenCredentialError(kind, path);
  }
}

/**
 * Recursively scans a plain-data object (JSON-shaped: object/array/string/
 * number/boolean/null) for anything matching a forbidden credential kind,
 * by key name or by value content. Throws ForbiddenCredentialError on the
 * first match. Intended for context bundles and tool call inputs/outputs
 * — not a general-purpose secret scanner, and not a substitute for never
 * constructing these values in the first place.
 */
export function assertNoForbiddenCredentials(value: unknown, path = "$"): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    checkValue(value, path);
    return;
  }
  if (typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoForbiddenCredentials(item, `${path}[${i}]`));
    return;
  }

  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    checkKey(key, `${path}.${key}`);
    assertNoForbiddenCredentials(val, `${path}.${key}`);
  }
}
