/**
 * Domain Provider Interface & Mock Adapter
 */

import type { CapabilityHealthResult } from "../config/health.ts";

export interface CheckAvailabilityInput {
  domain: string;
}

export interface DomainQuoteInput {
  domain: string;
  periodYears?: number;
}

export interface DomainQuoteResult {
  domain: string;
  available: boolean;
  priceCents: number;
  currency: string;
  periodYears: number;
  expiresAt: string;
}

export interface RegisterDomainInput {
  tenantId: string;
  projectId: string;
  domain: string;
  registrantInfo: {
    name: string;
    email: string;
    phone: string;
    country: string;
  };
  periodYears?: number;
  confirmed: boolean;
}

export interface DomainRegistrationResult {
  domain: string;
  status: "REGISTERED" | "PENDING" | "FAILED";
  providerReference: string;
  expiresAt: string;
  provider: string;
}

export interface DomainProvider {
  name: string;
  checkAvailability: (input: CheckAvailabilityInput) => Promise<{ domain: string; available: boolean }>;
  getQuote: (input: DomainQuoteInput) => Promise<DomainQuoteResult>;
  registerDomain: (input: RegisterDomainInput) => Promise<DomainRegistrationResult>;
  healthCheck: () => Promise<CapabilityHealthResult>;
}

export class MockDomainProvider implements DomainProvider {
  public name = "mock_registrar";

  public async checkAvailability(input: CheckAvailabilityInput): Promise<{ domain: string; available: boolean }> {
    return { domain: input.domain, available: !input.domain.includes("taken") };
  }

  public async getQuote(input: DomainQuoteInput): Promise<DomainQuoteResult> {
    return {
      domain: input.domain,
      available: true,
      priceCents: 119900, // ₹1,199
      currency: "INR",
      periodYears: input.periodYears || 1,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  public async registerDomain(input: RegisterDomainInput): Promise<DomainRegistrationResult> {
    if (!input.confirmed) {
      throw new Error("Cannot register domain without explicit customer confirmation");
    }
    return {
      domain: input.domain,
      status: "REGISTERED",
      providerReference: `dom_ref_${Date.now()}`,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      provider: this.name,
    };
  }

  public async healthCheck(): Promise<CapabilityHealthResult> {
    return {
      capability: "domains",
      provider: this.name,
      status: "READY",
      isReady: true,
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const mockDomainProvider = new MockDomainProvider();
