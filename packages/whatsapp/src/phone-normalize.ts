/**
 * Minimal E.164-ish normalization used purely for tenant-scoped contact
 * dedupe (crm_leads_tenant_normalized_phone_idx) — strips everything but
 * digits, then assumes a bare 10-digit number is Indian (this product's
 * only market tonight) and prefixes 91. Never used for message routing
 * (Meta's `from` field is already normalized) — only for "is this the same
 * contact we already have."
 */
export function normalizePhoneNumber(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 0) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

/**
 * Normalizes Indian phone numbers and classifies mobile vs fixed landline.
 * In India:
 * - Mobile numbers: 10 digits starting with 6, 7, 8, 9 (except known STD wirelines).
 * - Fixed wirelines: STD code + 6 to 8 digit local wireline.
 *   Common STD prefixes without leading 0:
 *   - 2-digit STD codes: 80 (Bangalore), 11 (Delhi), 22 (Mumbai), 33 (Kolkata), 44 (Chennai), 40 (Hyderabad), 79 (Ahmedabad), 20 (Pune)
 *   - 3-digit STD codes: 824 (Mangalore), 821 (Mysore), 831 (Belgaum), 836 (Hubli), 771 (Raipur), 788 (Bhilai), 422 (Coimbatore), 484 (Kochi), 522 (Lucknow), 141 (Jaipur), 172 (Chandigarh), 261 (Surat).
 */
export function classifyIndianDestination(phone?: string | null): {
  isValid: boolean;
  isMobile: boolean;
  isLandline: boolean;
  clean10: string;
  e164: string;
  reason?: string;
} {
  if (!phone) return { isValid: false, isMobile: false, isLandline: false, clean10: "", e164: "", reason: "missing_phone" };
  const rawDigits = phone.replace(/\D/g, "");
  let clean10 = rawDigits;
  if (clean10.startsWith("91") && clean10.length === 12) {
    clean10 = clean10.slice(2);
  } else if (clean10.startsWith("0") && clean10.length === 11) {
    clean10 = clean10.slice(1);
  }

  if (clean10.length !== 10) {
    return { isValid: false, isMobile: false, isLandline: false, clean10, e164: "", reason: "length_not_10" };
  }

  // Check known fixed landline STD patterns
  const landlinePrefixes = [
    "802", "803", "804", "805", "806", "807", "808", // Bangalore wireline blocks
    "824", // Mangalore (0824-2407890)
    "821", // Mysore
    "831", // Belgaum
    "836", // Hubli-Dharwad
    "771", // Raipur
    "788", // Bhilai
    "79",  // Ahmedabad
    "11",  // Delhi
    "22",  // Mumbai
    "33",  // Kolkata
    "44",  // Chennai
    "40",  // Hyderabad
    "20",  // Pune
  ];

  for (const pfx of landlinePrefixes) {
    if (clean10.startsWith(pfx)) {
      return {
        isValid: true,
        isMobile: false,
        isLandline: true,
        clean10,
        e164: `+91${clean10}`,
        reason: `fixed_landline_std_${pfx}`,
      };
    }
  }

  if (!/^[6-9]/.test(clean10)) {
    return { isValid: false, isMobile: false, isLandline: true, clean10, e164: `+91${clean10}`, reason: "non_mobile_first_digit" };
  }

  return {
    isValid: true,
    isMobile: true,
    isLandline: false,
    clean10,
    e164: `+91${clean10}`,
  };
}
