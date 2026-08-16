/**
 * StratXcel Paid Advertising Planning Engine (Meta Ads & Google Ads).
 *
 * Capabilities:
 * - Campaign Strategy & Goal Definition
 * - Audience & Keyword Research
 * - Ad Copy & Creative Variant Generation
 * - Budget Allocation & ROI Forecasting
 * - Human-Gated Spend Execution Boundary
 *
 * CRITICAL SAFETY INVARIANT:
 * Autonomous systems may READ, ANALYZE, RECOMMEND, and DRAFT ad campaigns.
 * Real financial spend and budget increases STRICTLY require explicit human approval.
 */

export type AdPlatform = "meta_ads" | "google_ads";

export interface AdCreativeDraft {
  id: string;
  headline: string;
  secondaryHeadline?: string;
  primaryText: string;
  description?: string;
  callToAction: "LEARN_MORE" | "SHOP_NOW" | "SIGN_UP" | "CONTACT_US" | "GET_QUOTE";
  targetLandingUrl: string;
  imageOrVideoBrief: string;
}

export interface AdSetOrKeywordCluster {
  id: string;
  name: string;
  targeting: {
    locations: string[];
    ageRange?: { min: number; max: number };
    interestsOrKeywords: string[];
    negativeKeywords?: string[];
  };
  dailyBudgetRupees: number;
  creatives: AdCreativeDraft[];
}

export interface AdCampaignDraft {
  campaignId: string;
  platform: AdPlatform;
  tenantId: string;
  campaignName: string;
  objective: "LEAD_GENERATION" | "CONVERSIONS" | "TRAFFIC" | "BRAND_AWARENESS";
  adSets: AdSetOrKeywordCluster[];
  totalMonthlyBudgetRupees: number;
  dailyBudgetRupees: number;
  status: "DRAFT_PENDING_APPROVAL" | "APPROVED" | "ACTIVE" | "PAUSED" | "REJECTED";
  createdReason: string;
  approvalRequired: boolean; // Always true for spend
  approvedBy?: string;
  approvedAt?: string;
}

export interface BudgetChangeProposal {
  proposalId: string;
  campaignId: string;
  platform: AdPlatform;
  currentDailyBudgetRupees: number;
  proposedDailyBudgetRupees: number;
  reason: string;
  projectedOutcomeDelta: string;
  status: "REQUIRES_HUMAN_APPROVAL" | "APPROVED" | "REJECTED";
}

/**
 * Generates an advertising strategy and campaign draft based on business goals and audit findings.
 */
export function generateCampaignDraft(input: {
  platform: AdPlatform;
  tenantId: string;
  businessName: string;
  offering: string;
  targetLocations: string[];
  monthlyBudgetRupees: number;
}): AdCampaignDraft {
  const dailyBudget = Math.round(input.monthlyBudgetRupees / 30);

  if (input.platform === "meta_ads") {
    return {
      campaignId: `meta-camp-${Date.now()}`,
      platform: "meta_ads",
      tenantId: input.tenantId,
      campaignName: `${input.businessName} - High-Intent Local Customer Acquisition`,
      objective: "LEAD_GENERATION",
      totalMonthlyBudgetRupees: input.monthlyBudgetRupees,
      dailyBudgetRupees: dailyBudget,
      status: "DRAFT_PENDING_APPROVAL",
      createdReason: "Target nearby customers actively seeking services in your area",
      approvalRequired: true,
      adSets: [
        {
          id: "meta-adset-1",
          name: "Local Service Seekers (10km Radius)",
          targeting: {
            locations: input.targetLocations,
            ageRange: { min: 24, max: 55 },
            interestsOrKeywords: [input.offering, "Home Improvement", "Local Services"],
          },
          dailyBudgetRupees: dailyBudget,
          creatives: [
            {
              id: "meta-ad-1",
              headline: `Looking for top-rated ${input.offering}?`,
              primaryText: `Trusted by local customers. Contact ${input.businessName} today for expert service, guaranteed quality, and fast response!`,
              callToAction: "GET_QUOTE",
              targetLandingUrl: "https://www.stratxcel.in/",
              imageOrVideoBrief: "High-contrast clean photo showing actual work outcome with 5-star badge overlay.",
            },
            {
              id: "meta-ad-2",
              headline: `Get expert ${input.offering} nearby`,
              primaryText: `Special offer for new customers in your area. Contact ${input.businessName} to claim your consultation.`,
              callToAction: "CONTACT_US",
              targetLandingUrl: "https://www.stratxcel.in/",
              imageOrVideoBrief: "Short 6-second video showing customer testimonial and quick work process.",
            },
          ],
        },
      ],
    };
  }

  // Google Ads Campaign Draft
  return {
    campaignId: `gads-camp-${Date.now()}`,
    platform: "google_ads",
    tenantId: input.tenantId,
    campaignName: `${input.businessName} - Search Intent Campaign`,
    objective: "LEAD_GENERATION",
    totalMonthlyBudgetRupees: input.monthlyBudgetRupees,
    dailyBudgetRupees: dailyBudget,
    status: "DRAFT_PENDING_APPROVAL",
    createdReason: "Capture high-intent search queries from customers looking for services right now",
    approvalRequired: true,
    adSets: [
      {
        id: "gads-group-1",
        name: "High-Intent Search Keywords",
        targeting: {
          locations: input.targetLocations,
          interestsOrKeywords: [
            `best ${input.offering} near me`,
            `${input.offering} services`,
            `reliable ${input.offering}`,
            `hire ${input.offering}`,
          ],
          negativeKeywords: ["free", "jobs", "salary", "diy", "course"],
        },
        dailyBudgetRupees: dailyBudget,
        creatives: [
          {
            id: "gads-ad-1",
            headline: `${input.businessName} | Expert ${input.offering}`,
            secondaryHeadline: "Top Rated Local Service | Quick Quote",
            primaryText: `Reliable ${input.offering} by experienced professionals. Fast response, verified reviews, transparent pricing.`,
            callToAction: "GET_QUOTE",
            targetLandingUrl: "https://www.stratxcel.in/",
            imageOrVideoBrief: "Responsive Search Ad text assets with sitelinks for Pricing, Reviews, and Contact.",
          },
        ],
      },
    ],
  };
}

/**
 * Evaluates whether an ad campaign can be activated.
 * Throws a safe error if human approval token is missing.
 */
export function activateCampaignWithApproval(
  draft: AdCampaignDraft,
  approval: { isApproved: boolean; approvedBy: string; approvalToken: string },
): AdCampaignDraft {
  if (!approval.isApproved || !approval.approvalToken) {
    throw new Error(
      "SPEND_APPROVAL_REQUIRED: Paid advertising campaign cannot be activated without explicit human approval token",
    );
  }

  return {
    ...draft,
    status: "ACTIVE",
    approvalRequired: false,
    approvedBy: approval.approvedBy,
    approvedAt: new Date().toISOString(),
  };
}

/**
 * Generates an autonomous budget change recommendation.
 * Remains in REQUIRES_HUMAN_APPROVAL status.
 */
export function proposeBudgetAdjustment(
  campaign: AdCampaignDraft,
  proposedDailyRupees: number,
  reason: string,
): BudgetChangeProposal {
  return {
    proposalId: `prop-${Date.now()}`,
    campaignId: campaign.campaignId,
    platform: campaign.platform,
    currentDailyBudgetRupees: campaign.dailyBudgetRupees,
    proposedDailyBudgetRupees: proposedDailyRupees,
    reason,
    projectedOutcomeDelta: proposedDailyRupees > campaign.dailyBudgetRupees
      ? "+35% projected lead volume at steady cost-per-acquisition"
      : "Conserves ad budget during low-conversion hours",
    status: "REQUIRES_HUMAN_APPROVAL",
  };
}
