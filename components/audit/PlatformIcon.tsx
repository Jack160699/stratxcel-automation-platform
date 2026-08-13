import type { ReactNode } from "react";
import { ChartIcon, GlobeIcon } from "@/components/shell/navigation/shared-icons";

export type PlatformIconKey =
  | "website"
  | "google_business"
  | "google"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "youtube"
  | "x"
  | "threads"
  | "whatsapp"
  | "reviews"
  | "analytics"
  | "marketplace"
  | "other";

function wrap(label: string, children: ReactNode) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true" title={label}>
      {children}
    </span>
  );
}

export function PlatformIcon({ name, className }: { name: PlatformIconKey | string; className?: string }) {
  const key = name === "google" ? "google_business" : name;
  const svgClass = className ?? "h-4 w-4";
  switch (key) {
    case "website":
    case "other":
      return wrap("Website", <GlobeIcon />);
    case "google_business":
      return wrap("Google Business", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M16.5 9.2c0-.6-.05-1.18-.15-1.73H9.2v3.28h4.1a3.5 3.5 0 01-1.52 2.3v1.9h2.46c1.44-1.33 2.26-3.28 2.26-5.75z" />
          <path fill="#34A853" d="M9.2 16.5c2.05 0 3.78-.68 5.04-1.85l-2.46-1.9c-.68.46-1.56.73-2.58.73-1.98 0-3.66-1.34-4.26-3.14H2.4v1.96A7.3 7.3 0 009.2 16.5z" />
          <path fill="#FBBC05" d="M4.94 10.34A4.38 4.38 0 014.7 9c0-.47.08-.92.24-1.34V5.7H2.4A7.3 7.3 0 001.9 9c0 1.18.28 2.3.5 3.3l2.54-1.96z" />
          <path fill="#EA4335" d="M9.2 4.52c1.12 0 2.12.38 2.91 1.14l2.18-2.18C12.97 2.2 11.25 1.5 9.2 1.5A7.3 7.3 0 002.4 5.7l2.54 1.96c.6-1.8 2.28-3.14 4.26-3.14z" />
        </svg>
      ));
    case "instagram":
      return wrap("Instagram", (
        <svg className={svgClass} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2.2" y="2.2" width="13.6" height="13.6" rx="4" stroke="#E1306C" strokeWidth="1.5" />
          <circle cx="9" cy="9" r="3.2" stroke="#E1306C" strokeWidth="1.5" />
          <circle cx="12.7" cy="5.3" r="0.8" fill="#E1306C" />
        </svg>
      ));
    case "facebook":
      return wrap("Facebook", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#1877F2" d="M16.2 9A7.2 7.2 0 109 16.2V10.8h-1.8V9H9V7.65c0-1.78 1.06-2.76 2.68-2.76.78 0 1.6.14 1.6.14V6.7h-.9c-.89 0-1.16.55-1.16 1.12V9h1.98l-.32 1.8H11.22v5.4A7.2 7.2 0 0016.2 9z" />
        </svg>
      ));
    case "linkedin":
      return wrap("LinkedIn", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <rect width="18" height="18" rx="2" fill="#0A66C2" />
          <path fill="#fff" d="M5.4 7.2H3.6v7.2h1.8V7.2zM4.5 3.6a1.05 1.05 0 100 2.1 1.05 1.05 0 000-2.1zM14.4 10.05c0-2.1-1.12-3.08-2.62-3.08-1.2 0-1.74.66-2.04 1.12V7.2H8.1c.02.52 0 7.2 0 7.2h1.64V10.2c0-.2.02-.4.08-.54.16-.4.54-.82 1.16-.82.82 0 1.14.62 1.14 1.54v3.82h1.64v-4.15z" />
        </svg>
      ));
    case "youtube":
      return wrap("YouTube", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <rect x="1.5" y="4.5" width="15" height="9" rx="2.2" fill="#FF0000" />
          <path fill="#fff" d="M8 7.2l4 2.3-4 2.3V7.2z" />
        </svg>
      ));
    case "x":
      return wrap("X", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <path fill="currentColor" d="M3.2 3.4h3.1l3.05 4.18L12.7 3.4H15l-4.52 5.7L15.3 14.6h-3.1l-3.3-4.5-3.55 4.5H2.2l4.8-5.92L3.2 3.4z" />
        </svg>
      ));
    case "threads":
      return wrap("Threads", (
        <svg className={svgClass} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="6.4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.4 8.2c.4-1.6 1.7-2.4 3.4-2.2 2 .2 3 1.6 2.8 3.4-.2 1.7-1.3 2.6-2.9 2.8-1.4.16-2.6-.4-3-1.6" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      ));
    case "whatsapp":
      return wrap("WhatsApp", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#25D366" d="M9 1.6A7.4 7.4 0 003.4 13.1L2.2 16.4l3.4-1.12A7.4 7.4 0 109 1.6z" />
          <path fill="#fff" d="M12.55 10.85c-.2.5-.92.92-1.28.98-.32.06-.72.08-1.16-.08-.27-.1-.62-.22-1.08-.42-1.86-.82-3.08-2.7-3.18-2.82-.1-.14-.7-.92-.7-1.74s.44-1.24.6-1.42c.14-.16.32-.2.42-.2h.3c.1 0 .24 0 .36.28.14.32.46 1.12.5 1.2.04.08.06.18 0 .3-.06.12-.1.2-.2.3l-.28.36c-.1.1-.2.22-.08.44.12.22.4.68.86 1.1.58.52 1.08.68 1.26.76.18.08.28.06.38-.04.1-.12.44-.52.56-.7.12-.16.24-.14.4-.08.16.06 1.04.5 1.22.58.18.08.3.14.34.22.05.08.05.46-.14.96z" />
        </svg>
      ));
    case "reviews":
      return wrap("Reviews", (
        <svg className={svgClass} viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
          <path d="M9 2.4l1.7 3.46 3.82.56-2.76 2.7.65 3.8L9 11.12 5.59 12.92l.65-3.8-2.76-2.7 3.82-.56L9 2.4z" />
        </svg>
      ));
    case "analytics":
      return wrap("Analytics", <ChartIcon />);
    case "marketplace":
      return wrap("Marketplace", (
        <svg className={svgClass} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <path d="M3 6.5h12l-1 7.5H4L3 6.5Z" />
          <path d="M6 6.5V5a3 3 0 016 0v1.5" />
        </svg>
      ));
    default:
      return wrap("Source", <GlobeIcon />);
  }
}

export const PLATFORM_LABELS: Record<PlatformIconKey, string> = {
  website: "Website",
  google_business: "Google Business / Maps",
  google: "Google Business / Maps",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X",
  threads: "Threads",
  whatsapp: "WhatsApp",
  reviews: "Reviews",
  analytics: "Analytics",
  marketplace: "Marketplace / store",
  other: "Other",
};
