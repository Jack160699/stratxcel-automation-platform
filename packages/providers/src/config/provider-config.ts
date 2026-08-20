/**
 * Centralized Provider Configuration & Unified Health Assessment
 */

import { aiRouter } from "../ai/mock-adapter.ts";
import { mockImageProvider } from "../images/interface.ts";
import { mockResearchProvider } from "../research/interface.ts";
import { mockEmailProvider } from "../email/interface.ts";
import { mockPaymentProvider } from "../payments/interface.ts";
import { mockDomainProvider } from "../domains/interface.ts";
import { mockDNSProvider } from "../dns/interface.ts";
import { mockHostingProvider } from "../hosting/interface.ts";
import { mockStorageProvider } from "../storage/interface.ts";
import type { CapabilityHealthResult, SystemHealthReport } from "./health.ts";

export interface ProviderRegistryConfig {
  ai: typeof aiRouter;
  images: typeof mockImageProvider;
  research: typeof mockResearchProvider;
  email: typeof mockEmailProvider;
  payments: typeof mockPaymentProvider;
  domains: typeof mockDomainProvider;
  dns: typeof mockDNSProvider;
  hosting: typeof mockHostingProvider;
  storage: typeof mockStorageProvider;
}

export class ProviderManager {
  public providers: ProviderRegistryConfig = {
    ai: aiRouter,
    images: mockImageProvider,
    research: mockResearchProvider,
    email: mockEmailProvider,
    payments: mockPaymentProvider,
    domains: mockDomainProvider,
    dns: mockDNSProvider,
    hosting: mockHostingProvider,
    storage: mockStorageProvider,
  };

  /**
   * Evaluates health and readiness across all 9 provider capabilities safely.
   */
  public async evaluateSystemHealth(): Promise<SystemHealthReport> {
    const checks: CapabilityHealthResult[] = await Promise.all([
      this.providers.images.healthCheck(),
      this.providers.research.healthCheck(),
      this.providers.email.healthCheck(),
      this.providers.payments.healthCheck(),
      this.providers.domains.healthCheck(),
      this.providers.dns.healthCheck(),
      this.providers.hosting.healthCheck(),
      this.providers.storage.healthCheck(),
    ]);

    const capabilities: Record<string, CapabilityHealthResult> = {};
    let allReady = true;

    for (const check of checks) {
      capabilities[check.capability] = check;
      if (!check.isReady) {
        allReady = false;
      }
    }

    return {
      overallStatus: allReady ? "READY" : "DEGRADED",
      isReadyForLiveOperations: allReady,
      capabilities,
      checkedAt: new Date().toISOString(),
    };
  }
}

export const providerManager = new ProviderManager();
