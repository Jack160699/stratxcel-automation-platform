export type IntegrationMode = "disabled" | "shadow" | "live";

const VALID_MODES: readonly IntegrationMode[] = ["disabled", "shadow", "live"];

/**
 * Every migrated legacy integration (WhatsApp, Razorpay, CRM) is gated by
 * one of these env vars, defaulting to "disabled" when unset. This is the
 * mechanism behind the migration plan's "keep disabled/shadow until parity
 * and owner approval" rule — flipping a real integration live requires an
 * explicit env var change on the deployment, never a code change, so a
 * default deploy of this branch can never accidentally start sending real
 * WhatsApp messages or hitting the live Razorpay API.
 */
export function getIntegrationMode(envVarName: string): IntegrationMode {
  const raw = process.env[envVarName];
  if (raw && VALID_MODES.includes(raw as IntegrationMode)) return raw as IntegrationMode;
  return "disabled";
}
