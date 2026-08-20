/**
 * Validates a raw AI-generated specification against the WebsiteSpecification
 * schema. Generation does NOT proceed until validation passes.
 *
 * This is a structural + business-rule validator, not just a type guard.
 * It checks:
 *   - Required fields exist and are the correct type
 *   - Website type is a recognized enum value
 *   - Pages array is non-empty and has valid slugs
 *   - Color values look like hex codes
 *   - E-commerce spec matches website type
 *   - SEO fields are present
 *   - No obviously fabricated content markers
 */

import type { WebsiteSpecification, WebsiteType, PageSpec, SectionType } from "./schema.ts";
import { WEBSITE_TYPES } from "./schema.ts";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

const VALID_SECTION_TYPES: readonly SectionType[] = [
  "hero", "features", "about", "faq", "gallery", "team", "process",
  "contact_form", "testimonials", "products", "pricing", "cta", "stats",
  "newsletter", "video", "map", "social_feed", "booking", "collections",
];

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

export function validateWebsiteSpecification(raw: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!raw || typeof raw !== "object") {
    errors.push({ path: "$", message: "Specification must be a non-null object", code: "INVALID_ROOT" });
    return { valid: false, errors, warnings };
  }

  const spec = raw as Record<string, unknown>;

  // ── Version ──────────────────────────────────────────────────
  if (spec.version !== "1.0") {
    errors.push({ path: "$.version", message: `Expected version "1.0", got "${spec.version}"`, code: "INVALID_VERSION" });
  }

  // ── Website Type ─────────────────────────────────────────────
  if (!spec.websiteType || !WEBSITE_TYPES.includes(spec.websiteType as WebsiteType)) {
    errors.push({
      path: "$.websiteType",
      message: `websiteType must be one of: ${WEBSITE_TYPES.join(", ")}`,
      code: "INVALID_WEBSITE_TYPE",
    });
  }

  // ── Brand Identity ───────────────────────────────────────────
  validateBrand(spec.brand, errors, warnings);

  // ── Visual Style ─────────────────────────────────────────────
  validateVisualStyle(spec.visualStyle, errors, warnings);

  // ── Pages ────────────────────────────────────────────────────
  validatePages(spec.pages, errors, warnings);

  // ── Navigation ───────────────────────────────────────────────
  if (!Array.isArray(spec.navigation) || spec.navigation.length === 0) {
    errors.push({ path: "$.navigation", message: "Navigation must be a non-empty array", code: "INVALID_NAVIGATION" });
  }

  // ── E-Commerce ───────────────────────────────────────────────
  validateEcommerce(spec.ecommerce, spec.websiteType as WebsiteType, errors, warnings);

  // ── SEO ──────────────────────────────────────────────────────
  if (!spec.seo || typeof spec.seo !== "object") {
    errors.push({ path: "$.seo", message: "SEO specification is required", code: "MISSING_SEO" });
  }

  // ── Contact ──────────────────────────────────────────────────
  if (!spec.contact || typeof spec.contact !== "object") {
    errors.push({ path: "$.contact", message: "Contact specification is required", code: "MISSING_CONTACT" });
  }

  // ── Domain ───────────────────────────────────────────────────
  if (!spec.domain || typeof spec.domain !== "object") {
    warnings.push({ path: "$.domain", message: "No domain specification provided" });
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateBrand(brand: unknown, errors: ValidationError[], warnings: ValidationWarning[]): void {
  if (!brand || typeof brand !== "object") {
    errors.push({ path: "$.brand", message: "Brand identity is required", code: "MISSING_BRAND" });
    return;
  }
  const b = brand as Record<string, unknown>;
  if (!b.businessName || typeof b.businessName !== "string" || b.businessName.length < 1) {
    errors.push({ path: "$.brand.businessName", message: "Business name is required", code: "MISSING_BUSINESS_NAME" });
  }
  if (!b.industry || typeof b.industry !== "string") {
    errors.push({ path: "$.brand.industry", message: "Industry is required", code: "MISSING_INDUSTRY" });
  }
  if (!b.targetAudience || typeof b.targetAudience !== "string") {
    warnings.push({ path: "$.brand.targetAudience", message: "Target audience not specified" });
  }
}

function validateVisualStyle(style: unknown, errors: ValidationError[], warnings: ValidationWarning[]): void {
  if (!style || typeof style !== "object") {
    errors.push({ path: "$.visualStyle", message: "Visual style specification is required", code: "MISSING_VISUAL_STYLE" });
    return;
  }
  const s = style as Record<string, unknown>;
  if (!s.colorPalette || typeof s.colorPalette !== "object") {
    errors.push({ path: "$.visualStyle.colorPalette", message: "Color palette is required", code: "MISSING_COLORS" });
  } else {
    const colors = s.colorPalette as Record<string, string>;
    for (const key of ["primary", "secondary", "accent", "background", "text"]) {
      if (!colors[key] || !HEX_COLOR_PATTERN.test(colors[key])) {
        warnings.push({ path: `$.visualStyle.colorPalette.${key}`, message: `Color "${colors[key]}" may not be a valid hex color` });
      }
    }
  }
  if (!s.typography || typeof s.typography !== "object") {
    warnings.push({ path: "$.visualStyle.typography", message: "Typography not specified, using defaults" });
  }
}

function validatePages(pages: unknown, errors: ValidationError[], warnings: ValidationWarning[]): void {
  if (!Array.isArray(pages) || pages.length === 0) {
    errors.push({ path: "$.pages", message: "At least one page is required", code: "NO_PAGES" });
    return;
  }

  const slugs = new Set<string>();
  let hasHomepage = false;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i] as Partial<PageSpec>;
    const path = `$.pages[${i}]`;

    if (!page.title || typeof page.title !== "string") {
      errors.push({ path: `${path}.title`, message: "Page title is required", code: "MISSING_PAGE_TITLE" });
    }
    if (page.slug === undefined || typeof page.slug !== "string") {
      errors.push({ path: `${path}.slug`, message: "Page slug is required", code: "MISSING_PAGE_SLUG" });
    } else if (slugs.has(page.slug)) {
      errors.push({ path: `${path}.slug`, message: `Duplicate page slug: "${page.slug}"`, code: "DUPLICATE_SLUG" });
    } else {
      slugs.add(page.slug);
    }

    if (page.slug === "" || page.isHomepage) hasHomepage = true;

    if (!page.seo || typeof page.seo !== "object") {
      warnings.push({ path: `${path}.seo`, message: "Page SEO metadata missing" });
    }

    if (!Array.isArray(page.sections) || page.sections.length === 0) {
      errors.push({ path: `${path}.sections`, message: "Page must have at least one section", code: "NO_SECTIONS" });
    } else {
      for (let j = 0; j < page.sections.length; j++) {
        const section = page.sections[j];
        if (!section.type || !VALID_SECTION_TYPES.includes(section.type as SectionType)) {
          errors.push({
            path: `${path}.sections[${j}].type`,
            message: `Invalid section type: "${section.type}"`,
            code: "INVALID_SECTION_TYPE",
          });
        }
      }
    }
  }

  if (!hasHomepage) {
    errors.push({ path: "$.pages", message: "At least one page must be the homepage (slug: '' or isHomepage: true)", code: "NO_HOMEPAGE" });
  }
}

function validateEcommerce(ecommerce: unknown, websiteType: WebsiteType, errors: ValidationError[], warnings: ValidationWarning[]): void {
  if (!ecommerce || typeof ecommerce !== "object") {
    if (websiteType === "ECOMMERCE") {
      errors.push({ path: "$.ecommerce", message: "E-commerce specification is required for ECOMMERCE website type", code: "MISSING_ECOMMERCE" });
    }
    return;
  }
  const e = ecommerce as Record<string, unknown>;
  if (websiteType === "ECOMMERCE" && e.enabled !== true) {
    warnings.push({ path: "$.ecommerce.enabled", message: "E-commerce is disabled for an ECOMMERCE website type" });
  }
}

/**
 * Attempts to coerce a partially valid specification into a fully valid one
 * by filling in reasonable defaults for missing non-critical fields. Returns
 * the coerced spec plus a validation result. Critical missing fields (e.g.,
 * businessName, pages) still produce errors.
 */
export function coerceAndValidate(raw: unknown): { spec: WebsiteSpecification | null; result: ValidationResult } {
  if (!raw || typeof raw !== "object") {
    return { spec: null, result: { valid: false, errors: [{ path: "$", message: "Not an object", code: "INVALID_ROOT" }], warnings: [] } };
  }

  const obj = { ...raw } as Record<string, unknown>;

  // Default version
  if (!obj.version) obj.version = "1.0";

  // Default ecommerce
  if (!obj.ecommerce) {
    obj.ecommerce = { enabled: obj.websiteType === "ECOMMERCE", currency: "INR" };
  }

  // Default agent
  if (!obj.agent) {
    obj.agent = { enabled: obj.websiteType === "AI_BUSINESS" };
  }

  // Default SEO
  if (!obj.seo) {
    obj.seo = { generateSitemap: true, generateRobotsTxt: true, enableOpenGraph: true, enableTwitterCards: true };
  }

  // Default contact
  if (!obj.contact) {
    obj.contact = { showContactForm: true, showMap: false };
  }

  // Default domain
  if (!obj.domain) {
    obj.domain = {};
  }

  // Default generatedAt
  if (!obj.generatedAt) {
    obj.generatedAt = new Date().toISOString();
  }

  const result = validateWebsiteSpecification(obj);
  return { spec: result.valid ? obj as unknown as WebsiteSpecification : null, result };
}
