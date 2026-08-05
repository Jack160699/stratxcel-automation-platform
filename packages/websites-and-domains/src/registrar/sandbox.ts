import type {
  DomainRegistrarAdapter,
  DomainSearchResult,
  DomainRegistrationInput,
  DomainRegistrationResult,
  DomainStatusResult,
  DnsRecord,
} from "./adapter.ts";

export class SandboxDomainRegistrar implements DomainRegistrarAdapter {
  readonly providerName = "sandbox";

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
