export interface OnboardingDraft {
  business: { name: string; slug: string; slugTouched: boolean; industry: string; website: string; location: string };
  goals: string[];
  brand: { businessName: string; description: string; audience: string; tone: string; offers: string; restrictions: string };
  plan: { tier: string | null; note: string };
}

export const ONBOARDING_DRAFT_KEY = "stratxcel_onboarding_draft_v1";

export const ONBOARDING_STEP_LABELS = ["Account", "Business", "Goals", "Brand", "Plan", "Review"] as const;

export const EMPTY_DRAFT: OnboardingDraft = {
  business: { name: "", slug: "", slugTouched: false, industry: "", website: "", location: "" },
  goals: [],
  brand: { businessName: "", description: "", audience: "", tone: "", offers: "", restrictions: "" },
  plan: { tier: null, note: "" },
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
  { key: "audit", name: "Audit", pitch: "Start with a ₹999 AI Business Growth Audit." },
  { key: "launch", name: "Launch", pitch: "Growth basics for establishing businesses." },
  { key: "growth", name: "Growth", pitch: "Complete marketing, website, WhatsApp & CRM system." },
  { key: "custom", name: "Custom Growth", pitch: "Tailored scope with a dedicated account owner." },
  { key: "unsure", name: "Not sure yet", pitch: "Talk to the team before choosing a plan." },
];
