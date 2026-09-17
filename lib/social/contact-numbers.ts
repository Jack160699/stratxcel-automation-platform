/**
 * Phone numbers inside social copy: normalize, format and extract them, so a
 * caption's or creative's contact details can be compared mechanically with
 * the tenant's canonical business profile. E.164-shaped; India (+91) is the
 * default country because it is this product's market, never a hardcoded
 * business number.
 */

const DEFAULT_COUNTRY_CODE = "91";

/** "+91 95847 35857", "9584735857", "919584735857", "tel:+91…", "wa.me/91…" -> "+919584735857". Null when not a plausible number. */
export function normalizePhoneNumber(raw: string | null | undefined, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = /^\s*(?:tel:)?\+/.test(trimmed);
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;

  if (defaultCountryCode === "91") {
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
    return null;
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${defaultCountryCode}${digits}` : null;
}

/** Human-readable display: "+91 95847 35857" for Indian mobiles, E.164 otherwise. */
export function formatPhoneNumber(e164: string): string {
  const indian = e164.match(/^\+91([6-9]\d{4})(\d{5})$/);
  return indian ? `+91 ${indian[1]} ${indian[2]}` : e164;
}

// Indian mobile numbers as people actually write them, plus link forms.
const PHONE_PATTERNS: RegExp[] = [
  /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{10,15})/gi,
  /tel:\+?\d[\d\s-]{7,16}\d/gi,
  /(?<![\d₹,.])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\d,])/g,
];

/** Every distinct phone number mentioned in `text`, normalized to E.164. */
export function extractPhoneNumbers(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const pattern of PHONE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      // Link forms carry bare digits: a 10-digit local number, or country code + number.
      const linkDigits = match[1];
      const candidate = linkDigits ? (linkDigits.length === 10 ? linkDigits : `+${linkDigits}`) : match[0];
      const normalized = normalizePhoneNumber(candidate);
      if (normalized) found.add(normalized);
    }
  }
  return [...found];
}
