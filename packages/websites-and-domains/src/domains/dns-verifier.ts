/**
 * DNS Verification Engine
 *
 * Checks live DNS records against expected Stratxcel configuration.
 * Formats errors into friendly, non-technical customer messages.
 */

import dns from "node:dns/promises";
import type {
  DnsInstructions,
  DnsVerificationResult,
  DomainRecord,
} from "./types.ts";
import type { InspectDomainOptions } from "./dns-inspector.ts";
import { normalizeDomainInput } from "./normalizer.ts";

export interface VerifyDomainDnsOptions {
  domain: string;
  expectedInstructions: DnsInstructions;
  dnsResolver?: InspectDomainOptions["dnsResolver"];
}

/**
 * Verifies live DNS records for a domain against expected instructions.
 */
export async function verifyDomainDns(
  options: VerifyDomainDnsOptions
): Promise<DnsVerificationResult> {
  const { domain, expectedInstructions, dnsResolver } = options;
  const norm = normalizeDomainInput(domain);
  const apexDomain = norm.apexDomain || domain;
  const resolver = dnsResolver || dns;

  const matchedRecords: DomainRecord[] = [];
  const missingRecords: DomainRecord[] = [];
  const conflictingRecords: string[] = [];

  let anyRecordDetected = false;

  for (const expected of expectedInstructions.records) {
    const targetHost =
      expected.host === "@"
        ? apexDomain
        : `${expected.host}.${apexDomain}`;

    if (expected.type === "A") {
      try {
        const resolvedA = resolver.resolve4 ? await resolver.resolve4(targetHost) : [];
        if (resolvedA.length > 0) anyRecordDetected = true;

        if (resolvedA.includes(expected.value)) {
          matchedRecords.push(expected);
        } else {
          missingRecords.push(expected);
          if (resolvedA.length > 0) {
            conflictingRecords.push(
              `Root domain currently points to IP ${resolvedA.join(", ")}, which does not match the required Stratxcel IP ${expected.value}.`
            );
          }
        }
      } catch {
        missingRecords.push(expected);
      }
    } else if (expected.type === "CNAME") {
      try {
        const resolvedCname = resolver.resolveCname ? await resolver.resolveCname(targetHost) : [];
        if (resolvedCname.length > 0) anyRecordDetected = true;

        const cleanExpected = expected.value.toLowerCase().replace(/\.+$/, "");
        const cleanCurrent = resolvedCname.map((c) => c.toLowerCase().replace(/\.+$/, ""));

        if (cleanCurrent.includes(cleanExpected)) {
          matchedRecords.push(expected);
        } else {
          missingRecords.push(expected);
          if (cleanCurrent.length > 0) {
            conflictingRecords.push(
              `Host '${expected.host}' is pointing to '${cleanCurrent.join(", ")}' instead of '${expected.value}'.`
            );
          }
        }
      } catch {
        missingRecords.push(expected);
      }
    }
  }

  // Determine overall status & friendly message
  if (missingRecords.length === 0 && conflictingRecords.length === 0) {
    return {
      status: "SUCCESS",
      domain,
      matchedRecords,
      missingRecords: [],
      conflictingRecords: [],
      friendlyMessage: "Domain connected successfully. DNS records are verified and pointing to Stratxcel.",
      detailedExplanation: "Your DNS records are properly configured and verified.",
      canRetry: false,
      sslReady: true,
    };
  }

  // If no records detected at all (propagation pending)
  if (!anyRecordDetected) {
    return {
      status: "PENDING",
      domain,
      matchedRecords,
      missingRecords,
      conflictingRecords: [],
      friendlyMessage: "DNS changes are still propagating across the internet. Please wait a few minutes and try again.",
      detailedExplanation: "We did not detect any active DNS records yet. If you recently saved your records, it may take 5–30 minutes to propagate.",
      canRetry: true,
      sslReady: false,
    };
  }

  // Friendly error translation
  let friendlyMessage = "Your DNS records do not match the required configuration yet.";
  const detailedParts: string[] = [];

  const hasMissingA = missingRecords.some((r) => r.type === "A");
  const hasMissingCNAME = missingRecords.some((r) => r.type === "CNAME");

  if (hasMissingA && conflictingRecords.some((c) => c.includes("Root domain"))) {
    detailedParts.push("Your root domain is pointing to an old server IP address.");
  } else if (hasMissingA) {
    detailedParts.push("Your root domain is not pointing to Stratxcel yet (Missing A record).");
  }

  if (hasMissingCNAME && conflictingRecords.some((c) => c.includes("pointing to"))) {
    detailedParts.push("Your www address is pointing somewhere else.");
  } else if (hasMissingCNAME) {
    detailedParts.push("Your www address is not configured yet (Missing CNAME record).");
  }

  if (conflictingRecords.length > 0) {
    detailedParts.push("We found existing records that may conflict with Stratxcel.");
  }

  if (detailedParts.length > 0) {
    friendlyMessage = detailedParts.join(" ");
  }

  return {
    status: "INCORRECT",
    domain,
    matchedRecords,
    missingRecords,
    conflictingRecords,
    friendlyMessage,
    detailedExplanation: conflictingRecords.join("; ") || friendlyMessage,
    canRetry: true,
    sslReady: false,
  };
}
