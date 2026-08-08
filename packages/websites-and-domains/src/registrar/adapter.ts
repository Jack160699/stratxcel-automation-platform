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

export interface DomainRenewalResult {
  success: boolean;
  domainName: string;
  provider: string;
  expiresAt: string;
  error?: string;
}

export interface DomainRegistrarAdapter {
  readonly providerName: string;
  readonly mode: "disabled" | "sandbox" | "live";
  searchDomain(domainName: string): Promise<DomainSearchResult>;
  getDomainPrice(domainName: string): Promise<DomainSearchResult>;
  registerDomain(input: DomainRegistrationInput): Promise<DomainRegistrationResult>;
  renewDomain(domainName: string, years?: number): Promise<DomainRenewalResult>;
  getDomainStatus(domainName: string): Promise<DomainStatusResult>;
  setupDnsRecords(domainName: string, records: DnsRecord[]): Promise<boolean>;
}

export class RegistrarDisabledError extends Error {
  constructor() {
    super("Domain registrar integration is disabled — set DOMAIN_REGISTRAR_MODE to 'sandbox' for safe testing");
    this.name = "RegistrarDisabledError";
  }
}
