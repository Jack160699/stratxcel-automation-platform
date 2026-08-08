import { getRegistrarMode } from "./flags.ts";
import { createDisabledDomainRegistrar } from "./disabled.ts";
import { SandboxDomainRegistrar } from "./sandbox.ts";
import type { DomainRegistrarAdapter } from "./adapter.ts";

/**
 * Reads DOMAIN_REGISTRAR_MODE and returns the matching adapter. No "live"
 * adapter is implemented — no real registrar account/API credentials exist
 * anywhere in this repository (see infrastructure/workers-style runbook
 * note for the one owner action this is pending on). Requesting 'live'
 * fails closed to the disabled adapter rather than silently falling back to
 * sandbox, so a misconfiguration can never look like it's issuing real
 * quotes.
 */
export function selectDomainRegistrar(): DomainRegistrarAdapter {
  const mode = getRegistrarMode();
  if (mode === "sandbox") return new SandboxDomainRegistrar();
  return createDisabledDomainRegistrar();
}
