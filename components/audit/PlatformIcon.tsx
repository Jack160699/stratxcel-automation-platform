import type { ReactNode } from "react";
import { ChartIcon, GlobeIcon } from "@/components/shell/navigation/shared-icons";

export type PlatformIconKey =
  | "website"
  | "google_business"
  | "google_search_console"
  | "google_analytics"
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
    case "google_search_console":
      return wrap("Google", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M16.5 9.2c0-.6-.05-1.18-.15-1.73H9.2v3.28h4.1a3.5 3.5 0 01-1.52 2.3v1.9h2.46c1.44-1.33 2.26-3.28 2.26-5.75z" />
          <path fill="#34A853" d="M9.2 16.5c2.05 0 3.78-.68 5.04-1.85l-2.46-1.9c-.68.46-1.56.73-2.58.73-1.98 0-3.66-1.34-4.26-3.14H2.4v1.96A7.3 7.3 0 009.2 16.5z" />
          <path fill="#FBBC05" d="M4.94 10.34A4.38 4.38 0 014.7 9c0-.47.08-.92.24-1.34V5.7H2.4A7.3 7.3 0 001.9 9c0 1.18.28 2.3.5 3.3l2.54-1.96z" />
          <path fill="#EA4335" d="M9.2 4.52c1.12 0 2.12.38 2.91 1.14l2.18-2.18C12.97 2.2 11.25 1.5 9.2 1.5A7.3 7.3 0 002.4 5.7l2.54 1.96c.6-1.8 2.28-3.14 4.26-3.14z" />
        </svg>
      ));

    case "google_analytics":
    case "analytics":
      return wrap("Google Analytics", (
        <svg className={svgClass} viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="9" width="3.5" height="7" rx="1" fill="#F9AB00" />
          <rect x="7.25" y="5" width="3.5" height="11" rx="1" fill="#E37400" />
          <rect x="12.5" y="2" width="3.5" height="14" rx="1" fill="#EA4335" />
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

    case "youtube":
      return wrap("YouTube", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <rect x="1.5" y="4.5" width="15" height="9" rx="2.2" fill="#FF0000" />
          <path fill="#fff" d="M8 7.2l4 2.3-4 2.3V7.2z" />
        </svg>
      ));

    case "threads":
      return wrap("Threads", (
        <svg className={svgClass} viewBox="0 0 192 192" fill="currentColor" aria-hidden="true">
          <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4184 44.7443 97.2748 44.744 97.1311 44.744C73.2384 44.744 54.4098 62.4639 53.6191 85.9535C52.7845 110.749 69.4588 131.696 93.3039 134.783C114.542 137.533 133.027 127.323 138.835 110.421C139.845 107.481 140.485 104.378 140.762 101.127H118.527C118.257 102.502 117.845 103.805 117.29 105.021C114.072 112.073 104.811 116.143 94.6757 114.619C80.3551 112.468 70.3879 99.7915 70.892 84.8197C71.3683 70.6698 82.6865 59.9882 97.1311 59.9882C97.228 59.9882 97.3251 59.9884 97.4221 59.9889C111.455 60.0784 120.902 68.6479 122.38 83.5651C116.924 81.3683 110.871 80.1192 104.382 80.1192C78.4316 80.1192 63.9312 94.5098 63.9312 113.882C63.9312 133.307 78.4839 147.256 97.8016 147.256C117.119 147.256 131.395 133.56 134.184 114.57C137.494 118.423 140.16 122.846 141.97 127.751C145.474 137.242 145.549 147.531 142.186 156.76C138.823 165.989 132.28 173.479 123.731 177.882C114.075 182.854 102.585 184.887 91.0204 183.67C65.2341 180.957 43.8643 162.776 37.108 137.828C30.3517 112.879 39.3807 85.5539 59.8856 68.9663C80.3905 52.3787 108.643 49.5298 131.189 61.7854C136.216 64.5186 142.457 62.6375 145.19 57.6106C147.923 52.5837 146.042 46.3426 141.015 43.6094C112.883 28.3182 77.6253 31.8732 52.0392 52.5714C26.4532 73.2697 15.1863 107.366 23.6173 138.5C32.0483 169.634 58.7138 192.321 90.8931 195.707C105.323 197.225 119.66 194.689 131.708 188.449C143.084 182.551 151.791 172.582 156.267 160.298C160.742 148.013 160.643 134.319 155.979 121.684C153.308 114.453 149.336 107.962 144.298 102.395C144.512 97.8767 144.285 93.3854 141.537 88.9883ZM97.8016 131.956C87.4116 131.956 79.2312 124.629 79.2312 113.882C79.2312 103.083 87.4639 95.4187 97.8016 95.4187C104.286 95.4187 110.134 97.5144 114.869 101.402C112.247 119.539 104.596 131.956 97.8016 131.956Z" />
        </svg>
      ));

    case "linkedin":
      return wrap("LinkedIn", (
        <svg className={svgClass} viewBox="0 0 18 18" aria-hidden="true">
          <rect width="18" height="18" rx="2" fill="#0A66C2" />
          <path fill="#fff" d="M5.4 7.2H3.6v7.2h1.8V7.2zM4.5 3.6a1.05 1.05 0 100 2.1 1.05 1.05 0 000-2.1zM14.4 10.05c0-2.1-1.12-3.08-2.62-3.08-1.2 0-1.74.66-2.04 1.12V7.2H8.1c.02.52 0 7.2 0 7.2h1.64V10.2c0-.2.02-.4.08-.54.16-.4.54-.82 1.16-.82.82 0 1.14.62 1.14 1.54v3.82h1.64v-4.15z" />
        </svg>
      ));

    case "x":
      return wrap("X", (
        <svg className={svgClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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
  google_search_console: "Google Search Console",
  google_analytics: "Google Analytics",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  threads: "Threads",
  linkedin: "LinkedIn",
  x: "X",
  whatsapp: "WhatsApp",
  reviews: "Reviews",
  analytics: "Analytics",
  marketplace: "Marketplace / store",
  other: "Other",
};
