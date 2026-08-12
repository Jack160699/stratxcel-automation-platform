export type Platform = "instagram" | "facebook" | "threads" | "linkedin" | "youtube";

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

/** Restrained brand tint per platform — used only as a low-opacity chip background, never a loud gradient. */
const PLATFORM_TINT: Record<Platform, string> = {
  instagram: "227 41 122",
  facebook: "24 119 242",
  threads: "230 230 230",
  linkedin: "10 102 194",
  youtube: "255 0 0",
};

function Glyph({ platform }: { platform: Platform }) {
  switch (platform) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
          <path
            d="M15 8.5h2V5.3c-.35-.05-1.55-.15-2.95-.15-2.92 0-4.92 1.78-4.92 5.05V13H6.5v3.6h2.63V22h3.62v-5.4h2.52l.4-3.6h-2.92V10.6c0-1.04.28-1.75 1.78-1.75Z"
            fill="currentColor"
          />
        </svg>
      );
    case "threads":
      return (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
          <path
            d="M16.5 11.3c-.15-3.4-2.1-5.4-5.2-5.4-2.9 0-5.1 1.9-5.1 5.7v.8c0 3.8 2.2 5.7 5.1 5.7 2.5 0 4.1-1.15 4.7-2.9M9.2 11.4h4.6c1.5 0 2.6.85 2.6 2.35 0 1.7-1.4 2.55-3.3 2.55-1.6 0-2.7-.7-2.7-1.85 0-1.35 1.5-1.9 3.5-1.9 1.15 0 2 .15 2.5.3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="7.2" cy="8" r="1.2" fill="currentColor" />
          <path d="M7.2 11v6M11 11v6M11 13.6c0-1.6 1-2.6 2.4-2.6 1.4 0 2.4 1 2.4 2.6V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10.5 9.7v4.6l4-2.3-4-2.3Z" fill="currentColor" />
        </svg>
      );
  }
}

/**
 * Small brand-tinted chip + monochrome glyph, sized for inline use next to
 * account names — never a full-color logo, so it stays compatible with the
 * dark Command Center surface.
 */
export function PlatformIcon({ platform, size = 20 }: { platform: Platform; size?: number }) {
  const tint = PLATFORM_TINT[platform];
  return (
    <span
      role="img"
      aria-label={PLATFORM_LABEL[platform]}
      className="inline-flex shrink-0 items-center justify-center rounded-md"
      style={{
        width: size,
        height: size,
        background: `rgb(${tint} / 0.16)`,
        color: `rgb(${tint})`,
      }}
    >
      <Glyph platform={platform} />
    </span>
  );
}

export function platformLabel(platform: Platform): string {
  return PLATFORM_LABEL[platform];
}
