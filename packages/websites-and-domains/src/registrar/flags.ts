export type RegistrarMode = "disabled" | "sandbox" | "live";

const VALID_MODES: readonly RegistrarMode[] = ["disabled", "sandbox", "live"];

/**
 * Same fail-safe pattern as RAZORPAY_INTEGRATION_MODE / HERMES_MODE — an
 * unset or unrecognized env var always resolves to "disabled", never to an
 * unintended live registrar call. "sandbox" returns clearly-labeled
 * simulated data for building/testing the pipeline; "live" requires real
 * registrar credentials this repository does not have configured anywhere.
 */
export function getRegistrarMode(): RegistrarMode {
  const raw = process.env.DOMAIN_REGISTRAR_MODE;
  if (raw && VALID_MODES.includes(raw as RegistrarMode)) return raw as RegistrarMode;
  return "disabled";
}
