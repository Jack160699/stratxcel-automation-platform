export type IntegrationMode = "disabled" | "shadow" | "live";

const VALID_MODES: readonly IntegrationMode[] = ["disabled", "shadow", "live"];

/**
 * Own copy of the same flag-resolution logic used by
 * @stratxcel/payments-and-wallet — deliberately duplicated (12 lines)
 * rather than introducing a shared "integrations-core" package neither the
 * master brief nor Phase 3's package list asked for.
 */
export function getIntegrationMode(envVarName: string): IntegrationMode {
  const raw = process.env[envVarName];
  if (raw && VALID_MODES.includes(raw as IntegrationMode)) return raw as IntegrationMode;
  return "disabled";
}

/**
 * Fourth independent cutover control, distinct from WHATSAPP_INTEGRATION_MODE
 * (which gates whether a send touches the real Meta network vs. shadow-logs
 * it) and from binding.inbound_enabled/outbound_enabled (which gate the data
 * pipeline itself). This one specifically gates whether the STANDALONE
 * WORKER is allowed to originate an automatic reply at all — human/dashboard
 * sends (app/api/platform/whatsapp/send/route.ts) never read this flag and
 * are unaffected by it. Fails closed: missing, empty, or any value other
 * than the exact string "true" is treated as disabled — there is no partial
 * or truthy-string acceptance, so a typo in an env file can never
 * accidentally turn this on.
 */
export function isAutoReplyEnabled(): boolean {
  return process.env.WHATSAPP_AUTO_REPLY_ENABLED === "true";
}
