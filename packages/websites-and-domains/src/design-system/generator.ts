/**
 * Design System Generator
 *
 * Synthesizes a validated DesignSystem from brand information, reference
 * website intelligence, and customer tone/industry preferences.
 */

import type { DesignSystem, ColorTokenGroup, TypographyTokens, SpacingTokens, RadiusTokens, ShadowTokens, ComponentTokens } from "./schema.ts";
import type { WebsiteUnderstanding } from "../intelligence/schema.ts";
import type { BusinessBrandContext } from "../generation/types.ts";

export interface DesignSystemOptions {
  brandName: string;
  industry?: string;
  targetAudience?: string;
  brandTone?: string;
  suppliedColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
  };
  referenceUnderstanding?: WebsiteUnderstanding;
  aestheticOverride?: "luxury" | "modern-saas" | "retail" | "service" | "minimal" | "vibrant";
}

export function generateDesignSystem(options: DesignSystemOptions): DesignSystem {
  const aesthetic = determineAesthetic(options);
  const colors = buildColorSystem(aesthetic, options.suppliedColors, options.referenceUnderstanding);
  const typography = buildTypography(aesthetic, options.referenceUnderstanding);
  const spacing = buildSpacing(aesthetic);
  const radius = buildRadius(aesthetic);
  const shadows = buildShadows(aesthetic);
  const components = buildComponents(colors, radius, shadows, aesthetic);

  return {
    version: "1.0",
    aesthetic,
    colors: {
      brand: colors,
      semantic: {
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
    },
    typography,
    spacing,
    radius,
    shadows,
    components,
    responsive: {
      mobile: 320,
      tablet: 768,
      desktop: 1024,
      wide: 1440,
    },
    accessibility: {
      wcagLevel: "AA",
      minTouchTargetPx: 44,
      enforceContrastRatio: true,
      minContrastRatioNormal: 4.5,
      minContrastRatioLarge: 3.0,
      enforceAltText: true,
      supportReducedMotion: true,
    },
  };
}

function determineAesthetic(options: DesignSystemOptions): "luxury" | "modern-saas" | "retail" | "service" | "minimal" | "vibrant" {
  if (options.aestheticOverride) return options.aestheticOverride;

  const combined = `${options.brandTone || ""} ${options.industry || ""}`.toLowerCase();

  if (/\b(luxury|bespoke|high-end|jewelry|haute)\b/i.test(combined)) {
    return "luxury";
  }
  if (/\b(saas|software|technology|developer|cloud|platform|\bai\b)\b/i.test(combined)) {
    return "modern-saas";
  }
  if (/\b(apparel|clothing|store|retail|fashion|shop|boutique|merchandise|streetwear)\b/i.test(combined)) {
    return "retail";
  }
  if (/\b(consulting|legal|law|advisory|finance|financial|agency|clinic|medical)\b/i.test(combined)) {
    return "service";
  }
  if (/\b(playful|vibrant|creative|art|kids|game)\b/i.test(combined)) {
    return "vibrant";
  }
  return "minimal";
}

function buildColorSystem(
  aesthetic: string,
  supplied?: { primary?: string; secondary?: string; accent?: string; background?: string },
  reference?: WebsiteUnderstanding
): ColorTokenGroup {
  let primary = supplied?.primary;
  let secondary = supplied?.secondary;
  let accent = supplied?.accent;
  let background = supplied?.background || "#FFFFFF";
  let surface = "#F8FAFC";
  let text = "#0F172A";
  let textMuted = "#64748B";
  let border = "#E2E8F0";

  // Inspiration from reference site if no brand colors were explicitly supplied
  if (!primary && reference?.colorSystem?.primary) {
    primary = reference.colorSystem.primary;
    secondary = reference.colorSystem.secondary || "#334155";
    accent = reference.colorSystem.accent || "#0284C7";
  }

  switch (aesthetic) {
    case "luxury":
      primary = primary || "#0F172A";
      secondary = secondary || "#1E293B";
      accent = accent || "#C5A880"; // Refined Champagne Gold
      background = "#FCFCFC";
      surface = "#F4F1EA";
      text = "#111827";
      textMuted = "#6B7280";
      border = "#E5E1D8";
      break;

    case "modern-saas":
      primary = primary || "#2563EB"; // Royal Indigo Blue
      secondary = secondary || "#475569";
      accent = accent || "#06B6D4";
      background = "#FFFFFF";
      surface = "#F8FAFC";
      text = "#0F172A";
      textMuted = "#64748B";
      border = "#E2E8F0";
      break;

    case "retail":
      primary = primary || "#111827";
      secondary = secondary || "#374151";
      accent = accent || "#E11D48"; // Crimson Accent for Add-to-Cart
      background = "#FFFFFF";
      surface = "#FAFAFA";
      text = "#09090B";
      textMuted = "#71717A";
      border = "#E4E4E7";
      break;

    case "vibrant":
      primary = primary || "#7C3AED";
      secondary = secondary || "#EC4899";
      accent = accent || "#F59E0B";
      background = "#FFFFFF";
      surface = "#FAF5FF";
      text = "#1E1B4B";
      textMuted = "#6B7280";
      border = "#F3E8FF";
      break;

    case "service":
    case "minimal":
    default:
      primary = primary || "#0D9488"; // Teal / Slate
      secondary = secondary || "#334155";
      accent = accent || "#F59E0B";
      background = "#FFFFFF";
      surface = "#F8FAFC";
      text = "#0F172A";
      textMuted = "#64748B";
      border = "#E2E8F0";
      break;
  }

  return { primary, secondary, accent, background, surface, text, textMuted, border };
}

function buildTypography(aesthetic: string, reference?: WebsiteUnderstanding): TypographyTokens {
  let headingFont = "Inter, -apple-system, BlinkMacSystemFont, sans-serif";
  let bodyFont = "Inter, -apple-system, BlinkMacSystemFont, sans-serif";

  if (aesthetic === "luxury") {
    headingFont = "Playfair Display, Georgia, serif";
    bodyFont = "Plus Jakarta Sans, sans-serif";
  } else if (aesthetic === "modern-saas") {
    headingFont = "Plus Jakarta Sans, sans-serif";
    bodyFont = "Inter, sans-serif";
  } else if (aesthetic === "retail") {
    headingFont = "Outfit, sans-serif";
    bodyFont = "Plus Jakarta Sans, sans-serif";
  } else if (reference?.typography?.primaryFont) {
    headingFont = reference.typography.headingsFont || reference.typography.primaryFont;
    bodyFont = reference.typography.primaryFont;
  }

  return {
    headingFont,
    bodyFont,
    monoFont: "JetBrains Mono, Menlo, monospace",
    weights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    scale: {
      h1: { fontSize: "3.25rem", lineHeight: "1.15", fontWeight: 700, letterSpacing: "-0.025em" },
      h2: { fontSize: "2.25rem", lineHeight: "1.25", fontWeight: 700, letterSpacing: "-0.02em" },
      h3: { fontSize: "1.75rem", lineHeight: "1.3", fontWeight: 600, letterSpacing: "-0.015em" },
      h4: { fontSize: "1.25rem", lineHeight: "1.4", fontWeight: 600, letterSpacing: "-0.01em" },
      bodyLarge: { fontSize: "1.125rem", lineHeight: "1.6", fontWeight: 400 },
      body: { fontSize: "1rem", lineHeight: "1.5", fontWeight: 400 },
      bodySmall: { fontSize: "0.875rem", lineHeight: "1.5", fontWeight: 400 },
      caption: { fontSize: "0.75rem", lineHeight: "1.4", fontWeight: 500, letterSpacing: "0.025em" },
    },
  };
}

function buildSpacing(aesthetic: string): SpacingTokens {
  const isSpacious = aesthetic === "luxury" || aesthetic === "minimal";

  return {
    unit: 4,
    scale: {
      xs: "0.25rem", // 4px
      sm: "0.5rem", // 8px
      md: "1rem", // 16px
      lg: isSpacious ? "2rem" : "1.5rem", // 32px or 24px
      xl: isSpacious ? "3rem" : "2rem", // 48px or 32px
      "2xl": isSpacious ? "4.5rem" : "3.5rem",
      "3xl": isSpacious ? "6rem" : "5rem",
      "4xl": isSpacious ? "8rem" : "7rem",
    },
    containerMaxWidths: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      full: isSpacious ? "1440px" : "1380px",
    },
  };
}

function buildRadius(aesthetic: string): RadiusTokens {
  if (aesthetic === "luxury") {
    return { none: "0px", sm: "2px", md: "4px", lg: "6px", full: "9999px" };
  }
  if (aesthetic === "minimal") {
    return { none: "0px", sm: "0px", md: "0px", lg: "0px", full: "0px" };
  }
  return { none: "0px", sm: "4px", md: "8px", lg: "16px", full: "9999px" };
}

function buildShadows(aesthetic: string): ShadowTokens {
  if (aesthetic === "minimal") {
    return { none: "none", sm: "none", md: "none", lg: "none", xl: "none" };
  }
  if (aesthetic === "luxury") {
    return {
      none: "none",
      sm: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
      md: "0 4px 12px 0 rgba(0, 0, 0, 0.04)",
      lg: "0 10px 24px 0 rgba(0, 0, 0, 0.06)",
      xl: "0 20px 40px 0 rgba(0, 0, 0, 0.08)",
      glow: "0 0 20px rgba(197, 168, 128, 0.25)",
    };
  }
  return {
    none: "none",
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
    glow: "0 0 15px rgba(37, 99, 235, 0.35)",
  };
}

function buildComponents(
  colors: ColorTokenGroup,
  radius: RadiusTokens,
  shadows: ShadowTokens,
  aesthetic: string
): ComponentTokens {
  const isLuxury = aesthetic === "luxury";

  return {
    button: {
      borderRadius: radius.md,
      paddingX: isLuxury ? "1.75rem" : "1.25rem",
      paddingY: isLuxury ? "0.875rem" : "0.625rem",
      fontWeight: isLuxury ? 500 : 600,
      focusRingColor: colors.accent,
      variants: {
        primary: {
          background: colors.primary,
          text: "#FFFFFF",
          hoverBackground: colors.secondary,
        },
        secondary: {
          background: colors.surface,
          text: colors.text,
          hoverBackground: colors.border,
        },
        outline: {
          border: colors.border,
          text: colors.text,
          hoverBackground: colors.surface,
        },
        ghost: {
          text: colors.text,
          hoverBackground: colors.surface,
        },
      },
    },
    card: {
      background: colors.background,
      border: colors.border,
      borderRadius: radius.lg,
      shadow: shadows.md,
      padding: isLuxury ? "2rem" : "1.5rem",
    },
    input: {
      background: colors.background,
      border: colors.border,
      borderRadius: radius.md,
      height: "44px", // Touch target accessible height
      paddingX: "1rem",
      focusBorderColor: colors.primary,
    },
    navigation: {
      height: "72px",
      backdropBlur: true,
      background: "rgba(255, 255, 255, 0.85)",
      borderBottom: colors.border,
    },
  };
}
