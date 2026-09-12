/**
 * Deterministic Identity Resolution & Multi-Source Deduplication
 * StratXcel Autonomous Company OS - Workforce Core
 */

import { createHash } from "node:crypto";
import type {
  CanonicalLead,
  LeadEvidence,
  LeadIdentity,
  LeadSourceProvenance,
  RawDiscoveredLead,
} from "./types.ts";

/**
 * Normalizes an Indian or international phone number to E.164.
 * Handles formats like:
 *  "080-28394100", "+91 95847 35857", "09584735857", "95847-35857", "0771 4050600"
 */
export function normalizePhone(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  let digits = rawPhone.replace(/\D/g, "");
  if (!digits || digits.length < 7) return null;

  // If starts with 0091 or 91 with 12 digits
  if (digits.startsWith("0091")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  // Mobile (10 digits) or Indian STD landline (8-10 digits)
  if (digits.length === 10) {
    return `+91${digits}`;
  } else if (digits.length > 10 && digits.length <= 15) {
    return `+${digits}`;
  } else if (digits.length >= 7 && digits.length < 10) {
    // Local landline without STD code - preserve as digits
    return `+91${digits}`;
  }

  return `+${digits}`;
}

/**
 * Canonicalizes a website domain:
 *  "https://WWW.PeenyaPrecision.in/contact/" -> "peenyaprecision.in"
 */
export function canonicalizeDomain(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  let domain = rawUrl.trim().toLowerCase();
  // Strip protocol
  domain = domain.replace(/^https?:\/\//i, "");
  // Strip www.
  domain = domain.replace(/^www\./i, "");
  // Strip path, query, hash
  domain = domain.split("/")[0].split("?")[0].split("#")[0].trim();
  // Strip port if standard
  domain = domain.replace(/:(80|443)$/, "");
  if (!domain || !domain.includes(".")) return null;
  return domain;
}

/**
 * Normalizes business names for matching:
 *  "Peenya Precision Tooling Pvt. Ltd." -> "peenya precision tooling"
 */
export function normalizeCompanyName(name?: string | null): string {
  if (!name) return "";
  let clean = name.trim().toLowerCase();
  // Remove company suffix abbreviations
  clean = clean.replace(/\b(pvt\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|inc\.?|corp\.?|co\.?)\b/gi, "");
  // Remove special characters, multiple spaces
  clean = clean.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  return clean;
}

/**
 * Generates a deterministic SHA-256 deduplication hash.
 * Hierarchy:
 *  1. If canonical domain exists: sha256("dom:" + domain)
 *  2. Else if phone exists: sha256("phone:" + normalizedName + ":" + phone)
 *  3. Else: sha256("name_city:" + normalizedName + ":" + normalizedCity)
 */
export function generateIdentityHash(input: {
  companyName: string;
  websiteUrl?: string | null;
  phone?: string | null;
  city?: string | null;
}): string {
  const normName = normalizeCompanyName(input.companyName);
  const domain = canonicalizeDomain(input.websiteUrl);
  const phone = normalizePhone(input.phone);
  const city = (input.city || "").trim().toLowerCase();

  let seed: string;
  if (domain && !["facebook.com", "instagram.com", "linkedin.com", "justdial.com", "indiamart.com"].includes(domain)) {
    seed = `dom:${domain}`;
  } else if (normName && phone) {
    seed = `phone:${normName}:${phone}`;
  } else if (normName && city) {
    seed = `name_city:${normName}:${city}`;
  } else {
    seed = `raw:${normName || input.companyName.trim().toLowerCase()}`;
  }

  return createHash("sha256").update(seed).digest("hex");
}

/**
 * Builds a normalized LeadIdentity from a raw lead.
 */
export function buildLeadIdentity(raw: RawDiscoveredLead): LeadIdentity {
  const normName = normalizeCompanyName(raw.companyName);
  const domain = canonicalizeDomain(raw.website);
  const phone = normalizePhone(raw.phone);
  const email = raw.email ? raw.email.trim().toLowerCase() : null;
  const hash = generateIdentityHash({
    companyName: raw.companyName,
    websiteUrl: raw.website,
    phone: raw.phone,
    city: raw.city,
  });

  return {
    companyName: raw.companyName.trim(),
    normalizedCompanyName: normName,
    websiteUrl: raw.website ? raw.website.trim() : null,
    canonicalDomain: domain,
    primaryPhone: phone,
    normalizedPhone: phone,
    allPhones: phone ? [phone] : [],
    primaryEmail: email,
    normalizedEmail: email,
    allEmails: email ? [email] : [],
    facilityAddress: raw.address ? raw.address.trim() : null,
    city: raw.city ? raw.city.trim() : null,
    stateOrRegion: raw.stateOrRegion ? raw.stateOrRegion.trim() : null,
    country: raw.country ? raw.country.trim() : "India",
    deduplicationHash: hash,
  };
}

/**
 * Merges a raw discovered lead into an existing CanonicalLead identity.
 * Merges phone numbers, emails, addresses, and tracks provenance.
 */
export function mergeLeadIdentity(existing: CanonicalLead, raw: RawDiscoveredLead): CanonicalLead {
  const newPhone = normalizePhone(raw.phone);
  const newEmail = raw.email ? raw.email.trim().toLowerCase() : null;
  const newDomain = canonicalizeDomain(raw.website);
  const nowIso = new Date().toISOString();

  // 1. Merge Phones
  const allPhones = new Set(existing.identity.allPhones);
  if (newPhone) allPhones.add(newPhone);

  // 2. Merge Emails
  const allEmails = new Set(existing.identity.allEmails);
  if (newEmail) allEmails.add(newEmail);

  // 3. New Provenance Record
  const newProvenance: LeadSourceProvenance = {
    sourceKey: raw.sourceKey,
    sourceName: raw.sourceName,
    sourceUrl: raw.sourceUrl,
    discoveredAt: nowIso,
    verificationMethod: raw.sourceKey.includes("catalog") ? "grounded_catalog" : "direct_api",
    confidence: raw.confidence || "HIGH",
    confidenceScore: raw.confidence === "VERIFIED" ? 1.0 : 0.85,
    deduplicationHash: existing.identity.deduplicationHash,
    extractedFields: Object.keys(raw).filter((k) => raw[k as keyof RawDiscoveredLead] !== undefined),
  };

  // 4. Evidence Record
  const newEvidence: LeadEvidence = {
    id: createHash("sha256").update(`${existing.id}:${raw.sourceKey}:${nowIso}`).digest("hex").slice(0, 16),
    claim: `Sighted on ${raw.sourceName}${raw.sourceUrl ? ` (${raw.sourceUrl})` : ""}`,
    field: "source_sighting",
    value: { source: raw.sourceName, category: raw.category, phone: raw.phone, website: raw.website },
    sourceKey: raw.sourceKey,
    sourceUrl: raw.sourceUrl,
    confidence: raw.confidence || "HIGH",
    recordedAt: nowIso,
  };

  return {
    ...existing,
    identity: {
      ...existing.identity,
      primaryPhone: existing.identity.primaryPhone || newPhone,
      normalizedPhone: existing.identity.normalizedPhone || newPhone,
      allPhones: Array.from(allPhones),
      primaryEmail: existing.identity.primaryEmail || newEmail,
      normalizedEmail: existing.identity.normalizedEmail || newEmail,
      allEmails: Array.from(allEmails),
      websiteUrl: existing.identity.websiteUrl || (raw.website ? raw.website.trim() : null),
      canonicalDomain: existing.identity.canonicalDomain || newDomain,
      facilityAddress: existing.identity.facilityAddress || (raw.address ? raw.address.trim() : null),
      city: existing.identity.city || (raw.city ? raw.city.trim() : null),
      stateOrRegion: existing.identity.stateOrRegion || (raw.stateOrRegion ? raw.stateOrRegion.trim() : null),
    },
    provenanceHistory: [...existing.provenanceHistory, newProvenance],
    evidenceList: [...existing.evidenceList, newEvidence],
    updatedAt: nowIso,
    lastVerifiedAt: nowIso,
  };
}
