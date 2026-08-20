/**
 * Customer-Owned Domain Connection System Types
 */

export type DomainConnectionStatus =
  | "NOT_CONNECTED"
  | "PENDING_VERIFICATION"
  | "DNS_CONFIG_REQUIRED"
  | "VERIFYING"
  | "VERIFIED"
  | "SSL_PENDING"
  | "ACTIVE"
  | "FAILED"
  | "DISCONNECTED";

export type DomainRecordType = "A" | "CNAME" | "TXT" | "AAAA";

export interface DomainRecord {
  type: DomainRecordType;
  host: string;
  value: string;
  ttl?: number;
  priority?: number;
  purpose?: string;
  isOptional?: boolean;
}

export type SupportedRegistrar =
  | "godaddy"
  | "namecheap"
  | "hostinger"
  | "cloudflare"
  | "bigrock"
  | "squarespace"
  | "bluehost"
  | "other";

export interface RegistrarGuidance {
  key: SupportedRegistrar;
  name: string;
  steps: string[];
  docsUrl?: string;
  tips?: string[];
}

export interface DnsInstructions {
  domain: string;
  apexDomain: string;
  isApex: boolean;
  provider: SupportedRegistrar;
  records: DomainRecord[];
  steps: string[];
  notes?: string[];
  quickCopyItems: Array<{ label: string; value: string }>;
}

export interface DomainInspectionResult {
  domain: string;
  normalizedDomain: string;
  detected: boolean;
  currentA: string[];
  currentCNAME: string[];
  currentAAAA: string[];
  currentNameservers: string[];
  conflicts: string[];
  inspectionTimestamp: string;
}

export interface DnsVerificationResult {
  status: "SUCCESS" | "PENDING" | "INCORRECT" | "FAILED";
  domain: string;
  matchedRecords: DomainRecord[];
  missingRecords: DomainRecord[];
  conflictingRecords: string[];
  friendlyMessage: string;
  detailedExplanation: string;
  canRetry: boolean;
  sslReady: boolean;
}

export interface CustomerDomainConnection {
  id: string;
  tenantId: string;
  siteProjectId: string;
  domain: string;
  normalizedDomain: string;
  apexDomain: string;
  isApex: boolean;
  status: DomainConnectionStatus;
  isPrimary: boolean;
  provider: SupportedRegistrar;
  dnsInstructions: DnsInstructions;
  inspection?: DomainInspectionResult;
  lastVerification?: DnsVerificationResult;
  verificationTimestamp?: string;
  sslStatus?: "NOT_STARTED" | "SSL_PENDING" | "SSL_ACTIVE" | "SSL_FAILED";
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DomainNormalizationResult {
  valid: boolean;
  normalized?: string;
  domain?: string;
  apexDomain?: string;
  isApex?: boolean;
  error?: string;
  reason?: string;
}
