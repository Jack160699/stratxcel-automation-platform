/**
 * DNS Instructions Generator
 *
 * Generates provider-neutral and registrar-specific DNS instructions
 * tailored to the customer's domain and selected registrar.
 */

import type {
  DnsInstructions,
  DomainRecord,
  SupportedRegistrar,
} from "../types.ts";
import { normalizeDomainInput } from "../normalizer.ts";
import { REGISTRAR_GUIDANCE_MAP } from "./guidance.ts";

export interface GenerateDnsInstructionsOptions {
  domain: string;
  provider?: SupportedRegistrar;
  aRecordIp?: string;
  cnameTarget?: string;
}

const DEFAULT_A_RECORD_IP = process.env.STRATXCEL_DNS_A_IP || "76.76.21.21";
const DEFAULT_CNAME_TARGET = process.env.STRATXCEL_DNS_CNAME || "cname.vercel-dns.com";

/**
 * Generates structured DNS instructions for a customer's domain.
 */
export function generateDnsInstructions(
  options: GenerateDnsInstructionsOptions
): DnsInstructions {
  const norm = normalizeDomainInput(options.domain);
  if (!norm.valid || !norm.domain) {
    throw new Error(norm.error || "Invalid domain provided for DNS instructions");
  }

  const domain = norm.domain;
  const apexDomain = norm.apexDomain || domain;
  const isApex = Boolean(norm.isApex);
  const provider: SupportedRegistrar = options.provider || "other";
  const aIp = options.aRecordIp || DEFAULT_A_RECORD_IP;
  const cnameTarget = options.cnameTarget || DEFAULT_CNAME_TARGET;

  const records: DomainRecord[] = [];
  const quickCopyItems: Array<{ label: string; value: string }> = [];

  if (isApex) {
    // Apex domain: needs A record for root (@) and CNAME for www
    records.push({
      type: "A",
      host: "@",
      value: aIp,
      ttl: 3600,
      purpose: `Directs ${domain} to Stratxcel servers`,
      isOptional: false,
    });
    quickCopyItems.push({ label: "A Record Host", value: "@" });
    quickCopyItems.push({ label: "A Record Value (IP)", value: aIp });

    records.push({
      type: "CNAME",
      host: "www",
      value: cnameTarget,
      ttl: 3600,
      purpose: `Directs www.${domain} to Stratxcel servers`,
      isOptional: false,
    });
    quickCopyItems.push({ label: "CNAME Host", value: "www" });
    quickCopyItems.push({ label: "CNAME Target", value: cnameTarget });
  } else {
    // Subdomain (e.g. shop.mybrand.com or www.mybrand.com)
    const subdomainLabel = domain.replace(`.${apexDomain}`, "");

    records.push({
      type: "CNAME",
      host: subdomainLabel,
      value: cnameTarget,
      ttl: 3600,
      purpose: `Directs ${domain} to Stratxcel servers`,
      isOptional: false,
    });
    quickCopyItems.push({ label: "CNAME Host", value: subdomainLabel });
    quickCopyItems.push({ label: "CNAME Target", value: cnameTarget });
  }

  const guidance = REGISTRAR_GUIDANCE_MAP[provider] || REGISTRAR_GUIDANCE_MAP.other;

  // Substitute values into guidance steps
  const populatedSteps = guidance.steps.map((step) =>
    step
      .replace(/\(stratxcel A IP\)/g, aIp)
      .replace(/\(stratxcel CNAME target\)/g, cnameTarget)
      .replace(/mybrand\.com/g, domain)
  );

  return {
    domain,
    apexDomain,
    isApex,
    provider,
    records,
    steps: populatedSteps,
    notes: guidance.tips,
    quickCopyItems,
  };
}
