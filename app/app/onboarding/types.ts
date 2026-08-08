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

/** Mirrors app/pricing/page.tsx's tier names/pitches — same public terminology, not a second taxonomy. */
export const PLAN_TIERS: PlanTier[] = [
  { key: "starter", name: "Starter", pitch: "A complete entry system for one small business." },
  { key: "growth", name: "Growth", pitch: "Recommended for recurring SMB growth and follow-up." },
  { key: "business", name: "Business", pitch: "Advanced execution, CRM, Search, and priority assistance." },
  { key: "scale", name: "Scale / Custom", pitch: "Quote-led for high volume or multiple locations." },
  { key: "unsure", name: "Not sure yet", pitch: "Talk to the team before choosing a tier." },
];
