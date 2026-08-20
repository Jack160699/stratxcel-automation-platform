/**
 * Design System Analyzer for Website Intelligence Engine
 *
 * Analyzes:
 *   - Dominant, primary, secondary, and accent colors from CSS / inline styles
 *   - Typography families and font scales
 *   - Spacing densities (compact, normal, spacious)
 *   - Layout patterns and component styling (border radius, cards, grids)
 *   - Responsive clues and breakpoints
 */

import type { TypographySystem, ColorSystem, SpacingSystem } from "./schema.ts";

export interface DesignAnalysisResult {
  typography: TypographySystem;
  colorSystem: ColorSystem;
  spacingSystem: SpacingSystem;
  layoutPatterns: string[];
  responsiveObservations: string[];
}

export function analyzeDesignSystem(html: string): DesignAnalysisResult {
  // 1. Color Extraction
  const hexColors = new Set<string>();
  const hexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
  let match: RegExpExecArray | null;
  while ((match = hexRegex.exec(html)) !== null) {
    hexColors.add(match[0].toUpperCase());
  }

  const palette = Array.from(hexColors).slice(0, 8);

  const dominant = palette[0] || "#0F172A";
  const primary = palette.find((c) => c !== "#FFFFFF" && c !== "#000000") || "#2563EB";
  const secondary = palette.find((c) => c !== primary && c !== "#FFFFFF" && c !== "#000000") || "#64748B";
  const background = html.includes("dark") || dominant.startsWith("#0") || dominant.startsWith("#1") ? "#090D16" : "#FFFFFF";
  const text = background === "#FFFFFF" ? "#0F172A" : "#F8FAFC";
  const accent = palette.find((c) => c !== primary && c !== secondary && c !== dominant) || "#38BDF8";

  const colorSystem: ColorSystem = {
    dominant,
    primary,
    secondary,
    background,
    text,
    accent,
    palette,
  };

  // 2. Typography Extraction
  const fontMatches = html.match(/font-family:\s*['"]?([^;'"}]+)/gi) || [];
  const googleFontMatches = html.match(/family=([a-zA-Z+]+)/gi) || [];

  const detectedFonts: string[] = [];
  for (const gf of googleFontMatches) {
    const name = gf.replace(/^family=/i, "").replace(/\+/g, " ");
    detectedFonts.push(name);
  }
  for (const fm of fontMatches) {
    const raw = fm.replace(/^font-family:\s*['"]?/i, "").split(",")[0].trim();
    if (raw && !detectedFonts.includes(raw)) {
      detectedFonts.push(raw);
    }
  }

  const primaryFont = detectedFonts[0] || "Inter, sans-serif";
  const headingsFont = detectedFonts[1] || primaryFont;

  const typography: TypographySystem = {
    primaryFont,
    headingsFont,
    scale: ["12px", "14px", "16px", "18px", "24px", "32px", "48px", "64px"],
    observations: [
      `Primary typeface: ${primaryFont}`,
      `Heading typeface: ${headingsFont}`,
      "Standard modern modular type scale (1.25x)",
    ],
  };

  // 3. Spacing System
  const isSpacious = /py-(?:16|20|24)|my-(?:16|20|24)|gap-(?:8|10|12)/.test(html);
  const isCompact = /py-(?:2|4)|gap-(?:1|2)/.test(html);

  const spacingSystem: SpacingSystem = {
    density: isSpacious ? "spacious" : isCompact ? "compact" : "normal",
    standardPadding: isSpacious ? "24px 32px" : "16px 20px",
    standardGap: isSpacious ? "32px" : "16px",
    containerMaxWidth: "1280px",
  };

  // 4. Layout Patterns
  const layoutPatterns: string[] = [];
  if (/grid-cols|display:\s*grid/i.test(html)) {
    layoutPatterns.push("CSS Grid multi-column layout");
  }
  if (/flex|display:\s*flex/i.test(html)) {
    layoutPatterns.push("Flexbox alignment and stacking");
  }
  if (/container|max-w-7xl|max-w-6xl/i.test(html)) {
    layoutPatterns.push("Centered max-width content container");
  }
  if (/sticky|fixed/i.test(html)) {
    layoutPatterns.push("Sticky header navigation bar");
  }

  // 5. Responsive Clues
  const responsiveObservations: string[] = [];
  if (/<meta[^>]+name=["']viewport["']/i.test(html)) {
    responsiveObservations.push("Standard mobile-first viewport configured");
  }
  if (/@media|md:|lg:|sm:|xl:/i.test(html)) {
    responsiveObservations.push("Responsive breakpoint rules detected (sm, md, lg, xl)");
  }

  return {
    typography,
    colorSystem,
    spacingSystem,
    layoutPatterns,
    responsiveObservations,
  };
}
