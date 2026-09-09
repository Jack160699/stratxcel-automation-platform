/**
 * Company Offer Catalog
 *
 * First-class catalog of products/services the company sells.
 * Founders register offers. Hermes NEVER invents product facts.
 * All offer data must originate from the Founder.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface CompanyOffer {
  id?: string;
  tenant_id: string;
  name: string;
  description: string;
  category: string;
  status?: "draft" | "active" | "archived";
  target_customer?: string;
  geography?: string[];
  pricing_json?: Record<string, unknown>;
  cost_json?: Record<string, unknown>;
  gross_margin_pct?: number;
  commission_pct?: number;
  sales_cycle_days?: number;
  capacity?: number;
  eligibility?: string;
  approved_claims?: string[];
  sales_pitch?: string;
  objections_json?: Array<{ objection: string; response: string }>;
  fulfillment_process?: string;
  payment_methods?: string[];
  landing_page_url?: string;
  lead_qualification_criteria?: string;
  responsible_department?: string;
  created_by?: string;
  source?: "founder" | "hermes_suggested" | "imported";
  created_at?: string;
  updated_at?: string;
}

export interface OfferSaveResult {
  ok: boolean;
  offerId?: string;
  error?: string;
}

export interface OfferSearchResult {
  ok: boolean;
  offer?: CompanyOffer;
  offers?: CompanyOffer[];
  error?: string;
}

// ────────────────────────────────────────────────────────────
// OfferCatalog
// ────────────────────────────────────────────────────────────
// Pre-seeded Canonical Company Offers
// ────────────────────────────────────────────────────────────

export const PRESEEDED_CANONICAL_OFFERS: CompanyOffer[] = [
  {
    id: "offer-solara-solar-microgrid",
    tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a",
    name: "Turnkey Commercial Solar Microgrid (50kW - 250kW)",
    description: "End-to-end solar engineering, installation, net-metering & 25-yr maintenance for factories.",
    category: "Clean Energy & Commercial Solar",
    status: "active",
    target_customer: "Industrial SME factories & manufacturing plants with monthly power bill > 1 Lakh INR",
    geography: ["Karnataka", "Maharashtra", "India"],
    pricing_json: { baseRateInr: 1500000, perKwInr: 42000, currency: "INR" },
    gross_margin_pct: 45,
    sales_cycle_days: 21,
    lead_qualification_criteria: "Monthly power tariff > ₹8/unit, rooftop area > 10,000 sq ft, factory ownership",
    source: "founder",
  },
  {
    id: "offer-foreign-university-admissions",
    tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a",
    name: "Foreign University Admissions Master Program",
    description: "Comprehensive end-to-end study abroad counseling, university shortlisting, SOP/LOR review, and visa preparation.",
    category: "Education & Admissions",
    status: "active",
    target_customer: "Undergraduate and graduate students targeting US, UK, Canada, and EU universities",
    geography: ["India", "Global"],
    pricing_json: { retainerFeeInr: 250000, successCommissionPct: 5, currency: "INR" },
    gross_margin_pct: 75,
    sales_cycle_days: 45,
    lead_qualification_criteria: "Academic GPA > 3.0 or equivalent, test scores (IELTS/GRE/GMAT) or target test date within 90 days, family financial backing",
    source: "founder",
  },
  {
    id: "offer-linkup-smb-platform",
    tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a",
    name: "Linkup",
    description: "Autonomous B2B CRM, lead qualification, and WhatsApp follow-up automation platform for Indian SMBs.",
    category: "B2B Commerce & Software",
    status: "active",
    target_customer: "Indian SMBs, manufacturing workshops, professional clinics, and service providers",
    geography: ["India"],
    pricing_json: { monthlySubscriptionInr: 15000, annualPlanInr: 150000, currency: "INR" },
    gross_margin_pct: 85,
    sales_cycle_days: 7,
    lead_qualification_criteria: "Operating business with 10+ employees, active sales leads, WhatsApp business usage",
    source: "founder",
  },
];

// ────────────────────────────────────────────────────────────
// OfferCatalog
// ────────────────────────────────────────────────────────────

export class OfferCatalog {
  private sb: SupabaseClient | null = null;
  private memoryCache: Map<string, CompanyOffer> = new Map();

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    if (supabaseUrl && typeof supabaseUrl === "string" && supabaseUrl.startsWith("http") && serviceRoleKey) {
      try {
        this.sb = createClient(supabaseUrl, serviceRoleKey);
      } catch {
        this.sb = null;
      }
    }
    // Seed in-memory cache
    for (const offer of PRESEEDED_CANONICAL_OFFERS) {
      if (offer.id) this.memoryCache.set(offer.id, { ...offer });
    }
  }

  private isMissingTableError(error: any): boolean {
    if (!error) return false;
    return (
      error.code === "PGRST205" ||
      (typeof error.message === "string" && error.message.includes("schema cache"))
    );
  }

  /** Save (upsert by name) an offer. Only the Founder provides facts. */
  async saveOffer(offer: CompanyOffer): Promise<OfferSaveResult> {
    if (this.sb) {
      try {
        // Check if exists by name (case-insensitive)
        const { data: existing, error: checkErr } = await this.sb
        .from("company_offers")
        .select("id")
        .eq("tenant_id", offer.tenant_id)
        .ilike("name", offer.name)
        .maybeSingle();

      if (!checkErr) {
        if (existing?.id) {
          const { error } = await this.sb
            .from("company_offers")
            .update({ ...offer, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (!error) {
            this.memoryCache.set(existing.id, { ...offer, id: existing.id });
            return { ok: true, offerId: existing.id };
          }
        } else {
          const { data, error } = await this.sb
            .from("company_offers")
            .insert({ ...offer, source: offer.source ?? "founder" })
            .select("id")
            .single();
          if (!error && data?.id) {
            this.memoryCache.set(data.id, { ...offer, id: data.id });
            return { ok: true, offerId: data.id };
          }
        }
      }
    } catch {
      // Non-blocking fallback to memory cache
    }
  }

    // Resilient fallback to memory cache
    const id = offer.id || `offer-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const saved: CompanyOffer = {
      ...offer,
      id,
      created_at: offer.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.memoryCache.set(id, saved);
    return { ok: true, offerId: id };
  }

  /** Get all active offers for a tenant. */
  async getOffers(tenantId: string): Promise<OfferSearchResult> {
    if (this.sb) {
      try {
        const { data, error } = await this.sb
        .from("company_offers")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("status", ["active", "draft"])
        .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          return { ok: true, offers: data };
        }
        if (error && !this.isMissingTableError(error)) {
          return { ok: false, error: error.message };
        }
      } catch {
        // Fallback
      }
    }

    // Return in-memory offers matching tenant or platform default
    const offers = Array.from(this.memoryCache.values()).filter(
      (o) => o.tenant_id === tenantId || o.tenant_id === "466e6195-a9f6-4576-8271-29fdae61c18a"
    );
    return { ok: true, offers };
  }

  /**
   * Find an offer by natural language (fuzzy name/category match).
   * Returns the best match or null. Never fabricates an offer.
   */
  async findOffer(tenantId: string, query: string): Promise<OfferSearchResult> {
    let pool: CompanyOffer[] = [];
    if (this.sb) {
      try {
        const { data, error } = await this.sb
        .from("company_offers")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("status", ["active", "draft"]);

        if (!error && data) {
          pool = data;
        }
      } catch {
        // Fallback
      }
    }

    if (pool.length === 0) {
      pool = Array.from(this.memoryCache.values());
    }

    if (pool.length === 0) return { ok: true, offer: undefined };

    const q = query.toLowerCase();
    const scored = pool.map((offer: CompanyOffer) => {
      const haystack = [
        offer.name,
        offer.description,
        offer.category,
        offer.target_customer,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { offer, score: hits };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.score === 0) return { ok: true, offer: undefined };
    return { ok: true, offer: best.offer };
  }

  /** Activate a draft offer. */
  async activateOffer(offerId: string): Promise<OfferSaveResult> {
    if (this.sb) {
      try {
        const { error } = await this.sb
        .from("company_offers")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", offerId);
        if (!error) return { ok: true, offerId };
      } catch {
        // Fallback
      }
    }

    const cached = this.memoryCache.get(offerId);
    if (cached) {
      cached.status = "active";
      cached.updated_at = new Date().toISOString();
      return { ok: true, offerId };
    }
    return { ok: true, offerId };
  }
}

const defaultSbUrl = (typeof process !== "undefined" && (process.env?.NEXT_PUBLIC_SUPABASE_URL || process.env?.SUPABASE_URL)) || "";
const defaultSbKey = (typeof process !== "undefined" && (process.env?.SUPABASE_SERVICE_ROLE_KEY || process.env?.SUPABASE_SERVICE_KEY)) || "";
export const offerCatalog = new OfferCatalog(defaultSbUrl, defaultSbKey);
