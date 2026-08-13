export const AUDIT_CHANNEL_TYPES = [
  "google_business",
  "instagram",
  "facebook",
  "linkedin",
  "youtube",
  "x",
  "threads",
  "whatsapp",
  "marketplace",
  "other",
] as const;

export type AuditChannelType = (typeof AUDIT_CHANNEL_TYPES)[number];

export const AUDIT_CHANNEL_LABELS: Record<AuditChannelType, string> = {
  google_business: "Google Business / Google Maps",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X / Twitter",
  threads: "Threads",
  whatsapp: "WhatsApp",
  marketplace: "Marketplace / store",
  other: "Other",
};

export interface AuditBusinessChannel {
  id: string;
  type: AuditChannelType;
  value: string;
  notAvailable: boolean;
}

export function isAuditChannelType(value: string): value is AuditChannelType {
  return (AUDIT_CHANNEL_TYPES as readonly string[]).includes(value);
}

export function sanitizeChannels(value: unknown): AuditBusinessChannel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const channels: AuditBusinessChannel[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const type = typeof row.type === "string" && isAuditChannelType(row.type) ? row.type : null;
    if (!type || seen.has(type)) continue;
    seen.add(type);
    channels.push({
      id: typeof row.id === "string" && row.id.trim() ? row.id.trim().slice(0, 80) : type,
      type,
      value: typeof row.value === "string" ? row.value.trim().slice(0, 500) : "",
      notAvailable: row.notAvailable === true,
    });
    if (channels.length >= 10) break;
  }
  return channels;
}
