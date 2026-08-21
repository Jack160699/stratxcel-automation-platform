export type V1SocialPlatformKey =
  | "google_business"
  | "google_search_console"
  | "google_analytics"
  | "instagram"
  | "facebook"
  | "youtube"
  | "whatsapp";

export type SocialPlatformKey =
  | V1SocialPlatformKey
  | "threads"
  | "linkedin"
  | "x";

export const V1_CONNECTORS: readonly V1SocialPlatformKey[] = [
  "google_business",
  "google_search_console",
  "google_analytics",
  "instagram",
  "facebook",
  "youtube",
  "whatsapp",
] as const;

export interface GoogleSearchConfigDraft {
  status?: string;
  searchConsoleSiteUrl?: string | null;
  ga4PropertyId?: string | null;
  ga4PropertyDisplayName?: string | null;
}

export interface SocialConnection {
  platform: SocialPlatformKey;
  handle?: string;
  url?: string;
  displayName?: string;
  status: "not_connected" | "connecting" | "connected" | "needs_attention";
  /** How this connection was established. OAuth = real provider authorization. */
  connectionType?: "oauth" | "public_profile" | "otp_verified" | "manual";
  /** Provider-assigned account ID from OAuth (e.g. Meta IG user ID). */
  providerAccountId?: string;
  /** Display label from the provider (e.g. "StratXcel Solutions" from Meta). */
  providerDisplayName?: string;
  /** Provider name for attribution (e.g. "Google", "Meta", "WhatsApp Verified"). */
  providerLabel?: string;
  connectedAt?: string;
  /** Optional Search Console / GA4 property meta attached to the connection */
  propertyId?: string;
  propertyDisplayName?: string;
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
    googleSearch?: GoogleSearchConfigDraft;
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

/**
 * StratXcel Onboarding reference (Claude Design project
 * 6c2ad0a0-c8c8-47d1-a79d-3a1b255a7b01, "StratXcel Onboarding.dc.html")
 * — index-aligned with its own `step` state (0 = Welcome, no progress bar
 * shown; 1-4 have labels + a visible progress bar). Connectors is no
 * longer its own step — the reference reaches account-connection through
 * an optional bottom sheet from the Brand step (and again from Review),
 * not a dedicated full-screen step.
 */
export const ONBOARDING_STEP_LABELS = [
  "Welcome",
  "Business",
  "Your Goals",
  "Your Brand",
  "Review & Launch",
] as const;

/** Mandatory V1 connector order: Google Business -> Instagram -> Facebook -> YouTube -> WhatsApp Number */
export const INITIAL_SOCIAL_CONNECTORS: SocialConnection[] = [
  { platform: "google_business", status: "not_connected" },
  { platform: "instagram", status: "not_connected" },
  { platform: "facebook", status: "not_connected" },
  { platform: "youtube", status: "not_connected" },
  { platform: "whatsapp", status: "not_connected" },
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
  { key: "starter", name: "Starter", pitch: "Live verified website, verified WhatsApp alerts, and essential brand foundation." },
  { key: "growth", name: "Growth", pitch: "Daily Social Autopilot, intelligent audience growth, and multi-channel publishing." },
  { key: "business", name: "Business", pitch: "Multi-channel advertising, autonomous campaign execution, and priority execution support." },
];
