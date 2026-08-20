/**
 * Customer-Owned Domain Connection Manager
 *
 * Coordinates domain normalization, DNS instructions, DNS verification,
 * hosting/Vercel attachment, SSL polling, and tenant-safe persistence.
 */

import { randomUUID } from "node:crypto";
import type {
  CustomerDomainConnection,
  DomainConnectionStatus,
  SupportedRegistrar,
} from "./types.ts";
import { normalizeDomainInput } from "./normalizer.ts";
import { generateDnsInstructions } from "./dns-instructions/generator.ts";
import { inspectDomainDns } from "./dns-inspector.ts";
import { verifyDomainDns, type VerifyDomainDnsOptions } from "./dns-verifier.ts";
import { attachDomainToVercel, getVercelDomainStatus } from "../vercel-domains.ts";

export interface ConnectDomainParams {
  tenantId: string;
  siteProjectId: string;
  domain: string;
  preferredRegistrar?: SupportedRegistrar;
  isPrimary?: boolean;
}

export interface VerifyDomainParams {
  tenantId: string;
  siteProjectId: string;
  domainId: string;
  dnsResolver?: VerifyDomainDnsOptions["dnsResolver"];
}

export interface DisconnectDomainParams {
  tenantId: string;
  siteProjectId: string;
  domainId: string;
}

// In-memory tenant-safe registry for fast retrieval & standalone environments
const DOMAIN_CONNECTIONS = new Map<string, CustomerDomainConnection>();

export class CustomerDomainManager {
  /**
   * Clears the in-memory store (for testing).
   */
  public reset(): void {
    DOMAIN_CONNECTIONS.clear();
  }

  /**
   * Connects a customer-owned domain to a website project.
   */
  public async connectDomain(params: ConnectDomainParams): Promise<CustomerDomainConnection> {
    const { tenantId, siteProjectId, domain, preferredRegistrar = "other", isPrimary = true } = params;

    if (!tenantId || !siteProjectId) {
      throw new Error("Missing required tenant or project context");
    }

    // 1. Validate & normalize domain
    const norm = normalizeDomainInput(domain);
    if (!norm.valid || !norm.domain) {
      throw new Error(norm.error || "Invalid domain name");
    }

    const normalizedDomain = norm.domain;
    const apexDomain = norm.apexDomain || normalizedDomain;
    const isApex = Boolean(norm.isApex);

    // 2. Generate structured DNS instructions
    const dnsInstructions = generateDnsInstructions({
      domain: normalizedDomain,
      provider: preferredRegistrar,
    });

    // 3. Inspect existing DNS records (read-only)
    const inspection = await inspectDomainDns({
      domain: normalizedDomain,
    });

    // 4. Attach domain to Vercel hosting project
    const vercelAttach = await attachDomainToVercel(normalizedDomain);

    const now = new Date().toISOString();
    const id = `dom_${randomUUID()}`;

    const connection: CustomerDomainConnection = {
      id,
      tenantId,
      siteProjectId,
      domain: normalizedDomain,
      normalizedDomain,
      apexDomain,
      isApex,
      status: "DNS_CONFIG_REQUIRED",
      isPrimary,
      provider: preferredRegistrar,
      dnsInstructions,
      inspection,
      sslStatus: vercelAttach.sslActive ? "SSL_ACTIVE" : "NOT_STARTED",
      createdAt: now,
      updatedAt: now,
    };

    DOMAIN_CONNECTIONS.set(id, connection);
    return connection;
  }

  /**
   * Verifies DNS records and initiates SSL verification.
   */
  public async verifyDomain(params: VerifyDomainParams): Promise<CustomerDomainConnection> {
    const { tenantId, siteProjectId, domainId, dnsResolver } = params;

    const connection = DOMAIN_CONNECTIONS.get(domainId);
    if (!connection) {
      throw new Error("Domain connection record not found");
    }

    // Tenant boundary check
    if (connection.tenantId !== tenantId || connection.siteProjectId !== siteProjectId) {
      throw new Error("Unauthorized: domain does not belong to this tenant project");
    }

    connection.status = "VERIFYING";
    connection.updatedAt = new Date().toISOString();

    // 1. Perform DNS verification
    const verification = await verifyDomainDns({
      domain: connection.normalizedDomain,
      expectedInstructions: connection.dnsInstructions,
      dnsResolver,
    });

    connection.lastVerification = verification;
    connection.verificationTimestamp = new Date().toISOString();

    if (verification.status !== "SUCCESS") {
      connection.status = verification.status === "PENDING" ? "PENDING_VERIFICATION" : "FAILED";
      connection.updatedAt = new Date().toISOString();
      return connection;
    }

    // 2. DNS is verified -> Check SSL / Vercel status
    connection.status = "VERIFIED";

    const vercelStatus = await getVercelDomainStatus(connection.normalizedDomain);
    if (vercelStatus.sslActive) {
      connection.status = "ACTIVE";
      connection.sslStatus = "SSL_ACTIVE";
      connection.verifiedAt = new Date().toISOString();
    } else {
      connection.status = "SSL_PENDING";
      connection.sslStatus = "SSL_PENDING";
    }

    connection.updatedAt = new Date().toISOString();
    return connection;
  }

  /**
   * Gets all domain connections for a project within a tenant.
   */
  public getProjectDomains(tenantId: string, siteProjectId: string): CustomerDomainConnection[] {
    return Array.from(DOMAIN_CONNECTIONS.values()).filter(
      (c) => c.tenantId === tenantId && c.siteProjectId === siteProjectId && c.status !== "DISCONNECTED"
    );
  }

  /**
   * Gets a specific domain connection.
   */
  public getDomain(tenantId: string, domainId: string): CustomerDomainConnection | null {
    const conn = DOMAIN_CONNECTIONS.get(domainId);
    if (!conn || conn.tenantId !== tenantId) return null;
    return conn;
  }

  /**
   * Disconnects a domain safely without destroying site project.
   */
  public disconnectDomain(params: DisconnectDomainParams): CustomerDomainConnection {
    const { tenantId, siteProjectId, domainId } = params;

    const connection = DOMAIN_CONNECTIONS.get(domainId);
    if (!connection) {
      throw new Error("Domain connection record not found");
    }

    if (connection.tenantId !== tenantId || connection.siteProjectId !== siteProjectId) {
      throw new Error("Unauthorized: domain does not belong to this tenant project");
    }

    connection.status = "DISCONNECTED";
    connection.isPrimary = false;
    connection.updatedAt = new Date().toISOString();
    return connection;
  }
}

export const customerDomainManager = new CustomerDomainManager();
