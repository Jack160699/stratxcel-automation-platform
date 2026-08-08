import type {
  DomainRegistrarAdapter,
  DomainSearchResult,
  DomainRegistrationInput,
  DomainRegistrationResult,
  DomainRenewalResult,
  DomainStatusResult,
  DnsRecord,
} from "./adapter.ts";

/**
 * Deterministic fake registrar — no real network call, no real domain is
 * ever registered. Exists to exercise the full purchase/registration/DNS/
 * renewal pipeline end to end in tests and safe internal smoke checks. Every
 * result it returns is clearly attributable to `providerName === "sandbox"`
 * so it can never be mistaken for a real registrar response downstream.
 */
export class SandboxDomainRegistrar implements DomainRegistrarAdapter {
  readonly providerName = "sandbox";
  readonly mode = "sandbox" as const;

  async searchDomain(domainName: string): Promise<DomainSearchResult> {
    const cleanDomain = domainName.toLowerCase().trim();
    const isAvailable = !cleanDomain.includes("taken");
    return {
      domainName: cleanDomain,
      available: isAvailable,
      priceCents: 99900, // ₹999.00 / year standard
      currency: "INR",
      renewalPriceCents: 119900, // ₹1,199.00 / year renewal
    };
  }

  async getDomainPrice(domainName: string): Promise<DomainSearchResult> {
    return this.searchDomain(domainName);
  }

  async registerDomain(input: DomainRegistrationInput): Promise<DomainRegistrationResult> {
    if (!input.registrant || !input.registrant.name || !input.registrant.email) {
      throw new Error("Client legal registrant details (name, email) are mandatory for domain registration");
    }

    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const providerDomainId = `sb_dom_${Date.now()}`;

    const defaultDnsRecords: DnsRecord[] = [
      { type: "A", name: "@", value: "76.76.21.21", ttl: 3600 },
      { type: "CNAME", name: "www", value: "cname.vercel-dns.com", ttl: 3600 },
    ];

    return {
      success: true,
      domainName: input.domainName,
      provider: this.providerName,
      providerDomainId,
      status: "active",
      expiresAt,
      dnsRecords: defaultDnsRecords,
    };
  }

  async renewDomain(domainName: string, years = 1): Promise<DomainRenewalResult> {
    return {
      success: true,
      domainName,
      provider: this.providerName,
      expiresAt: new Date(Date.now() + years * 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async getDomainStatus(domainName: string): Promise<DomainStatusResult> {
    return {
      domainName,
      status: "active",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      autoRenew: true,
      dnsConfigured: true,
    };
  }

  async setupDnsRecords(_domainName: string, _records: DnsRecord[]): Promise<boolean> {
    return true;
  }
}
