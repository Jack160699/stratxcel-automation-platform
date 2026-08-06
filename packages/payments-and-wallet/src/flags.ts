export type IntegrationMode = "disabled" | "shadow" | "test" | "live";

const VALID_MODES: readonly IntegrationMode[] = ["disabled", "shadow", "test", "live"];

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

export function getRazorpayCredentials(mode = getIntegrationMode("RAZORPAY_INTEGRATION_MODE")) {
  if (mode !== "test" && mode !== "live") return null;
  const keyId = mode === "test" ? process.env.RAZORPAY_TEST_KEY_ID : process.env.RAZORPAY_KEY_ID;
  const keySecret = mode === "test" ? process.env.RAZORPAY_TEST_KEY_SECRET : process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error(`Razorpay ${mode} credentials are missing`);
  return { keyId, keySecret, mode } as const;
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
