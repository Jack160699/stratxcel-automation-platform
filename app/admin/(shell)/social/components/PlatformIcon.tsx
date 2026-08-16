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
        <svg viewBox="0 0 192 192" width="11" height="11" fill="currentColor" aria-hidden="true">
          <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4184 44.7443 97.2748 44.744 97.1311 44.744C73.2384 44.744 54.4098 62.4639 53.6191 85.9535C52.7845 110.749 69.4588 131.696 93.3039 134.783C114.542 137.533 133.027 127.323 138.835 110.421C139.845 107.481 140.485 104.378 140.762 101.127H118.527C118.257 102.502 117.845 103.805 117.29 105.021C114.072 112.073 104.811 116.143 94.6757 114.619C80.3551 112.468 70.3879 99.7915 70.892 84.8197C71.3683 70.6698 82.6865 59.9882 97.1311 59.9882C97.228 59.9882 97.3251 59.9884 97.4221 59.9889C111.455 60.0784 120.902 68.6479 122.38 83.5651C116.924 81.3683 110.871 80.1192 104.382 80.1192C78.4316 80.1192 63.9312 94.5098 63.9312 113.882C63.9312 133.307 78.4839 147.256 97.8016 147.256C117.119 147.256 131.395 133.56 134.184 114.57C137.494 118.423 140.16 122.846 141.97 127.751C145.474 137.242 145.549 147.531 142.186 156.76C138.823 165.989 132.28 173.479 123.731 177.882C114.075 182.854 102.585 184.887 91.0204 183.67C65.2341 180.957 43.8643 162.776 37.108 137.828C30.3517 112.879 39.3807 85.5539 59.8856 68.9663C80.3905 52.3787 108.643 49.5298 131.189 61.7854C136.216 64.5186 142.457 62.6375 145.19 57.6106C147.923 52.5837 146.042 46.3426 141.015 43.6094C112.883 28.3182 77.6253 31.8732 52.0392 52.5714C26.4532 73.2697 15.1863 107.366 23.6173 138.5C32.0483 169.634 58.7138 192.321 90.8931 195.707C105.323 197.225 119.66 194.689 131.708 188.449C143.084 182.551 151.791 172.582 156.267 160.298C160.742 148.013 160.643 134.319 155.979 121.684C153.308 114.453 149.336 107.962 144.298 102.395C144.512 97.8767 144.285 93.3854 141.537 88.9883ZM97.8016 131.956C87.4116 131.956 79.2312 124.629 79.2312 113.882C79.2312 103.083 87.4639 95.4187 97.8016 95.4187C104.286 95.4187 110.134 97.5144 114.869 101.402C112.247 119.539 104.596 131.956 97.8016 131.956Z" />
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
