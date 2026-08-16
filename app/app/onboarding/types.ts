export type SocialPlatformKey = "instagram" | "facebook" | "whatsapp" | "linkedin" | "youtube" | "threads" | "x";

export interface SocialConnection {
  platform: SocialPlatformKey;
  handle?: string;
  url?: string;
  displayName?: string;
  status: "not_connected" | "connecting" | "connected" | "needs_attention";
  /** How this connection was established. OAuth = real provider authorization. */
  connectionType?: "oauth" | "public_profile" | "manual";
  /** Provider-assigned account ID from OAuth (e.g. Meta IG user ID). */
  providerAccountId?: string;
  /** Display label from the provider (e.g. "StratXcel Solutions" from Meta). */
  providerDisplayName?: string;
  /** Provider name for attribution (e.g. "Meta", "Google", "LinkedIn"). */
  providerLabel?: string;
  connectedAt?: string;
}

export interface DiscoveredSocialDraft {
  platform: string;
  url: string;
  handle: string;
  confirmed: boolean;
}

export interface OnboardingDraft {
  account: {
    connections: SocialConnection[];
  };
  business: {
    name: string;
    slug?: string;
    slugTouched?: boolean;
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

export const ONBOARDING_STEP_LABELS = [
  "Account",
  "Connectors",
  "Business",
  "Goals",
  "Review",
] as const;

export const INITIAL_SOCIAL_CONNECTORS: SocialConnection[] = [
  { platform: "instagram", status: "not_connected" },
  { platform: "facebook", status: "not_connected" },
  { platform: "whatsapp", status: "not_connected" },
  { platform: "linkedin", status: "not_connected" },
  { platform: "youtube", status: "not_connected" },
  { platform: "threads", status: "not_connected" },
];

export const EMPTY_DRAFT: OnboardingDraft = {
  account: {
    connections: INITIAL_SOCIAL_CONNECTORS,
  },
  business: {
    name: "",
    slug: "",
    slugTouched: false,
    industry: "",
    businessModel: "B2B",
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

export const PLAN_TIERS: readonly PlanTier[] = [
  { key: "starter", name: "Starter", pitch: "Live verified website, WhatsApp receptionist, and essential brand foundation." },
  { key: "growth", name: "Growth", pitch: "Daily Social Autopilot, instant WhatsApp qualification, and active lead management." },
  { key: "business", name: "Business", pitch: "Multi-channel advertising, full CRM automations, and priority execution support." },
];
