/**
 * Hosting provider selection — same fail-safe pattern as the domain
 * registrar (DOMAIN_REGISTRAR_MODE). An unset or unrecognized env var
 * resolves to the sandbox provider, never to an unintended production
 * deployment.
 */

import type { HostingProviderAdapter } from "./adapter.ts";
import { HostingProviderDisabledError } from "./adapter.ts";
import { VercelHostingProvider } from "./vercel.ts";
import { SandboxHostingProvider } from "./sandbox.ts";

export type HostingProviderMode = "disabled" | "sandbox" | "live";

const VALID_MODES: readonly HostingProviderMode[] = ["disabled", "sandbox", "live"];

export function getHostingProviderMode(): HostingProviderMode {
  const raw = process.env.HOSTING_PROVIDER_MODE;
  if (raw && VALID_MODES.includes(raw as HostingProviderMode)) return raw as HostingProviderMode;
  return "sandbox";
}

function createDisabledHostingProvider(): HostingProviderAdapter {
  return {
    providerName: "disabled",
    mode: "disabled",
    async deploy(): Promise<never> { throw new HostingProviderDisabledError(); },
    async getDeploymentStatus(): Promise<never> { throw new HostingProviderDisabledError(); },
    async assignCustomDomain(): Promise<never> { throw new HostingProviderDisabledError(); },
    async getDomainStatus(): Promise<never> { throw new HostingProviderDisabledError(); },
    async getDeploymentUrl(): Promise<never> { throw new HostingProviderDisabledError(); },
    async redeploy(): Promise<never> { throw new HostingProviderDisabledError(); },
    async suspend(): Promise<never> { throw new HostingProviderDisabledError(); },
  };
}

export function selectHostingProvider(): HostingProviderAdapter {
  const mode = getHostingProviderMode();
  if (mode === "live") return new VercelHostingProvider();
  if (mode === "sandbox") return new SandboxHostingProvider();
  return createDisabledHostingProvider();
}
