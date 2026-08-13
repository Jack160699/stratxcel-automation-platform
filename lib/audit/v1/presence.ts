import type { AuditBusinessChannel } from "./channels.ts";
import type { PlatformIconKey } from "@/components/audit/PlatformIcon";

export type PresenceProvenance = "customer_verified" | "verified_public" | "customer_supplied" | "inferred" | "unknown";

export type PresenceStatus = "verified" | "connected" | "not_connected" | "not_available" | "delivery";

export interface PresenceLink {
  key: PlatformIconKey;
  label: string;
  handle: string | null;
  href: string | null;
  status: PresenceStatus;
  provenance: PresenceProvenance;
  openLabel: string | null;
  public: boolean;
}

const BLOCKED = /^(javascript|data|file|blob|about|vbscript):/i;

export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !BLOCKED.test(value);
  } catch {
    return false;
  }
}

export function displayHandle(type: string, value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("@")) return raw;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    if (type === "website") return host;
    if (type === "instagram" || type === "threads" || type === "x" || type === "youtube") {
      const handle = path.replace(/^\/@?/, "").split("/")[0] ?? "";
      return handle ? `@${handle}` : host;
    }
    if (type === "linkedin") return path || host;
    if (type === "facebook" || type === "google_business") {
      return decodeURIComponent(path.replace(/^\//, "").split("/")[0] || host).replace(/\+/g, " ");
    }
    return host;
  } catch {
    return raw;
  }
}

export function openLabelFor(type: string): string | null {
  if (type === "website") return "Open website";
  if (type === "instagram") return "Open Instagram";
  if (type === "facebook") return "Open Facebook";
  if (type === "google_business") return "View on Google";
  if (type === "linkedin") return "Open LinkedIn";
  if (type === "youtube") return "Open YouTube";
  if (type === "x") return "Open X";
  if (type === "threads") return "Open Threads";
  return "Open";
}

export function buildPresenceLinks(input: {
  websiteUrl?: string | null;
  channels?: AuditBusinessChannel[];
  onlineProfiles?: string[];
  verifiedPublicTypes?: string[];
  customerVerifiedTypes?: string[];
  whatsappDeliveryMasked?: string | null;
}): PresenceLink[] {
  const links: PresenceLink[] = [];
  const website = input.websiteUrl?.trim() ? safeCanonicalWebsite(input.websiteUrl) : null;
  links.push({
    key: "website",
    label: "Website",
    handle: website ? displayHandle("website", website) : null,
    href: website,
    status: website ? (input.verifiedPublicTypes?.includes("website") || input.customerVerifiedTypes?.includes("website") ? "verified" : "connected") : "not_connected",
    provenance: input.customerVerifiedTypes?.includes("website")
      ? "customer_verified"
      : input.verifiedPublicTypes?.includes("website")
        ? "verified_public"
        : website
          ? "customer_supplied"
          : "unknown",
    openLabel: website ? "Open website" : null,
    public: true,
  });

  const types: PlatformIconKey[] = ["google_business", "instagram", "facebook", "linkedin", "youtube", "x", "threads"];
  for (const type of types) {
    const channel = input.channels?.find((row) => row.type === type);
    const fromProfiles = inferProfile(type, input.onlineProfiles ?? []);
    const value = channel?.notAvailable ? "" : (channel?.value || fromProfiles || "");
    const href = value ? safePlatformHref(type, value) : null;
    const unavailable = channel?.notAvailable === true;
    links.push({
      key: type,
      label: type === "google_business" ? "Google Business" : type === "x" ? "X" : type[0]!.toUpperCase() + type.slice(1).replace("_", " "),
      handle: href ? displayHandle(type, href) : null,
      href,
      status: unavailable ? "not_available" : href ? (input.verifiedPublicTypes?.includes(type) || input.customerVerifiedTypes?.includes(type) ? "verified" : "connected") : "not_connected",
      provenance: input.customerVerifiedTypes?.includes(type)
        ? "customer_verified"
        : input.verifiedPublicTypes?.includes(type)
          ? "verified_public"
          : href
            ? "customer_supplied"
            : "unknown",
      openLabel: href ? openLabelFor(type) : null,
      public: true,
    });
  }

  if (input.whatsappDeliveryMasked) {
    links.push({
      key: "whatsapp",
      label: "WhatsApp",
      handle: input.whatsappDeliveryMasked,
      href: null,
      status: "delivery",
      provenance: "customer_supplied",
      openLabel: null,
      public: false,
    });
  }

  return links;
}

function safeCanonicalWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || BLOCKED.test(trimmed)) return null;
  try {
    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return isSafeHttpUrl(url.toString()) ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function safePlatformHref(type: string, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || BLOCKED.test(trimmed)) return null;
  if (trimmed.startsWith("@")) {
    const handle = trimmed.slice(1).replace(/[^\w.]/g, "");
    if (!handle) return null;
    if (type === "instagram") return `https://www.instagram.com/${handle}`;
    if (type === "x") return `https://x.com/${handle}`;
    if (type === "youtube") return `https://www.youtube.com/@${handle}`;
    if (type === "threads") return `https://www.threads.net/@${handle}`;
    if (type === "facebook") return `https://www.facebook.com/${handle}`;
    if (type === "linkedin") return `https://www.linkedin.com/in/${handle}`;
    return null;
  }
  return safeCanonicalWebsite(trimmed);
}

function inferProfile(type: string, profiles: string[]): string {
  const needle =
    type === "instagram" ? "instagram.com"
    : type === "facebook" ? "facebook.com"
    : type === "linkedin" ? "linkedin.com"
    : type === "youtube" ? "youtube.com"
    : type === "x" ? "x.com"
    : type === "threads" ? "threads.net"
    : type === "google_business" ? "google.com/maps"
    : "";
  if (!needle) return "";
  return profiles.find((item) => item.toLowerCase().includes(needle)) ?? "";
}
