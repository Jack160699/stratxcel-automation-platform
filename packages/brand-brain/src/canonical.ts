/**
 * Brand Brain Final UX + Data + Save System — the single canonical
 * retrieval layer this mission requires (Section 7: "the rest of the
 * platform should consume structured Brand Brain data rather than
 * scraping arbitrary text fields... do not create separate manually
 * maintained versions of the same business facts").
 *
 * Before this module, every real consumer (image-generation prompts,
 * Social Autopilot, the workforce brand-context compiler, creative-studio,
 * audit-engine, the website brief) read `content.products` /
 * `content.catalog_tags` / other raw BrandBrainContent fields directly,
 * each with its own slightly different null-handling and shape
 * assumptions. This is now the one place that:
 *
 *  1. Normalizes services (BrandBrainService[], with a legacy `products`
 *     fallback for tenants who haven't re-saved through the new UI yet) —
 *     getCanonicalServices / getActiveServices.
 *  2. Builds one full, typed business-context snapshot every consumer can
 *     use instead of hand-picking fields — getCanonicalBrandContext.
 *  3. Distinguishes VERIFIED facts (safe for factual AI claims) from
 *     descriptive marketing copy (Section 10) — buildVerifiedFacts.
 *  4. Maps a free-text request to the best-matching service in THIS
 *     tenant's own catalog, generically — never hardcoded per business —
 *     matchServiceForRequest (Section 12).
 *  5. Validates content before it's persisted — validateBrandBrainContent.
 *
 * Pure and dependency-free (no Supabase, no I/O) — every function here
 * takes a BrandBrainContent already loaded by getCurrentBrandBrain and
 * returns a plain value, so it's trivially reusable from a Next.js route,
 * a background worker, or a script, and trivially unit-testable.
 */
import type { BrandBrainContent, BrandBrainService } from "./types.ts";

export const HIGHLIGHT_MAX_LENGTH = 140;
export const HIGHLIGHTS_MAX_COUNT = 8;
export const SERVICE_NAME_MAX_LENGTH = 80;
export const SERVICE_SHORT_DESCRIPTION_MAX_LENGTH = 240;
export const SERVICE_LONG_DESCRIPTION_MAX_LENGTH = 2000;
export const SERVICES_MAX_COUNT = 50;
export const SERVICE_FACT_MAX_LENGTH = 200;

/** Fully-normalized service — every optional BrandBrainService field is
 * resolved to a concrete value (undefined stays undefined, never coerced
 * to "" — callers that want to skip empty fields can keep using a
 * `typeof x === "string"` check exactly like BrandBrainService itself). */
export type CanonicalBrandService = BrandBrainService;

export interface CanonicalBrandContext {
  businessName: string;
  industry: string | null;
  /** `positioning` — the free-text business description/story. */
  description: string | null;
  websiteUrl: string | null;
  location: string | null;
  phone: string | null;
  hours: string | null;
  /** Short, concise summary lines (Section 2) — descriptive context, never
   * treated as verified facts on their own. */
  highlights: string[];
  toneOfVoice: string | null;
  targetAudience: string | null;
  colors: string[];
  logoUrl: string | null;
  /** Active services only, sorted by `order` — what most consumers
   * (image generation, Social Autopilot, SEO, Website) actually want. */
  services: CanonicalBrandService[];
  /** Every service including inactive/archived ones, sorted by `order` —
   * for editing UIs and admin/debug views that need the full set. */
  allServices: CanonicalBrandService[];
  /** Section 10: information safe to present as a verified factual claim.
   * See buildVerifiedFacts for exactly what qualifies. */
  verifiedFacts: string[];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()) : [];
}

/**
 * Normalizes one raw candidate (already known to be an object) into a
 * CanonicalBrandService, or null if it has no usable name. Defensive
 * against any malformed/partial JSONB content — a corrupt single entry
 * never breaks the whole list, it's just skipped.
 */
function normalizeServiceEntry(raw: unknown, index: number): CanonicalBrandService | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<BrandBrainService>;
  const name = str(s.name);
  if (!name) return null;
  return {
    id: typeof s.id === "string" && s.id.trim() ? s.id.trim() : `service-${index}`,
    name,
    shortDescription: str(s.shortDescription) ?? "",
    longDescription: str(s.longDescription) ?? undefined,
    category: str(s.category) ?? undefined,
    active: typeof s.active === "boolean" ? s.active : true,
    order: typeof s.order === "number" && Number.isFinite(s.order) ? s.order : index,
    startingPrice: str(s.startingPrice) ?? undefined,
    url: str(s.url) ?? undefined,
    cta: str(s.cta) ?? undefined,
    facts: strArray(s.facts).length ? strArray(s.facts) : undefined,
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : "",
  };
}

/**
 * The single normalization point for "what services does this business
 * have" — reads the canonical `services` array when present, otherwise
 * falls back to the legacy flat `products` array (name+description only)
 * so a tenant who saved products before this mission still gets a real,
 * usable service list instead of it silently disappearing. Always sorted
 * by `order`. Every real consumer in this codebase should call this (or
 * getActiveServices / getCanonicalBrandContext) rather than reading
 * content.services / content.products directly.
 */
export function getCanonicalServices(content: BrandBrainContent | null | undefined): CanonicalBrandService[] {
  if (!content) return [];
  if (Array.isArray(content.services) && content.services.length > 0) {
    const out: CanonicalBrandService[] = [];
    content.services.forEach((raw, index) => {
      const normalized = normalizeServiceEntry(raw, index);
      if (normalized) out.push(normalized);
    });
    return out.sort((a, b) => a.order - b.order);
  }
  if (Array.isArray(content.products) && content.products.length > 0) {
    const out: CanonicalBrandService[] = [];
    content.products.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      const name = str((raw as { name?: unknown }).name);
      if (!name) return;
      out.push({
        id: `legacy-product-${index}`,
        name,
        shortDescription: str((raw as { description?: unknown }).description) ?? "",
        active: true,
        order: index,
        updatedAt: "",
      });
    });
    return out;
  }
  return [];
}

/** Active services only, sorted by order — the shape most generation
 * consumers (image prompts, Social Autopilot, SEO, Website) want, since a
 * paused/archived service should not be advertised or generated about. */
export function getActiveServices(content: BrandBrainContent | null | undefined): CanonicalBrandService[] {
  return getCanonicalServices(content).filter((s) => s.active);
}

/**
 * Section 10 — VERIFIED business facts, safe for an AI system to present
 * as factual marketing claims. Deliberately narrow: only structured fields
 * a human explicitly entered into a labeled Brand Brain field (business
 * identity, contact, and each service's own OWN `facts` list) qualify.
 * `positioning` (business description) and `highlights` (short summary
 * lines) are real, useful descriptive context — this codebase's other
 * consumers (buildProviderReadyImagePrompt, creative-treatment prompts)
 * are free to show them to an AI as color/tone — but they are marketing
 * copy, not verified facts, and are never included here. Nothing
 * AI-generated can reach this function at all: it only ever reads
 * brand_brains.content, which this codebase only ever writes from a human
 * edit or an explicit, human-confirmed onboarding answer — never raw AI
 * chat output (see app/api/platform/brand/route.ts and the onboarding
 * routes that write brand_brains).
 */
export function buildVerifiedFacts(content: BrandBrainContent | null | undefined): string[] {
  if (!content) return [];
  const facts: string[] = [];
  const push = (label: string, value: string | null) => {
    if (value) facts.push(`${label}: ${value}`);
  };
  push("Business name", str(content.business_name));
  push("Industry", str(content.industry));
  push("Location", str(content.location));
  push("Phone", str(content.business_phone));
  push("Business hours", str(content.business_hours));
  push("Website", str(content.website_url));
  push("Target audience", str(content.target_audience));
  // `locations` (plural, verified) is a distinct field from `location`
  // (singular free-text address a human typed) -- populated from
  // Google Business Profile / audit-verified addresses elsewhere in this
  // codebase (see package-business-facts.ts), so it is itself already a
  // verified source, unlike the free-text `location` above which is still
  // included since it's a directly-entered business field, not AI output.
  for (const loc of strArray(content.locations)) facts.push(`Location: ${loc}`);
  for (const service of getActiveServices(content)) {
    facts.push(service.shortDescription ? `Service: ${service.name} — ${service.shortDescription}` : `Service: ${service.name}`);
    if (service.startingPrice) facts.push(`${service.name} starting price: ${service.startingPrice}`);
    for (const fact of service.facts ?? []) facts.push(`${service.name}: ${fact}`);
  }
  return facts;
}

/** The one full canonical snapshot — every real consumer of "this
 * tenant's business context" should build from this rather than picking
 * individual BrandBrainContent fields by hand. */
export function getCanonicalBrandContext(content: BrandBrainContent | null | undefined): CanonicalBrandContext {
  const c = content ?? {};
  return {
    businessName: str(c.business_name) ?? "",
    industry: str(c.industry),
    description: str(c.positioning),
    websiteUrl: str(c.website_url),
    location: str(c.location),
    phone: str(c.business_phone),
    hours: str(c.business_hours),
    highlights: strArray(c.highlights),
    toneOfVoice: str(c.tone_of_voice),
    targetAudience: str(c.target_audience),
    colors: strArray(c.color_hints),
    logoUrl: str(c.logo_url),
    services: getActiveServices(c),
    allServices: getCanonicalServices(c),
    verifiedFacts: buildVerifiedFacts(c),
  };
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Section 12 — "Platform Recognition": maps a free-text request to the
 * best-matching service in THIS tenant's own catalog, by real keyword
 * overlap against that service's own name/category/description/facts.
 * Deliberately generic and hardcoded to nothing: the exact same function
 * resolves "post to Instagram" against StratXcel's own catalog to its
 * "Social Autopilot" service, and "burst pipe emergency" against a
 * plumber's completely different catalog to their own "Emergency
 * Plumbing" service — using nothing but whatever THAT tenant actually
 * saved. Returns null when nothing scores a real match (never guesses).
 */
export function matchServiceForRequest(services: readonly CanonicalBrandService[], query: string): CanonicalBrandService | null {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return null;
  let best: { service: CanonicalBrandService; score: number } | null = null;
  for (const service of services) {
    if (!service.active) continue;
    const nameTokens = new Set(tokenize(service.name));
    const contextTokens = new Set(
      tokenize([service.category ?? "", service.shortDescription, service.longDescription ?? "", ...(service.facts ?? [])].join(" "))
    );
    let score = 0;
    for (const token of queryTokens) {
      // A word matching the service's own NAME is a much stronger signal
      // than matching somewhere in its description/facts.
      if (nameTokens.has(token)) score += 2;
      else if (contextTokens.has(token)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { service, score };
  }
  return best?.service ?? null;
}

export interface BrandBrainValidationIssue {
  field: string;
  issue: string;
}

/**
 * Server-side validation before persisting (Section 8: "validate", and
 * Section 2's Business Highlights length guidance enforced as a real
 * constraint, not just client-side UI copy). Structural/length checks
 * only — never rejects on content the owner is entitled to write about
 * their own business.
 */
export function validateBrandBrainContent(content: BrandBrainContent): BrandBrainValidationIssue[] {
  const issues: BrandBrainValidationIssue[] = [];

  if (Array.isArray(content.highlights)) {
    if (content.highlights.length > HIGHLIGHTS_MAX_COUNT) {
      issues.push({ field: "highlights", issue: `At most ${HIGHLIGHTS_MAX_COUNT} highlights — Business Highlights is a short summary, not a full catalog.` });
    }
    content.highlights.forEach((h, i) => {
      if (typeof h === "string" && h.length > HIGHLIGHT_MAX_LENGTH) {
        issues.push({ field: `highlights[${i}]`, issue: `Must be ${HIGHLIGHT_MAX_LENGTH} characters or fewer — keep each highlight to one short line.` });
      }
    });
  }

  if (Array.isArray(content.services)) {
    if (content.services.length > SERVICES_MAX_COUNT) {
      issues.push({ field: "services", issue: `At most ${SERVICES_MAX_COUNT} services.` });
    }
    content.services.forEach((raw, i) => {
      if (!raw || typeof raw !== "object") {
        issues.push({ field: `services[${i}]`, issue: "Malformed service entry." });
        return;
      }
      const s = raw as Partial<BrandBrainService>;
      if (typeof s.name !== "string" || !s.name.trim()) {
        issues.push({ field: `services[${i}].name`, issue: "Service name is required." });
      } else if (s.name.length > SERVICE_NAME_MAX_LENGTH) {
        issues.push({ field: `services[${i}].name`, issue: `Must be ${SERVICE_NAME_MAX_LENGTH} characters or fewer.` });
      }
      if (typeof s.shortDescription === "string" && s.shortDescription.length > SERVICE_SHORT_DESCRIPTION_MAX_LENGTH) {
        issues.push({ field: `services[${i}].shortDescription`, issue: `Must be ${SERVICE_SHORT_DESCRIPTION_MAX_LENGTH} characters or fewer.` });
      }
      if (typeof s.longDescription === "string" && s.longDescription.length > SERVICE_LONG_DESCRIPTION_MAX_LENGTH) {
        issues.push({ field: `services[${i}].longDescription`, issue: `Must be ${SERVICE_LONG_DESCRIPTION_MAX_LENGTH} characters or fewer.` });
      }
      if (Array.isArray(s.facts)) {
        s.facts.forEach((fact, j) => {
          if (typeof fact === "string" && fact.length > SERVICE_FACT_MAX_LENGTH) {
            issues.push({ field: `services[${i}].facts[${j}]`, issue: `Must be ${SERVICE_FACT_MAX_LENGTH} characters or fewer.` });
          }
        });
      }
    });
  }

  return issues;
}
