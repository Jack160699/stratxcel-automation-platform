/**
 * Design Direction Generator
 *
 * Synthesizes visual style, typography, color palettes, spacing, and border radius
 * from customer prompts, brand tokens, and reference understanding.
 */

import type { VisualStyle } from "../specification/schema.ts";
import type { WebsiteUnderstanding } from "../intelligence/schema.ts";
import type { BusinessBrandContext } from "./types.ts";

export function generateDesignDirection(
  prompt: string,
  brandContext?: BusinessBrandContext,
  reference?: WebsiteUnderstanding
): VisualStyle {
  const p = prompt.toLowerCase();

  // 1. Determine Aesthetic
  let aesthetic = "modern";
  if (p.includes("luxury") || p.includes("luxurious") || p.includes("bespoke") || p.includes("premium")) {
    aesthetic = "luxury";
  } else if (p.includes("minimal") || p.includes("clean") || p.includes("swiss") || p.includes("simple")) {
    aesthetic = "minimal";
  } else if (p.includes("bold") || p.includes("vibrant") || p.includes("energetic") || p.includes("creative")) {
    aesthetic = "vibrant";
  } else if (p.includes("playful") || p.includes("fun") || p.includes("kid")) {
    aesthetic = "playful";
  } else if (p.includes("dark") || p.includes("cyber") || p.includes("tech")) {
    aesthetic = "dark-mode";
  }

  // 2. Determine Color Palette
  let primary = brandContext?.colors?.primary;
  let secondary = brandContext?.colors?.secondary;
  let accent = brandContext?.colors?.accent;
  let background = brandContext?.colors?.background || "#FFFFFF";
  let surface = "#F8FAFC";
  let text = "#0F172A";
  let textMuted = "#64748B";

  // Use reference site colors as an inspired basis if custom colors are not provided
  if (!primary && reference?.colorSystem) {
    primary = reference.colorSystem.primary;
    secondary = reference.colorSystem.secondary || "#475569";
    accent = reference.colorSystem.accent || "#38BDF8";
  }

  // Aesthetic fallbacks
  if (aesthetic === "luxury") {
    primary = primary || "#0F172A";
    secondary = secondary || "#1E293B";
    accent = accent || "#C5A880"; // Luxury Gold / Bronze
    background = "#FCFCFC";
    surface = "#F4F1EA";
    text = "#111827";
    textMuted = "#6B7280";
  } else if (aesthetic === "dark-mode") {
    primary = primary || "#38BDF8";
    secondary = secondary || "#818CF8";
    accent = accent || "#F43F5E";
    background = "#090D16";
    surface = "#131C2E";
    text = "#F8FAFC";
    textMuted = "#94A3B8";
  } else if (aesthetic === "vibrant") {
    primary = primary || "#7C3AED";
    secondary = secondary || "#EC4899";
    accent = accent || "#F59E0B";
    background = "#FFFFFF";
    surface = "#FAF5FF";
    text = "#1E1B4B";
    textMuted = "#6B7280";
  } else {
    primary = primary || "#2563EB";
    secondary = secondary || "#475569";
    accent = accent || "#06B6D4";
  }

  // 3. Determine Typography
  let headingFont = "Inter, sans-serif";
  let bodyFont = "Inter, sans-serif";

  if (aesthetic === "luxury") {
    headingFont = "Playfair Display, serif";
    bodyFont = "Plus Jakarta Sans, sans-serif";
  } else if (aesthetic === "minimal") {
    headingFont = "Plus Jakarta Sans, sans-serif";
    bodyFont = "Inter, sans-serif";
  } else if (aesthetic === "vibrant") {
    headingFont = "Outfit, sans-serif";
    bodyFont = "Plus Jakarta Sans, sans-serif";
  } else if (reference?.typography) {
    headingFont = reference.typography.headingsFont || reference.typography.primaryFont;
    bodyFont = reference.typography.primaryFont;
  }

  // 4. Spacing & Border Radius
  const spacing = aesthetic === "luxury" || aesthetic === "minimal" ? "spacious" : "comfortable";
  const borderRadius = aesthetic === "minimal" ? "none" : aesthetic === "luxury" ? "subtle" : "rounded";

  return {
    aesthetic,
    colorPalette: {
      primary,
      secondary,
      accent,
      background,
      surface,
      text,
      textMuted,
    },
    typography: {
      headingFont,
      bodyFont,
      style: "modern",
    },
    spacing,
    borderRadius,
    imageStyle: aesthetic === "luxury" ? "high-contrast editorial photography" : "crisp modern clean lifestyle",
  };
}
