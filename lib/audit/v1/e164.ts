/**
 * Country-aware E.164 normalization for CUSTOMER_WHATSAPP_DELIVERY_DESTINATION.
 * Rejects malformed numbers rather than storing them. CRM contact dedupe still
 * uses digit-only form via packages/whatsapp phone-normalize.
 */

export interface CallingCountry {
  iso: string;
  name: string;
  dial: string;
  nationalMin: number;
  nationalMax: number;
}

export const WHATSAPP_CALLING_COUNTRIES: CallingCountry[] = [
  { iso: "IN", name: "India", dial: "91", nationalMin: 10, nationalMax: 10 },
  { iso: "US", name: "United States", dial: "1", nationalMin: 10, nationalMax: 10 },
  { iso: "CA", name: "Canada", dial: "1", nationalMin: 10, nationalMax: 10 },
  { iso: "GB", name: "United Kingdom", dial: "44", nationalMin: 9, nationalMax: 10 },
  { iso: "AE", name: "United Arab Emirates", dial: "971", nationalMin: 8, nationalMax: 9 },
  { iso: "SA", name: "Saudi Arabia", dial: "966", nationalMin: 8, nationalMax: 9 },
  { iso: "SG", name: "Singapore", dial: "65", nationalMin: 8, nationalMax: 8 },
  { iso: "AU", name: "Australia", dial: "61", nationalMin: 9, nationalMax: 9 },
  { iso: "NZ", name: "New Zealand", dial: "64", nationalMin: 8, nationalMax: 10 },
  { iso: "DE", name: "Germany", dial: "49", nationalMin: 10, nationalMax: 11 },
  { iso: "FR", name: "France", dial: "33", nationalMin: 9, nationalMax: 9 },
  { iso: "NL", name: "Netherlands", dial: "31", nationalMin: 9, nationalMax: 9 },
  { iso: "ES", name: "Spain", dial: "34", nationalMin: 9, nationalMax: 9 },
  { iso: "IT", name: "Italy", dial: "39", nationalMin: 9, nationalMax: 10 },
  { iso: "IE", name: "Ireland", dial: "353", nationalMin: 9, nationalMax: 9 },
  { iso: "BR", name: "Brazil", dial: "55", nationalMin: 10, nationalMax: 11 },
  { iso: "ZA", name: "South Africa", dial: "27", nationalMin: 9, nationalMax: 9 },
  { iso: "NG", name: "Nigeria", dial: "234", nationalMin: 10, nationalMax: 10 },
  { iso: "KE", name: "Kenya", dial: "254", nationalMin: 9, nationalMax: 9 },
  { iso: "NP", name: "Nepal", dial: "977", nationalMin: 10, nationalMax: 10 },
  { iso: "BD", name: "Bangladesh", dial: "880", nationalMin: 10, nationalMax: 10 },
  { iso: "PK", name: "Pakistan", dial: "92", nationalMin: 10, nationalMax: 10 },
  { iso: "LK", name: "Sri Lanka", dial: "94", nationalMin: 9, nationalMax: 9 },
  { iso: "MY", name: "Malaysia", dial: "60", nationalMin: 9, nationalMax: 10 },
  { iso: "ID", name: "Indonesia", dial: "62", nationalMin: 9, nationalMax: 12 },
  { iso: "PH", name: "Philippines", dial: "63", nationalMin: 10, nationalMax: 10 },
  { iso: "QA", name: "Qatar", dial: "974", nationalMin: 8, nationalMax: 8 },
  { iso: "KW", name: "Kuwait", dial: "965", nationalMin: 8, nationalMax: 8 },
  { iso: "OM", name: "Oman", dial: "968", nationalMin: 8, nationalMax: 8 },
];

export interface NormalizedWhatsAppDestination {
  e164: string;
  digits: string;
  countryIso: string;
  nationalNumber: string;
}

export function countryByIso(iso: string): CallingCountry | null {
  const key = iso.trim().toUpperCase();
  return WHATSAPP_CALLING_COUNTRIES.find((row) => row.iso === key) ?? null;
}

export function digitsOnly(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/**
 * Normalize a country-selected national number to E.164.
 * Returns null for malformed input — callers must not persist null.
 */
export function normalizeWhatsAppDestination(countryIso: string, national: string): NormalizedWhatsAppDestination | null {
  const country = countryByIso(countryIso);
  if (!country) return null;
  let nationalDigits = digitsOnly(national);
  if (!nationalDigits) return null;

  if (nationalDigits.startsWith(country.dial) && nationalDigits.length > country.nationalMax) {
    nationalDigits = nationalDigits.slice(country.dial.length);
  }
  if (nationalDigits.startsWith("0") && nationalDigits.length === country.nationalMax + 1) {
    nationalDigits = nationalDigits.slice(1);
  }
  if (nationalDigits.length < country.nationalMin || nationalDigits.length > country.nationalMax) {
    return null;
  }
  const digits = `${country.dial}${nationalDigits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return {
    e164: `+${digits}`,
    digits,
    countryIso: country.iso,
    nationalNumber: nationalDigits,
  };
}

export function maskWhatsAppNumber(e164OrDigits: string): string {
  const digits = digitsOnly(e164OrDigits);
  if (digits.length < 4) return "••••";
  return `••••••${digits.slice(-4)}`;
}
