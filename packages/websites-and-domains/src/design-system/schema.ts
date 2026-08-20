/**
 * Design System Schema & Token Specification
 *
 * Defines the comprehensive, validated contract for typography, colors,
 * spacing, component styles, motion, responsiveness, and accessibility rules.
 */

export interface ColorTokenGroup {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
}

export interface SemanticColors {
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface TypeScaleStep {
  fontSize: string;
  lineHeight: string;
  letterSpacing?: string;
  fontWeight: number;
}

export interface TypographyTokens {
  headingFont: string;
  bodyFont: string;
  monoFont?: string;
  weights: {
    regular: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  scale: {
    h1: TypeScaleStep;
    h2: TypeScaleStep;
    h3: TypeScaleStep;
    h4: TypeScaleStep;
    bodyLarge: TypeScaleStep;
    body: TypeScaleStep;
    bodySmall: TypeScaleStep;
    caption: TypeScaleStep;
  };
}

export interface SpacingTokens {
  unit: number; // e.g. 4 or 8 (px)
  scale: {
    xs: string; // 4px / 8px
    sm: string; // 8px / 12px
    md: string; // 16px
    lg: string; // 24px
    xl: string; // 32px
    "2xl": string; // 48px
    "3xl": string; // 64px
    "4xl": string; // 96px
  };
  containerMaxWidths: {
    sm: string; // 640px
    md: string; // 768px
    lg: string; // 1024px
    xl: string; // 1280px
    full: string; // 1440px / 1536px
  };
}

export interface RadiusTokens {
  none: string;
  sm: string;
  md: string;
  lg: string;
  full: string;
}

export interface ShadowTokens {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  glow?: string;
}

export interface ComponentTokens {
  button: {
    borderRadius: string;
    paddingX: string;
    paddingY: string;
    fontWeight: number;
    focusRingColor: string;
    variants: {
      primary: { background: string; text: string; hoverBackground: string };
      secondary: { background: string; text: string; hoverBackground: string };
      outline: { border: string; text: string; hoverBackground: string };
      ghost: { text: string; hoverBackground: string };
    };
  };
  card: {
    background: string;
    border: string;
    borderRadius: string;
    shadow: string;
    padding: string;
  };
  input: {
    background: string;
    border: string;
    borderRadius: string;
    height: string;
    paddingX: string;
    focusBorderColor: string;
  };
  navigation: {
    height: string;
    backdropBlur: boolean;
    background: string;
    borderBottom: string;
  };
}

export interface ResponsiveBreakpoints {
  mobile: number; // 320
  tablet: number; // 768
  desktop: number; // 1024
  wide: number; // 1440
}

export interface AccessibilityRules {
  wcagLevel: "AA" | "AAA";
  minTouchTargetPx: number; // default 44px
  enforceContrastRatio: boolean;
  minContrastRatioNormal: number; // 4.5:1
  minContrastRatioLarge: number; // 3.0:1
  enforceAltText: boolean;
  supportReducedMotion: boolean;
}

export interface DesignSystem {
  version: "1.0";
  aesthetic: "luxury" | "modern-saas" | "retail" | "service" | "minimal" | "vibrant";
  colors: {
    brand: ColorTokenGroup;
    semantic: SemanticColors;
  };
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
  components: ComponentTokens;
  responsive: ResponsiveBreakpoints;
  accessibility: AccessibilityRules;
}
