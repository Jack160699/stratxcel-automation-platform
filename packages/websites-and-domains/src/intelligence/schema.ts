/**
 * Website Understanding Schema & Types
 *
 * Authoritative data model produced by the Website Intelligence Engine.
 */

export type WebsiteSourceType = "url" | "repository" | "raw_html";

export type AssetProvenance =
  | "customer-provided"
  | "generated"
  | "licensed"
  | "public-reference"
  | "placeholder"
  | "unknown";

export interface PageUnderstanding {
  url: string;
  path: string;
  title: string;
  description?: string;
  sectionCount: number;
  wordCount: number;
  isHomepage: boolean;
  headings: Array<{ level: number; text: string }>;
}

export interface NavigationItem {
  label: string;
  path: string;
  href: string;
  isPrimary: boolean;
  children?: NavigationItem[];
}

export interface SectionUnderstanding {
  id?: string;
  type: string; // hero, features, testimonials, pricing, products, contact, faq, footer, etc.
  heading?: string;
  summary: string;
  order: number;
  componentHints: string[];
}

export interface TypographySystem {
  primaryFont: string;
  secondaryFont?: string;
  headingsFont?: string;
  scale: string[]; // e.g. ["12px", "14px", "16px", "20px", "24px", "32px", "48px"]
  observations: string[];
}

export interface ColorSystem {
  dominant: string;
  primary: string;
  secondary?: string;
  background: string;
  text: string;
  accent?: string;
  palette: string[];
}

export interface SpacingSystem {
  density: "compact" | "normal" | "spacious";
  standardPadding: string;
  standardGap: string;
  containerMaxWidth: string;
}

export interface ComponentUnderstanding {
  type: string; // button, card, navbar, modal, banner, accordion, etc.
  name: string;
  description: string;
  variant?: string;
  propsSample?: Record<string, unknown>;
}

export interface ImageUnderstanding {
  url: string;
  alt: string;
  role: "logo" | "hero" | "product" | "testimonial" | "background" | "icon" | "content";
  provenance: AssetProvenance;
  width?: number;
  height?: number;
}

export interface AssetUnderstanding {
  type: "image" | "font" | "icon" | "video" | "stylesheet" | "script";
  url: string;
  provenance: AssetProvenance;
}

export interface FormUnderstanding {
  id?: string;
  purpose: "contact" | "newsletter" | "lead_capture" | "login" | "checkout" | "search" | "unknown";
  fieldNames: string[];
  submitLabel: string;
  actionUrl?: string;
}

export interface CtaUnderstanding {
  text: string;
  href: string;
  styleVariant: "primary" | "secondary" | "outline" | "link";
  location: "header" | "hero" | "body" | "footer" | "banner";
}

export interface SeoUnderstanding {
  metaTitle?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  structuredDataTypes: string[];
  headingHierarchyValid: boolean;
}

export interface EcommerceUnderstanding {
  isEcommerce: boolean;
  platformDetected?: "Shopify" | "WooCommerce" | "Magento" | "BigCommerce" | "Custom" | "None";
  currency: string;
  productCountEstimate: number;
  cartDetected: boolean;
  checkoutDetected: boolean;
  features: string[];
}

export interface IntegrationUnderstanding {
  name: string;
  type: "analytics" | "chat" | "payment" | "marketing" | "tag_manager" | "other";
  identifier?: string;
}

export interface WebsiteUnderstanding {
  source: string;
  sourceType: WebsiteSourceType;
  canonicalUrl: string;
  title: string;
  businessName: string;
  businessCategory: string;
  pages: PageUnderstanding[];
  navigation: NavigationItem[];
  sections: SectionUnderstanding[];
  typography: TypographySystem;
  colorSystem: ColorSystem;
  spacingSystem: SpacingSystem;
  layoutPatterns: string[];
  components: ComponentUnderstanding[];
  images: ImageUnderstanding[];
  assets: AssetUnderstanding[];
  forms: FormUnderstanding[];
  ctas: CtaUnderstanding[];
  seo: SeoUnderstanding;
  ecommerce: EcommerceUnderstanding;
  integrations: IntegrationUnderstanding[];
  responsiveObservations: string[];
  contentSummary: string;
  designSummary: string;
  technicalSummary: string;
  analyzedAt: string;
}

export interface WebsiteAnalysisInput {
  url?: string;
  rawHtml?: string;
  repository?: {
    files: Record<string, string>; // path -> content
    repoName?: string;
    defaultBranch?: string;
  };
  options?: {
    maxPages?: number;
    maxDepth?: number;
    timeoutMs?: number;
    respectRobotsTxt?: boolean;
  };
}
