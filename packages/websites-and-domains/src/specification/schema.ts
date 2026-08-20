/**
 * Website Specification Schema — the validated contract between:
 *   1. The AI prompt-to-spec generator
 *   2. The site builder (spec → pages)
 *   3. The deployment pipeline
 *
 * Every AI-generated specification MUST pass schema validation before
 * the generation pipeline proceeds. Raw AI text is never consumed
 * directly by the frontend or the site builder.
 */

// ── Website Types ──────────────────────────────────────────────
export type WebsiteType =
  | "LANDING_PAGE"
  | "BUSINESS_WEBSITE"
  | "ECOMMERCE"
  | "SERVICE_BUSINESS"
  | "AI_BUSINESS";

export const WEBSITE_TYPES: readonly WebsiteType[] = [
  "LANDING_PAGE",
  "BUSINESS_WEBSITE",
  "ECOMMERCE",
  "SERVICE_BUSINESS",
  "AI_BUSINESS",
] as const;

// ── Brand Identity ─────────────────────────────────────────────
export interface BrandIdentity {
  businessName: string;
  tagline?: string;
  industry: string;
  businessType: string;
  targetAudience: string;
  brandPersonality: string[];
  uniqueSellingPoints: string[];
}

// ── Visual Style ───────────────────────────────────────────────
export interface VisualStyle {
  aesthetic: string;
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    style: string;
  };
  spacing: "compact" | "comfortable" | "spacious";
  borderRadius: "none" | "subtle" | "rounded" | "pill";
  imageStyle: string;
}

// ── Page Specification ─────────────────────────────────────────
export type SectionType =
  | "hero"
  | "features"
  | "about"
  | "faq"
  | "gallery"
  | "team"
  | "process"
  | "contact_form"
  | "testimonials"
  | "products"
  | "pricing"
  | "cta"
  | "stats"
  | "newsletter"
  | "video"
  | "map"
  | "social_feed"
  | "booking"
  | "collections";

export interface SectionSpec {
  type: SectionType;
  heading: string;
  subheading?: string;
  content?: string;
  items?: Array<{
    title: string;
    description: string;
    icon?: string;
    image?: string;
    price?: string;
    link?: string;
  }>;
  ctaText?: string;
  ctaLink?: string;
  layout?: "grid" | "list" | "carousel" | "masonry";
  columns?: 1 | 2 | 3 | 4;
  backgroundStyle?: "default" | "accent" | "dark" | "gradient" | "image";
}

export interface PageSpec {
  id: string;
  title: string;
  slug: string;
  seo: {
    title: string;
    metaDescription: string;
    keywords?: string[];
  };
  sections: SectionSpec[];
  isHomepage?: boolean;
}

// ── Navigation ─────────────────────────────────────────────────
export interface NavItem {
  label: string;
  slug: string;
  children?: NavItem[];
}

// ── E-Commerce Requirements ────────────────────────────────────
export interface EcommerceSpec {
  enabled: boolean;
  productCategories?: string[];
  estimatedProductCount?: number;
  hasVariants?: boolean;
  requiresInventoryTracking?: boolean;
  shippingRequired?: boolean;
  paymentProviders?: string[];
  currency: string;
}

// ── AI Agent Requirements ──────────────────────────────────────
export interface AgentSpec {
  enabled: boolean;
  name?: string;
  capabilities?: string[];
  tone?: string;
  greetingMessage?: string;
}

// ── SEO Requirements ───────────────────────────────────────────
export interface SeoSpec {
  generateSitemap: boolean;
  generateRobotsTxt: boolean;
  enableOpenGraph: boolean;
  enableTwitterCards: boolean;
  primaryKeywords?: string[];
}

// ── Contact/Forms ──────────────────────────────────────────────
export interface ContactSpec {
  email?: string;
  phone?: string;
  address?: string;
  showContactForm: boolean;
  showMap: boolean;
  socialLinks?: Record<string, string>;
}

// ── Domain Requirement ─────────────────────────────────────────
export interface DomainSpec {
  requested?: string;
  alternatives?: string[];
}

// ── Full Website Specification ─────────────────────────────────
export interface WebsiteSpecification {
  version: "1.0";
  websiteType: WebsiteType;
  brand: BrandIdentity;
  visualStyle: VisualStyle;
  pages: PageSpec[];
  navigation: NavItem[];
  ecommerce: EcommerceSpec;
  agent: AgentSpec;
  seo: SeoSpec;
  contact: ContactSpec;
  domain: DomainSpec;
  generatedAt: string;
}

// ── Specification Version Envelope ─────────────────────────────
export interface VersionedSpecification {
  specVersion: "1.0";
  specification: WebsiteSpecification;
  generationMetadata: {
    originalPrompt: string;
    aiProvider: string;
    aiModel: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    generatedAt: string;
  };
}
