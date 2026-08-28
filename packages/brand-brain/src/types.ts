/**
 * One structured service/product this business offers (Brand Brain Final
 * UX + Data + Save System). The canonical, editable unit for "what does
 * this business sell" -- replaces the old catalog_tags (bare chip strings)
 * and the old read-only `products` array (name+description only, no
 * category/price/URL/CTA/facts/order/active state) as the thing the
 * `/app/brand` Services section actually edits. Deliberately generic: a
 * restaurant, a salon, a plumber, and StratXcel itself all store their own
 * completely different services here -- nothing about this shape assumes
 * any particular industry or business.
 */
export interface BrandBrainService {
  /** Client-generated stable id (crypto.randomUUID()) -- services have no
   * database row of their own (same JSONB-array-on-one-tenant-row design
   * as every other Brand Brain list field), so this is the only stable
   * identity across edits/reorders. */
  id: string;
  name: string;
  /** Concise, always shown in lists/cards and fed to AI consumers as the
   * primary description. */
  shortDescription: string;
  /** Optional expanded detail -- shown only when a consumer needs more
   * (e.g. a website page), never required to keep the card list scannable. */
  longDescription?: string;
  /** Free-text category/type label (e.g. "Hair", "Plumbing", "Marketing") --
   * generic grouping, not a fixed enum, since services vary per business. */
  category?: string;
  active: boolean;
  /** Manual display order (ascending) -- set by drag/reorder in the UI. */
  order: number;
  /** Free-text so it works across currencies/pricing models ("₹499",
   * "Starting at $99/mo", "Custom quote") -- never a bare number that
   * would silently assume a currency. */
  startingPrice?: string;
  url?: string;
  cta?: string;
  /** Service-specific verified facts (Section 10) -- distinct from
   * shortDescription/longDescription, which are user-authored marketing
   * copy. Only what the owner has explicitly entered here is ever treated
   * as a "verified fact" safe for factual AI claims; the AI must never
   * promote a description into a fact on its own (see canonical.ts). */
  facts?: string[];
  updatedAt: string;
}

export interface BrandBrainContent {
  business_name?: string;
  industry?: string;
  tone_of_voice?: string;
  target_audience?: string;
  /** @deprecated Legacy shape (name+description only, no id/order/active/
   * category/price/url/cta/facts). Superseded by `services` below --
   * getCanonicalServices() (canonical.ts) reads whichever is present so
   * every existing consumer keeps working, but the `/app/brand` Services
   * UI only ever writes `services`. Kept purely for backward-read
   * compatibility with tenants who have this and no `services` yet. */
  products?: { name: string; description: string }[];
  /** The canonical, structured services/products list -- see
   * BrandBrainService. Always read via getCanonicalServices() /
   * getCanonicalBrandContext() (canonical.ts), never this raw field
   * directly, so the legacy-`products` fallback and active/order
   * normalization stay in exactly one place. */
  services?: BrandBrainService[];
  pillars?: string[];
  rules?: string[];
  [key: string]: unknown;
}

export interface BrandBrainRow {
  tenant_id: string;
  current_version: number;
  updated_at: string;
}

export interface BrandBrainVersionRow {
  tenant_id: string;
  version: number;
  content: BrandBrainContent;
  created_by: string | null;
  created_at: string;
}
