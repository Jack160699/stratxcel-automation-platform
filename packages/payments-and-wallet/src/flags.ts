export type IntegrationMode = "disabled" | "shadow" | "live";

const VALID_MODES: readonly IntegrationMode[] = ["disabled", "shadow", "live"];

/**
 * Own copy of the same flag-resolution logic used by @stratxcel/whatsapp —
 * deliberately duplicated (12 lines) rather than introducing a shared
 * "integrations-core" package neither the master brief nor Phase 3's
 * package list asked for.
 */
export function getIntegrationMode(envVarName: string): IntegrationMode {
  const raw = process.env[envVarName];
  if (raw && VALID_MODES.includes(raw as IntegrationMode)) return raw as IntegrationMode;
  return "disabled";
}

export type PaymentFeatureFlag =
  | "PAYMENTS_SUBSCRIPTIONS_ENABLED"
  | "PAYMENTS_AUDIT_ENABLED"
  | "PAYMENTS_CONTINUATION_PACKS_ENABLED"
  | "PAYMENTS_DOMAINS_ENABLED";

/**
 * Evaluates payment feature flags for immediate safety state.
 * Returns false unless explicitly set to "true".
 */
export function isPaymentFeatureEnabled(flag: PaymentFeatureFlag): boolean {
  return process.env[flag] === "true";
}
