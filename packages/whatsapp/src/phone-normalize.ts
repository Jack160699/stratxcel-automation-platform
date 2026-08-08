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
