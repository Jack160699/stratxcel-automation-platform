/**
 * Safe Read-Only DNS Inspector
 *
 * Inspects customer domain's current DNS configuration using public DNS resolution
 * without making any modifications.
 */

import dns from "node:dns/promises";
import type { DomainInspectionResult } from "./types.ts";
import { normalizeDomainInput } from "./normalizer.ts";

export interface InspectDomainOptions {
  domain: string;
  dnsResolver?: {
    resolve4?: (hostname: string) => Promise<string[]>;
    resolveCname?: (hostname: string) => Promise<string[]>;
    resolve6?: (hostname: string) => Promise<string[]>;
    resolveNs?: (hostname: string) => Promise<string[]>;
  };
}

/**
 * Performs a safe read-only inspection of a domain's current DNS records.
 */
export async function inspectDomainDns(
  options: InspectDomainOptions
): Promise<DomainInspectionResult> {
  const norm = normalizeDomainInput(options.domain);
  if (!norm.valid || !norm.domain) {
    throw new Error(norm.error || "Invalid domain for DNS inspection");
  }

  const domain = norm.domain;
  const resolver = options.dnsResolver || dns;

  let currentA: string[] = [];
  let currentCNAME: string[] = [];
  let currentAAAA: string[] = [];
  let currentNameservers: string[] = [];
  const conflicts: string[] = [];

  // 1. Resolve A records
  try {
    if (resolver.resolve4) {
      currentA = await resolver.resolve4(domain);
    }
  } catch (err: unknown) {
    // ENOTFOUND or ENODATA is normal if domain has no records yet
  }

  // 2. Resolve CNAME records
  try {
    if (resolver.resolveCname) {
      currentCNAME = await resolver.resolveCname(domain);
    }
  } catch {
    // Ignore not found
  }

  // 3. Resolve AAAA records
  try {
    if (resolver.resolve6) {
      currentAAAA = await resolver.resolve6(domain);
    }
  } catch {
    // Ignore not found
  }

  // 4. Resolve Nameservers
  try {
    if (resolver.resolveNs) {
      currentNameservers = await resolver.resolveNs(norm.apexDomain || domain);
    }
  } catch {
    // Ignore not found
  }

  const detected = currentA.length > 0 || currentCNAME.length > 0 || currentAAAA.length > 0;

  // Check for common conflicting setup (e.g. CNAME and A both present on root)
  if (currentA.length > 0 && currentCNAME.length > 0) {
    conflicts.push("Domain has both an A record and a CNAME record at the same hostname, which violates DNS specifications.");
  }

  return {
    domain,
    normalizedDomain: domain,
    detected,
    currentA,
    currentCNAME,
    currentAAAA,
    currentNameservers,
    conflicts,
    inspectionTimestamp: new Date().toISOString(),
  };
}
