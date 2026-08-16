export interface DiscoveredSocialDraft {
  platform: string;
  url: string;
  handle: string;
  confirmed: boolean;
}

export interface OnboardingDraft {
  business: {
    name: string;
    slug: string;
    slugTouched: boolean;
    industry: string;
    businessModel?: string;
    website: string;
    googleMapsUrl?: string;
    location: string;
    stage?: string;
    whatsapp?: string;
    services?: string[];
    primaryOffer?: string;
    socials?: DiscoveredSocialDraft[];
    intelligenceProvenance?: Record<string, string>;
    userEditedFields?: Record<string, boolean>;
  };
  goals: string[];
  recommendedGoals?: string[];
  brand: {
    businessName: string;
    description: string;
    audience: string;
    tone: string;
    offers: string;
    restrictions: string;
  };
  plan: {
    tier: string | null;
    note: string;
    recommendedPackage?: string;
    transformation?: { current: string[]; target: string[]; thirtyDayAction: string };
  };
  whatsappDelivery?: {
    countryIso: string;
    nationalNumber: string;
    consent: boolean;
  };
}

export const ONBOARDING_DRAFT_KEY = "stratxcel_onboarding_draft_v1";

export const ONBOARDING_STEP_LABELS = ["Account", "Business", "Goals", "Brand", "Plan", "Review"] as const;

export const EMPTY_DRAFT: OnboardingDraft = {
  business: {
    name: "",
    slug: "",
    slugTouched: false,
    industry: "",
    businessModel: "",
    website: "",
    googleMapsUrl: "",
    location: "",
    stage: "NEW/STARTING",
    whatsapp: "",
    services: [],
    primaryOffer: "",
    socials: [],
    intelligenceProvenance: {},
    userEditedFields: {},
  },
  goals: [],
  recommendedGoals: [],
  brand: { businessName: "", description: "", audience: "", tone: "", offers: "", restrictions: "" },
  plan: { tier: null, note: "" },
  whatsappDelivery: { countryIso: "IN", nationalNumber: "", consent: true },
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface PlanTier {
  key: string;
  name: string;
  pitch: string;
}

/**
 * Mirrors app/pricing/page.tsx's customer-facing plans — one public
 * taxonomy, not two. The earlier Signal/Mesh/Fleet names were internal-era
 * terminology that had drifted out of the pricing page; they appeared
 * nowhere a customer could reconcile them against a price.
 *
 * `key` is only ever written to an audit_events metadata blob
 * (onboarding.plan_requested), never to a schema column, so changing these
 * strings cannot break existing data.
 */
export const PLAN_TIERS: PlanTier[] = [
  { key: "audit", name: "Instant Audit", pitch: "Start with a free evidence-backed Instant Business Audit." },
  { key: "free", name: "Free", pitch: "Explore the workspace and prepare your growth system." },
  { key: "starter", name: "Starter", pitch: "A complete entry system for one small or local business." },
  { key: "growth", name: "Growth", pitch: "The serious SMB plan for recurring execution and follow-up." },
  { key: "business", name: "Business", pitch: "Advanced Search, CRM, publishing, ads support, and priority execution." },
  { key: "scale", name: "Scale / Custom", pitch: "Tailored scope with a dedicated account owner." },
  { key: "unsure", name: "Not sure yet", pitch: "Talk to the team before choosing a plan." },
];
