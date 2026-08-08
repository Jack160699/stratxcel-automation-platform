import { RegistrarDisabledError, type DomainRegistrarAdapter } from "./adapter.ts";

/**
 * The safe default whenever DOMAIN_REGISTRAR_MODE is unset — every method
 * refuses cleanly rather than fabricating availability, a price, or a
 * registration success. No real registrar is configured anywhere in this
 * repository; this is what every domain route falls back to until one is.
 */
export function createDisabledDomainRegistrar(): DomainRegistrarAdapter {
  return {
    providerName: "disabled",
    mode: "disabled",
    async searchDomain(): Promise<never> {
      throw new RegistrarDisabledError();
    },
    async getDomainPrice(): Promise<never> {
      throw new RegistrarDisabledError();
    },
    async registerDomain(): Promise<never> {
      throw new RegistrarDisabledError();
    },
    async renewDomain(): Promise<never> {
      throw new RegistrarDisabledError();
    },
    async getDomainStatus(): Promise<never> {
      throw new RegistrarDisabledError();
    },
    async setupDnsRecords(): Promise<never> {
      throw new RegistrarDisabledError();
    },
  };
}
