/**
 * Audit → Service Recommendation & Upsell Engine
 *
 * Translates audit findings into concrete service recommendations, reasons,
 * interactive demo previews, and strategic upsell pathways:
 * - Scenario A: Weak SEO + Weak Social -> Recommend SEO + Social (₹6,998/mo), upsell Advanced Growth (₹18,498/mo).
 * - Scenario B: Strong SEO + Weak Social -> Recommend Social Content (₹3,999/mo), upsell Advanced Social (₹8,499/mo).
 * - Scenario C: Weak SEO + Strong Social -> Recommend SEO Growth (₹2,999/mo), upsell Advanced SEO (₹9,999/mo).
 * - Scenario D: Strong SEO + Strong Social -> Recommend Advanced Growth (₹18,498/mo).
 * - Scenario E: Website issues detected -> Surface Website Add-ons (₹999 / ₹2,999 / Custom Quote).
 */

export type RecommendedPlanTier = "starter" | "growth" | "business";

export type RecommendedServiceKey =
  | "seo"
  | "social"
  | "seo_and_social"
  | "advanced_seo"
  | "advanced_social"
  | "advanced_growth"
  // Legacy backward compatibility
  | "starter"
  | "growth"
  | "business";

export type AuditScenario = "scenario_a" | "scenario_b" | "scenario_c" | "scenario_d";

export interface PlanRecommendationSignals {
  googleBusinessConnected: boolean;
  discoverabilitySeoScore: number | null;
  competitorCount: number;
  socialContentScore: number | null;
  visualContentOpportunityCount: number;
  hasWebsite: boolean;
  websiteHealthScore?: number | null;
  trustReputationScore: number | null;
  highImpactFindingCount: number;
}

export interface WebsiteRecommendation {
  needed: boolean;
  type: "landing_page" | "standard_website" | "custom_website";
  title: string;
  price: string;
  priceCents: number | null;
  reason: string;
  cta: string;
  href: string;
}

export interface ServiceUpsell {
  key: "advanced_seo" | "advanced_social" | "advanced_growth";
  title: string;
  price: string;
  priceCents: number;
  pitch: string;
  whyUpgrade: string;
  cta: string;
  href: string;
}

export interface InteractiveAuditDemos {
  socialDemo: {
    title: string;
    samplePostHook: string;
    samplePostCaption: string;
    samplePillar: string;
    suggestedVisual: string;
  };
  seoDemo: {
    title: string;
    targetKeyword: string;
    projectedMonthlySearches: number;
    recommendedAction: string;
  };
  websiteDemo?: {
    suggestedLayout: string;
    keyConversionAction: string;
  };
  whatsappDemo?: {
    previewDialogue: Array<{ sender: "user" | "bot"; text: string }>;
  };
}

export interface PlanRecommendation {
  scenario: AuditScenario;
  serviceKey: RecommendedServiceKey;
  tier: "starter" | "growth" | "business"; // legacy test compatibility
  serviceName: string;
  price: string;
  priceCents: number;
  biggestOpportunity: { title: string; body: string };
  whatStratxcelCanDo: string[];
  why: string;
  upsell?: ServiceUpsell;
  websiteRecommendation?: WebsiteRecommendation;
  demos: InteractiveAuditDemos;
}

export function deriveSignalsFromReport(report: any): PlanRecommendationSignals {
  const gbpConnected = Boolean(
    report?.connectors?.some((c: any) => c.provider === "google_business" && (c.state === "connected" || c.state === "available")) ||
    report?.presenceLinks?.some((p: any) => p.platform === "google_business" && p.url)
  );
  const seoScore = report?.discoverability?.score ?? report?.overallScore ?? null;
  const competitorCount = Array.isArray(report?.competitors) ? report.competitors.length : 0;
  const socialScore = report?.socialPresence?.score ?? null;
  const visualOppCount = Array.isArray(report?.contentOpportunities) ? report.contentOpportunities.length : 0;
  const hasWebsite = Boolean(report?.presenceLinks?.some((p: any) => p.platform === "website" && p.url) || report?.websiteHealth);
  const websiteHealthScore = report?.websiteHealth?.score ?? null;
  const trustScore = report?.reputation?.score ?? null;
  const highImpactCount = Array.isArray(report?.keyFindings) ? report.keyFindings.filter((f: any) => f.severity === "high" || f.priority === "high").length : 0;

  return {
    googleBusinessConnected: gbpConnected,
    discoverabilitySeoScore: seoScore,
    competitorCount,
    socialContentScore: socialScore,
    visualContentOpportunityCount: visualOppCount,
    hasWebsite,
    websiteHealthScore,
    trustReputationScore: trustScore,
    highImpactFindingCount: highImpactCount,
  };
}

export function evaluateAuditScenario(signals: PlanRecommendationSignals): AuditScenario {
  const seoScore = signals.discoverabilitySeoScore ?? 50;
  const socialScore = signals.socialContentScore ?? 50;
  const isWeakSeo = !signals.googleBusinessConnected || seoScore < 60;
  const isWeakSocial = socialScore < 60 || signals.visualContentOpportunityCount >= 4;

  if (isWeakSeo && isWeakSocial) return "scenario_a";
  if (!isWeakSeo && isWeakSocial) return "scenario_b";
  if (isWeakSeo && !isWeakSocial) return "scenario_c";
  return "scenario_d";
}

export function recommendPlan(signals: PlanRecommendationSignals): PlanRecommendation {
  const scenario = evaluateAuditScenario(signals);
  const websiteNeeded = !signals.hasWebsite || (signals.websiteHealthScore != null && signals.websiteHealthScore < 50);

  let websiteRec: WebsiteRecommendation | undefined;
  if (websiteNeeded) {
    if (!signals.hasWebsite) {
      websiteRec = {
        needed: true,
        type: "landing_page",
        title: "Basic Landing Page",
        price: "₹999 (one-time, GST included)",
        priceCents: 99_900,
        reason: "Your business currently lacks a dedicated digital conversion page to capture search and social traffic.",
        cta: "Get Landing Page (₹999)",
        href: "/app/billing?addon=landing_page",
      };
    } else {
      websiteRec = {
        needed: true,
        type: "standard_website",
        title: "5–6 Page Business Website",
        price: "₹2,999 (one-time, GST included)",
        priceCents: 299_900,
        reason: "Your current website has discoverability and structure gaps. A fresh 5-6 page AI-generated site provides clean SEO and mobile speed.",
        cta: "Get Full Website (₹2,999)",
        href: "/app/billing?addon=website_standard",
      };
    }
  }

  const defaultDemos: InteractiveAuditDemos = {
    socialDemo: {
      title: "Sample Brand-Grounded Post Preview",
      samplePostHook: "3 Things Most Customers Don't Know Before Booking",
      samplePostCaption: "High standards make all the difference. Discover how our proven approach delivers consistent quality every single time. Comment or DM for details!",
      samplePillar: "Educational & Trust Building",
      suggestedVisual: "Brand-aligned clean typography with visual hero overlay",
    },
    seoDemo: {
      title: "Top Keyword Opportunity Preview",
      targetKeyword: "best service provider near me",
      projectedMonthlySearches: 1400,
      recommendedAction: "Optimize Google Business Profile category tags, local schema, and review responses.",
    },
    websiteDemo: websiteNeeded
      ? {
          suggestedLayout: "Mobile-First Conversion Funnel with WhatsApp Direct Chat",
          keyConversionAction: "Instant WhatsApp Inquiry & One-Tap Call",
        }
      : undefined,
    whatsappDemo: {
      previewDialogue: [
        { sender: "user", text: "Hi, what are your hours and pricing?" },
        { sender: "bot", text: "Hello! We're open 9am–7pm Mon–Sat. Our services start at ₹2,999. Would you like to view our full catalog or book an appointment?" },
      ],
    },
  };

  switch (scenario) {
    case "scenario_a":
      return {
        scenario: "scenario_a",
        serviceKey: "seo_and_social",
        tier: "growth",
        serviceName: "SEO + Social Content",
        price: "₹6,998/month (GST included)",
        priceCents: 699_800,
        biggestOpportunity: {
          title: "Dual Search Discoverability & Social Presence Gap",
          body: "Your business has low visibility on Google Search/Maps and an inconsistent social posting rhythm, leaking high-intent local buyers to competitors.",
        },
        whatStratxcelCanDo: [
          "28 premium brand-grounded posts created, scheduled & published every month",
          "Google Business Profile optimization, ranking tracking & review reply drafting",
          "Brand Brain positioning to guarantee zero-hallucination quality",
          "Monthly cross-channel growth & visibility analytics",
        ],
        why: "Your audit indicates low Google discoverability and inconsistent social posting. SEO + Social solves both core growth channels immediately. For complete autonomous research and automated operations, explore Advanced Growth.",
        upsell: {
          key: "advanced_growth",
          title: "Advanced Growth",
          price: "₹18,498/month (GST included)",
          priceCents: 1_849_800,
          pitch: "Complete hands-off growth machine across search, social, WhatsApp, and web.",
          whyUpgrade: "Includes Advanced SEO, Social Autopilot with 100 image generations, autonomous 24/7 WhatsApp reception, and a FREE landing page.",
          cta: "Upgrade to Advanced Growth (₹18,498)",
          href: "/app/billing?plan=advanced_growth",
        },
        websiteRecommendation: websiteRec,
        demos: defaultDemos,
      };

    case "scenario_b":
      return {
        scenario: "scenario_b",
        serviceKey: "social",
        tier: "starter",
        serviceName: "Social Content",
        price: "₹3,999/month (GST included)",
        priceCents: 399_900,
        biggestOpportunity: {
          title: "Inconsistent Social Brand Presence",
          body: "While your search baseline is respectable, your social channels lack a consistent, high-converting publishing cadence.",
        },
        whatStratxcelCanDo: [
          "28 brand-aligned posts produced & scheduled monthly",
          "AI visual creatives tailored with your brand colors & fonts",
          "Automated publishing across Instagram and Facebook",
          "Seasonal & festival observance calendar integration",
        ],
        why: "Your search presence is solid, but your social presence is underperforming. 28 monthly posts will keep your brand active and top of mind. Upgrade to Advanced Social for full Autopilot and 100 images.",
        upsell: {
          key: "advanced_social",
          title: "Advanced Social",
          price: "₹8,499/month (GST included)",
          priceCents: 849_900,
          pitch: "Autonomous Social Autopilot with deep trend research and creative intelligence.",
          whyUpgrade: "Unlocks full Social Autopilot, strategic trend research, and up to 100 image-generation attempts per month.",
          cta: "Upgrade to Advanced Social (₹8,499)",
          href: "/app/billing?plan=advanced_social",
        },
        websiteRecommendation: websiteRec,
        demos: defaultDemos,
      };

    case "scenario_c":
      return {
        scenario: "scenario_c",
        serviceKey: "seo",
        tier: "starter",
        serviceName: "SEO Growth",
        price: "₹2,999/month (GST included)",
        priceCents: 299_900,
        biggestOpportunity: {
          title: "Uncaptured High-Intent Local Search Demand",
          body: "Your social engagement is active, but potential customers searching for your services on Google Search and Maps cannot find you.",
        },
        whatStratxcelCanDo: [
          "Continuous local SEO & keyword ranking optimization",
          "Google Business Profile management & category mapping",
          "Review monitoring with AI response assistance",
          "Monthly search traffic and local keyword ranking reports",
        ],
        why: "Your social presence is active, but potential customers cannot find you on Google Search or Maps. SEO Growth fixes your local visibility and Google Business profile.",
        upsell: {
          key: "advanced_seo",
          title: "Advanced SEO",
          price: "₹9,999/month (GST included)",
          priceCents: 999_900,
          pitch: "Deep search intelligence, competitor gap conquest, and automated blog workflows.",
          whyUpgrade: "Unlocks high-intent content gap conquest, long-tail keyword research, and autonomous blog generation.",
          cta: "Upgrade to Advanced SEO (₹9,999)",
          href: "/app/billing?plan=advanced_seo",
        },
        websiteRecommendation: websiteRec,
        demos: defaultDemos,
      };

    case "scenario_d":
    default:
      return {
        scenario: "scenario_d",
        serviceKey: "advanced_growth",
        tier: "business",
        serviceName: "Advanced Growth",
        price: "₹18,498/month (GST included)",
        priceCents: 1_849_800,
        biggestOpportunity: {
          title: "Market Leadership & Autonomous Scaling Opportunity",
          body: "Your baseline presence across search and social is established. Scaling to market leadership requires unified autonomous execution across SEO, social, messaging, and web.",
        },
        whatStratxcelCanDo: [
          "Advanced SEO: deep research, keyword conquest & automated blog workflows",
          "Advanced Social: 28 posts, full Social Autopilot & 100 image attempts/mo",
          "WhatsApp Autopilot: 24/7 lead qualification & automated booking",
          "FREE high-converting landing page included as an active subscriber bonus",
        ],
        why: "Your baseline presence is established. Advanced Growth combines Advanced SEO, Social Autopilot, WhatsApp Autopilot, and dedicated growth execution to scale your market position.",
        websiteRecommendation: websiteRec,
        demos: defaultDemos,
      };
  }
}
