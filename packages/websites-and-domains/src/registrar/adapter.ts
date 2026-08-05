export interface DomainRegistrantDetails {
  name: string;
  email: string;
  phone: string;
  organization?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  postalCode?: string;
}

export interface DomainSearchResult {
  domainName: string;
  available: boolean;
  priceCents: number;
  currency: string;
  renewalPriceCents: number;
}

export interface DomainRegistrationInput {
  domainName: string;
  tenantId: string;
  registrant: DomainRegistrantDetails;
  years?: number;
}

export interface DnsRecord {
  type: "A" | "CNAME" | "MX" | "TXT";
  name: string;
  value: string;
  ttl?: number;
}

export interface DomainRegistrationResult {
  success: boolean;
  domainName: string;
  provider: string;
  providerDomainId: string;
  status: "active" | "pending" | "failed";
  expiresAt: string;
  dnsRecords: DnsRecord[];
  error?: string;
}

export interface DomainStatusResult {
  domainName: string;
  status: "active" | "expired" | "pending" | "transferred_out";
  expiresAt: string;
  autoRenew: boolean;
  dnsConfigured: boolean;
}

export interface DomainRegistrarAdapter {
  readonly providerName: string;
  searchDomain(domainName: string): Promise<DomainSearchResult>;
  getDomainPrice(domainName: string): Promise<DomainSearchResult>;
  registerDomain(input: DomainRegistrationInput): Promise<DomainRegistrationResult>;
  getDomainStatus(domainName: string): Promise<DomainStatusResult>;
  setupDnsRecords(domainName: string, records: DnsRecord[]): Promise<boolean>;
}
