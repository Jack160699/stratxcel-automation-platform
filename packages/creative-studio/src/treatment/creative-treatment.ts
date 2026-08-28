import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

export type LayoutArchetype = "SPLIT_BANNER" | "FLOATING_CARD" | "EDITORIAL_FRAME";
export type LogoVariantType = "transparent" | "monoDark" | "monoLight" | "badge";

export interface CreativeData {
  industryKey: string;
  industryName: string;
  businessName: string;
  businessInitial: string;
  tagline: string;
  badge: string;
  headline: string;
  subtitle: string;
  valuePoints: string[];
  cta: string;
  contactPhone: string;
  contactLocation: string;
  contactHandle: string;
  primaryColor: string;
  secondaryColor: string;
  archetype: LayoutArchetype;
  preferredLogoVariant?: LogoVariantType;
  qualityScore?: number;
  realPhotoPath?: string;
}

export interface RenderedCreativeResult {
  industryKey: string;
  industryName: string;
  businessName: string;
  archetype: LayoutArchetype;
  selectedLogoVariant: LogoVariantType;
  headline: string;
  cta: string;
  contactFooter: string;
  score: number;
  imageFileName: string;
  imageRelativePath: string;
  width: number;
  height: number;
}

/**
 * Deterministic Logo Variant Resolver
 * Selects the optimal logo mark variant (transparent, monoDark, monoLight, badge)
 * based on layout archetype, contrast requirements, and composition target.
 */
export function resolveLogoVariant(archetype: LayoutArchetype, backgroundTone: "dark" | "light" | "vibrant" = "dark"): LogoVariantType {
  switch (archetype) {
    case "SPLIT_BANNER":
      return "monoLight";
    case "FLOATING_CARD":
      return "badge";
    case "EDITORIAL_FRAME":
      return "transparent";
    default:
      return "monoLight";
  }
}

/**
 * Generate SVG for a Logo Mark based on variant type and brand colors
 */
export function renderLogoSvg(
  businessName: string,
  initial: string,
  variant: LogoVariantType,
  accentColor = "#2563eb",
  size = 64
): string {
  const safeName = businessName.replace(/[<>&"]/g, "").slice(0, 20);
  const safeInitial = initial.slice(0, 2).toUpperCase();

  if (variant === "badge") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 3}" height="${size}" viewBox="0 0 ${size * 3} ${size}">
      <defs>
        <linearGradient id="badgeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${accentColor}"/>
          <stop offset="100%" stop-color="#3b82f6"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="${size * 3 - 4}" height="${size - 4}" rx="${(size - 4) / 2}" fill="#0f172a" stroke="url(#badgeGlow)" stroke-width="2"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 8}" fill="url(#badgeGlow)"/>
      <text x="${size / 2}" y="${size / 2 + 6}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.35}" font-weight="900" text-anchor="middle">${safeInitial}</text>
      <text x="${size + 8}" y="${size / 2 + 5}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.28}" font-weight="800" letter-spacing="0.5">${safeName}</text>
    </svg>`;
  }

  if (variant === "monoLight") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 3}" height="${size}" viewBox="0 0 ${size * 3} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 6}" fill="#ffffff" opacity="0.2" stroke="#ffffff" stroke-width="1.5"/>
      <text x="${size / 2}" y="${size / 2 + 6}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.38}" font-weight="900" text-anchor="middle">${safeInitial}</text>
      <text x="${size + 8}" y="${size / 2 + 5}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.28}" font-weight="800" letter-spacing="0.5">${safeName}</text>
    </svg>`;
  }

  if (variant === "monoDark") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 3}" height="${size}" viewBox="0 0 ${size * 3} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 6}" fill="#0f172a" stroke="#1e293b" stroke-width="1.5"/>
      <text x="${size / 2}" y="${size / 2 + 6}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.38}" font-weight="900" text-anchor="middle">${safeInitial}</text>
      <text x="${size + 8}" y="${size / 2 + 5}" fill="#0f172a" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.28}" font-weight="800" letter-spacing="0.5">${safeName}</text>
    </svg>`;
  }

  // transparent / icon mark
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 3}" height="${size}" viewBox="0 0 ${size * 3} ${size}">
    <rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="12" fill="${accentColor}" opacity="0.95"/>
    <text x="${size / 2}" y="${size / 2 + 7}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.4}" font-weight="900" text-anchor="middle">${safeInitial}</text>
    <text x="${size + 10}" y="${size / 2 + 6}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${size * 0.3}" font-weight="800" letter-spacing="0.8">${safeName}</text>
  </svg>`;
}

/**
 * Generate layout archetype SVG overlay with high-contrast commercial design
 */
export function generateLayoutArchetypeSvg(data: CreativeData): string {
  const {
    businessName,
    businessInitial,
    badge,
    headline,
    subtitle,
    valuePoints,
    cta,
    contactPhone,
    contactLocation,
    contactHandle,
    primaryColor,
    secondaryColor,
    archetype,
  } = data;

  const safeHeadline = headline.replace(/[<>&"]/g, "");
  const safeSubtitle = subtitle.replace(/[<>&"]/g, "");
  const safeBadge = badge.replace(/[<>&"]/g, "");
  const safeCta = cta.replace(/[<>&"]/g, "");
  const safePhone = contactPhone.replace(/[<>&"]/g, "");
  const safeLocation = contactLocation.replace(/[<>&"]/g, "");
  const safeHandle = contactHandle.replace(/[<>&"]/g, "");

  const logoVariant = data.preferredLogoVariant || resolveLogoVariant(archetype);
  const logoSvg = renderLogoSvg(businessName, businessInitial, logoVariant, primaryColor, 56);

  if (archetype === "SPLIT_BANNER") {
    // 1080x1080 Split Banner: Real Photo in upper 520px with smooth gradient into bottom dark slate banner
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <defs>
        <linearGradient id="splitGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#090d16" stop-opacity="0"/>
          <stop offset="40%" stop-color="#090d16" stop-opacity="0.85"/>
          <stop offset="60%" stop-color="#090d16" stop-opacity="0.98"/>
          <stop offset="100%" stop-color="#030712" stop-opacity="1"/>
        </linearGradient>
        <linearGradient id="accentGlow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${primaryColor}"/>
          <stop offset="100%" stop-color="${secondaryColor}"/>
        </linearGradient>
        <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.6"/>
        </filter>
      </defs>

      <!-- Top Brand Logo Pill Overlay on Photo -->
      <g transform="translate(60, 48)">
        <rect x="0" y="0" width="280" height="60" rx="30" fill="rgba(15, 23, 42, 0.82)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5"/>
        <g transform="translate(10, 2)">
          ${logoSvg}
        </g>
      </g>

      <!-- Bottom Split Banner Overlay -->
      <rect x="0" y="440" width="1080" height="640" fill="url(#splitGradient)"/>
      <line x1="0" y1="520" x2="1080" y2="520" stroke="url(#accentGlow)" stroke-width="3.5"/>

      <!-- Category / Promo Badge -->
      <g transform="translate(60, 555)">
        <rect x="0" y="0" width="230" height="38" rx="19" fill="url(#accentGlow)"/>
        <text x="115" y="24" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="900" text-anchor="middle" letter-spacing="2">${safeBadge}</text>
      </g>

      <!-- Bold Headline -->
      <text x="60" y="650" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="900" letter-spacing="-0.5">
        <tspan x="60" dy="0">${safeHeadline.slice(0, 36)}</tspan>
        <tspan x="60" dy="50">${safeHeadline.slice(36, 72)}</tspan>
      </text>

      <!-- Subtitle / Value Propositions -->
      <text x="60" y="780" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="500">
        <tspan x="60" dy="0">${safeSubtitle.slice(0, 60)}</tspan>
        <tspan x="60" dy="30">${safeSubtitle.slice(60, 120)}</tspan>
      </text>

      <!-- High-Conversion WhatsApp CTA Button -->
      <g transform="translate(60, 885)">
        <rect x="0" y="0" width="440" height="64" rx="32" fill="#ffffff" filter="url(#cardShadow)"/>
        <text x="220" y="40" fill="#090d16" font-family="system-ui, -apple-system, sans-serif" font-size="19" font-weight="900" text-anchor="middle">${safeCta}</text>
      </g>

      <!-- Verified Contact Footer -->
      <g transform="translate(60, 990)">
        <line x1="0" y1="0" x2="960" y2="0" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1"/>
        <text x="0" y="32" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600">
          📍 ${safeLocation}   |   📞 ${safePhone}   |   💬 ${safeHandle}
        </text>
        <text x="960" y="32" fill="${primaryColor}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" text-anchor="end">
          StratXcel Autopilot ⚡
        </text>
      </g>
    </svg>`;
  }

  if (archetype === "FLOATING_CARD") {
    // 1080x1080 Floating Card: Full bleed real photo + Frosted Glass Floating Center Card
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <defs>
        <linearGradient id="photoVignette" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.2"/>
          <stop offset="60%" stop-color="#000000" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.75"/>
        </linearGradient>
        <linearGradient id="glassCard" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#090d16" stop-opacity="0.94"/>
          <stop offset="100%" stop-color="#0f172a" stop-opacity="0.90"/>
        </linearGradient>
        <linearGradient id="accentPill" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${primaryColor}"/>
          <stop offset="100%" stop-color="${secondaryColor}"/>
        </linearGradient>
        <filter id="deepBlur" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="16" stdDeviation="30" flood-color="#000000" flood-opacity="0.7"/>
        </filter>
      </defs>

      <!-- Overall Subtle Darkening Vignette for Photo -->
      <rect x="0" y="0" width="1080" height="1080" fill="url(#photoVignette)"/>

      <!-- Elevated Floating Glass Card -->
      <g transform="translate(60, 420)" filter="url(#deepBlur)">
        <rect x="0" y="0" width="960" height="600" rx="32" fill="url(#glassCard)" stroke="rgba(255, 255, 255, 0.22)" stroke-width="2"/>
        
        <!-- Header: Logo Lockup & Badge Chip -->
        <g transform="translate(48, 48)">
          <g transform="translate(0, 0)">
            ${logoSvg}
          </g>
          <g transform="translate(640, 10)">
            <rect x="0" y="0" width="220" height="36" rx="18" fill="url(#accentPill)"/>
            <text x="110" y="23" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="900" text-anchor="middle" letter-spacing="1.5">${safeBadge}</text>
          </g>
        </g>

        <!-- Bold Hook & Main Title -->
        <text x="48" y="180" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="900" letter-spacing="-0.5">
          <tspan x="48" dy="0">${safeHeadline.slice(0, 38)}</tspan>
          <tspan x="48" dy="48">${safeHeadline.slice(38, 76)}</tspan>
        </text>

        <!-- Bullet Highlights -->
        <g transform="translate(48, 290)">
          ${(valuePoints.length ? valuePoints : [safeSubtitle.slice(0, 50), safeSubtitle.slice(50, 100)]).slice(0, 2).map((pt, i) => `
            <g transform="translate(0, ${i * 40})">
              <circle cx="10" cy="10" r="10" fill="${primaryColor}"/>
              <text x="10" y="14" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="bold" text-anchor="middle">✓</text>
              <text x="32" y="16" fill="#cbd5e1" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="600">${pt.replace(/[<>&"]/g, "").slice(0, 56)}</text>
            </g>
          `).join("")}
        </g>

        <!-- Action Button -->
        <g transform="translate(48, 410)">
          <rect x="0" y="0" width="460" height="60" rx="30" fill="url(#accentPill)"/>
          <text x="230" y="38" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="19" font-weight="800" text-anchor="middle">${safeCta}</text>
        </g>

        <!-- Bottom Contact Row -->
        <g transform="translate(48, 520)">
          <line x1="0" y1="0" x2="864" y2="0" stroke="rgba(255, 255, 255, 0.15)" stroke-width="1"/>
          <text x="0" y="34" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">
            📍 ${safeLocation}   •   📞 ${safePhone}
          </text>
          <text x="864" y="34" fill="#cbd5e1" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" text-anchor="end">
            ${safeHandle}
          </text>
        </g>
      </g>
    </svg>`;
  }

  // EDITORIAL_FRAME: Luxury high-fashion frame over real photo with gilded borders
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    <defs>
      <linearGradient id="editorialGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#090d16" stop-opacity="0.94"/>
        <stop offset="100%" stop-color="#030712" stop-opacity="0.88"/>
      </linearGradient>
      <linearGradient id="goldBorder" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryColor}"/>
        <stop offset="50%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="${secondaryColor}"/>
      </linearGradient>
    </defs>

    <!-- Outer Inset Border & Corner Accents -->
    <rect x="40" y="40" width="1000" height="1000" rx="16" fill="none" stroke="url(#goldBorder)" stroke-width="3" opacity="0.95"/>
    <rect x="52" y="52" width="976" height="976" rx="12" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>

    <!-- Top Editorial Header Bar Pill -->
    <g transform="translate(80, 75)">
      <rect x="0" y="0" width="920" height="65" rx="16" fill="rgba(9, 13, 22, 0.75)" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1"/>
      <g transform="translate(20, 4)">
        ${logoSvg}
      </g>
      <text x="890" y="38" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="900" text-anchor="end" letter-spacing="3">
        ${safeBadge.toUpperCase()}
      </text>
    </g>

    <!-- Bottom Editorial Narrative Box -->
    <g transform="translate(80, 680)">
      <rect x="0" y="0" width="920" height="280" rx="20" fill="url(#editorialGlow)" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1.5"/>

      <!-- Editorial Headline -->
      <text x="40" y="70" fill="#ffffff" font-family="Georgia, Cambria, 'Times New Roman', serif" font-size="38" font-weight="bold" letter-spacing="0.5">
        <tspan x="40" dy="0">${safeHeadline.slice(0, 36)}</tspan>
        <tspan x="40" dy="48">${safeHeadline.slice(36, 74)}</tspan>
      </text>

      <!-- Subtitle / Narrative Excerpt -->
      <text x="40" y="185" fill="#e2e8f0" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="500">
        ${safeSubtitle.slice(0, 85)}
      </text>

      <!-- WhatsApp Booking Action -->
      <g transform="translate(40, 215)">
        <rect x="0" y="0" width="380" height="46" rx="23" fill="url(#goldBorder)"/>
        <text x="190" y="29" fill="#0f172a" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="900" text-anchor="middle">${safeCta}</text>
      </g>

      <!-- Single Line Editorial Footer -->
      <text x="880" y="244" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" text-anchor="end">
        📍 ${safeLocation}  |  📞 ${safePhone}
      </text>
    </g>
  </svg>`;
}

/**
 * Composite full 1080x1080 final commercial creative using Sharp with Real Photography
 */
export async function renderCommercialCreative(data: CreativeData): Promise<Buffer> {
  const overlaySvg = generateLayoutArchetypeSvg(data);
  const overlayBuffer = Buffer.from(overlaySvg);

  let baseSharp: ReturnType<typeof sharp>;

  if (data.realPhotoPath && fs.existsSync(data.realPhotoPath)) {
    // Resize and crop real photographic image to exact 1080x1080 square
    baseSharp = sharp(data.realPhotoPath)
      .resize(1080, 1080, {
        fit: "cover",
        position: "center",
      });
  } else {
    // Fallback if no path provided
    const fallbackCanvas = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
      <rect width="1080" height="1080" fill="#0f172a"/>
    </svg>`;
    baseSharp = sharp(Buffer.from(fallbackCanvas)).resize(1080, 1080);
  }

  const finalImage = await baseSharp
    .composite([
      {
        input: overlayBuffer,
        top: 0,
        left: 0,
      },
    ])
    .png({ quality: 95 })
    .toBuffer();

  return finalImage;
}
