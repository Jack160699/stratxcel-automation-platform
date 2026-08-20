import { getRegistrarMode } from "./flags.ts";
import { createDisabledDomainRegistrar } from "./disabled.ts";
import { SandboxDomainRegistrar } from "./sandbox.ts";
import { ProductionDomainRegistrar } from "./production.ts";
import type { DomainRegistrarAdapter } from "./adapter.ts";

/**
 * Reads DOMAIN_REGISTRAR_MODE and returns the matching adapter.
 * When 'live' is configured, returns ProductionDomainRegistrar if credentials exist,
 * or fails closed to createDisabledDomainRegistrar() rather than silently falling back to sandbox.
 */
export function selectDomainRegistrar(): DomainRegistrarAdapter {
  const mode = getRegistrarMode();
  if (mode === "sandbox") return new SandboxDomainRegistrar();
  if (mode === "live") {
    const hasKey = Boolean(process.env.DOMAIN_REGISTRAR_API_KEY?.trim());
    const hasSecret = Boolean(process.env.DOMAIN_REGISTRAR_API_SECRET?.trim());
    if (hasKey && hasSecret) {
      return new ProductionDomainRegistrar();
    }
  }
  return createDisabledDomainRegistrar();
}

