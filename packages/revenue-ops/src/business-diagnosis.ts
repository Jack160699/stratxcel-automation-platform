/**
 * StratXcel 17-Dimension Business Diagnosis Engine
 *
 * Outlaws generic pitching. Before offering any service to a business,
 * Hermes conducts an in-depth diagnosis across 17 distinct operational
 * and digital dimensions.
 *
 * Rules:
 * 1. Never pitch a website to a business whose primary bottleneck is Google Maps visibility.
 * 2. Never pitch custom software to an optical shop or salon needing local footfall.
 * 3. Never invent pricing; recommendations map to StratXcel canonical catalog.
 * 4. Tailor recommendations to industry vertical and current digital maturity.
 */

import {
  STRATXCEL_CANONICAL_OFFERS,
  type StratXcelCanonicalOffer,
} from "../../workforce-core/src/catalogue/stratxcel-business-brain.ts";

export type BusinessCategory =
  | "optical_shop"
  | "gym_fitness"
  | "clinic_healthcare"
  | "industrial_manufacturing"
  | "retail_boutique"
  | "restaurant_cafe"
  | "education_coaching"
  | "professional_services"
  | "solar_clean_energy"
  | "general_smb";

export type WebPresenceStatus = "none" | "subdomain" | "outdated" | "broken" | "good";
export type GmbStatus = "unclaimed" | "low_rating" | "few_reviews" | "moderate" | "optimized";
export type SocialActivityStatus = "none" | "dormant" | "inconsistent" | "active";
export type TechMaturityLevel = "zero" | "basic" | "intermediate" | "advanced";
export type PriceTier = "budget" | "growth" | "enterprise";

export interface BusinessDiagnosisInput {
  businessName: string;
  category: BusinessCategory | string;
  location: {
    city: string;
    state?: string;
    locality?: string;
  };
  phone?: string;
  websiteUrl?: string | null;
  webPresence?: WebPresenceStatus;
  gmbStatus?: GmbStatus;
  gmbRating?: number;
  gmbReviewCount?: number;
  hasSocial?: boolean;
  socialActivity?: SocialActivityStatus;
  daysSinceLastPost?: number;
  leadCaptureMechanism?: "none" | "phone_only" | "whatsapp_cta" | "form" | "automated_crm";
  estimatedMonthlyRevenueInr?: number;
  customerLtvTier?: "low" | "medium" | "high";
  commercialUrgency?: "low" | "medium" | "high";
  priceTier?: PriceTier;
  competitorDominance?: "low" | "medium" | "high";
  localSearchRank?: number; // 1-3 (top 3 pack), 4-10, 11+ (invisible)
  unansweredReviewsRatio?: number; // 0 to 1
  hasSeasonalOpportunity?: boolean;
  seasonalNotes?: string;
  techMaturity?: TechMaturityLevel;
  preferredCommunication?: "whatsapp" | "phone" | "email" | "in_person";
  hasVisualAssets?: boolean;
  primaryStatedPain?: string;
}

export interface DimensionDiagnosis {
  dimensionNumber: number;
  dimensionName: string;
  observedStatus: string;
  gapSeverity: "NONE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  finding: string;
}

export interface ServiceRecommendation {
  offerKey: string;
  offerName: string;
  startingPriceInr: number;
  billingFrequency: "one_time" | "monthly" | "custom_quotation";
  minimumCommitmentMonths?: number;
  rationale: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  pricingRuleNote: string;
  expectedBusinessOutcome: string;
}

export interface UnrecommendedService {
  offerKey: string;
  offerName: string;
  reasonWhyNotRecommended: string;
}

export interface BusinessDiagnosisReport {
  businessName: string;
  category: string;
  location: {
    city: string;
    state?: string;
    locality?: string;
  };
  dimensions: DimensionDiagnosis[];
  overallDigitalMaturity: "CRITICAL_DEFICIT" | "LOW" | "MODERATE" | "HIGH";
  primaryBottleneck: string;
  primaryGaps: string[];
  recommendedServices: ServiceRecommendation[];
  unrecommendedServices: UnrecommendedService[];
  executiveSummary: string;
  diagnosedAtIso: string;
}

export class BusinessDiagnosisEngine {
  /**
   * Evaluates the 17 business dimensions and constructs a tailored, non-generic diagnosis report.
   */
  diagnose(input: BusinessDiagnosisInput): BusinessDiagnosisReport {
    const dimensions: DimensionDiagnosis[] = [];

    // 1. Business Category / Vertical
    const normCategory = (input.category || "general_smb").toLowerCase();
    dimensions.push({
      dimensionNumber: 1,
      dimensionName: "Business Category / Vertical",
      observedStatus: normCategory,
      gapSeverity: "NONE",
      finding: `Operating in the ${normCategory.replace(/_/g, " ")} sector in ${input.location.city}. Specific local buyer behavior applies.`,
    });

    // 2. Existing Web Presence
    const web = input.webPresence ?? (input.websiteUrl ? "outdated" : "none");
    const webSeverity = web === "none" || web === "broken" ? "HIGH" : web === "outdated" || web === "subdomain" ? "MODERATE" : "NONE";
    dimensions.push({
      dimensionNumber: 2,
      dimensionName: "Existing Web Presence",
      observedStatus: web,
      gapSeverity: webSeverity,
      finding: web === "none"
        ? "No independent business website found. Business relies entirely on third-party listings or footfall."
        : web === "good"
        ? "Existing modern website active. Pitching a new website would be redundant and wasteful."
        : `Website present but status is ${web}. Lacks modern conversion elements and mobile responsiveness.`,
    });

    // 3. Google Maps / GMB Presence
    const gmb = input.gmbStatus ?? (input.gmbReviewCount !== undefined && input.gmbReviewCount < 15 ? "few_reviews" : "moderate");
    const gmbRating = input.gmbRating ?? 0;
    const gmbReviews = input.gmbReviewCount ?? 0;
    const gmbSeverity = gmb === "unclaimed" ? "CRITICAL" : gmb === "low_rating" || gmb === "few_reviews" ? "HIGH" : "LOW";
    dimensions.push({
      dimensionNumber: 3,
      dimensionName: "Google Maps / GMB Presence",
      observedStatus: `${gmb} (${gmbReviews} reviews, ${gmbRating || "N/A"} stars)`,
      gapSeverity: gmbSeverity,
      finding: gmb === "unclaimed"
        ? "Google Business Profile is unverified or unclaimed. Losing significant local footfall daily."
        : gmbReviews < 20
        ? `Only ${gmbReviews} reviews on Google Maps. Competitors in ${input.location.city} with 50+ reviews are capturing nearby search intent.`
        : `Google profile active with ${gmbReviews} reviews (${gmbRating} rating).`,
    });

    // 4. Mobile Responsiveness & Speed
    const isMobileDeficit = web === "none" || web === "broken" || web === "outdated";
    dimensions.push({
      dimensionNumber: 4,
      dimensionName: "Mobile Responsiveness & Speed",
      observedStatus: isMobileDeficit ? "Deficit" : "Acceptable",
      gapSeverity: isMobileDeficit ? "MODERATE" : "NONE",
      finding: isMobileDeficit
        ? "Mobile web experience is absent or unoptimized. 85%+ of local Indian search traffic occurs on mobile devices."
        : "Mobile presentation meets baseline expectations.",
    });

    // 5. Social Media Activity
    const social = input.socialActivity ?? (input.daysSinceLastPost && input.daysSinceLastPost > 45 ? "dormant" : input.hasSocial ? "inconsistent" : "none");
    const socialSeverity = social === "none" || social === "dormant" ? "MODERATE" : social === "inconsistent" ? "LOW" : "NONE";
    dimensions.push({
      dimensionNumber: 5,
      dimensionName: "Social Media Activity",
      observedStatus: social,
      gapSeverity: socialSeverity,
      finding: social === "none" || social === "dormant"
        ? "Social presence is inactive or missing recent posts, harming customer confidence when researching online."
        : `Social media presence is ${social}.`,
    });

    // 6. Lead Capture Mechanism
    const leadCapture = input.leadCaptureMechanism ?? "phone_only";
    const leadSeverity = leadCapture === "none" || leadCapture === "phone_only" ? "HIGH" : "NONE";
    dimensions.push({
      dimensionNumber: 6,
      dimensionName: "Current Lead Capture Mechanism",
      observedStatus: leadCapture,
      gapSeverity: leadSeverity,
      finding: leadCapture === "phone_only" || leadCapture === "none"
        ? "Relies solely on direct incoming phone calls without Click-to-WhatsApp or automated inquiry capture. Misses after-hours inquiries."
        : `Lead capture utilizing ${leadCapture}.`,
    });

    // 7. Customer LTV Potential
    const ltv = input.customerLtvTier ?? (normCategory.includes("industrial") || normCategory.includes("solar") || normCategory.includes("education") ? "high" : "medium");
    dimensions.push({
      dimensionNumber: 7,
      dimensionName: "Customer Lifetime Value (LTV) Potential",
      observedStatus: `${ltv.toUpperCase()} LTV`,
      gapSeverity: "NONE",
      finding: `Customer transaction value classified as ${ltv}. Justifies targeted ROI on digital acquisition systems.`,
    });

    // 8. Commercial Urgency & Readiness
    const urgency = input.commercialUrgency ?? "medium";
    dimensions.push({
      dimensionNumber: 8,
      dimensionName: "Commercial Urgency & Readiness",
      observedStatus: urgency,
      gapSeverity: urgency === "high" ? "HIGH" : "LOW",
      finding: urgency === "high"
        ? "Business owner has expressed immediate need to increase customer inquiries or defend market share."
        : "Standard commercial pace.",
    });

    // 9. Price Sensitivity & Budget Tier
    const priceTier = input.priceTier ?? (normCategory.includes("industrial") ? "enterprise" : "budget");
    dimensions.push({
      dimensionNumber: 9,
      dimensionName: "Price Sensitivity & Budget Tier",
      observedStatus: `${priceTier.toUpperCase()}`,
      gapSeverity: "NONE",
      finding: `Budget profile maps to StratXcel's ${priceTier === "budget" ? "₹3,000 - ₹3,500 entry tier" : priceTier === "growth" ? "₹5,000 - ₹10,000 growth tier" : "custom enterprise tier"}.`,
    });

    // 10. Competitor Posture
    const compDominance = input.competitorDominance ?? (input.localSearchRank && input.localSearchRank > 3 ? "high" : "medium");
    dimensions.push({
      dimensionNumber: 10,
      dimensionName: "Key Competitor Posture",
      observedStatus: `${compDominance.toUpperCase()} competitive pressure`,
      gapSeverity: compDominance === "high" ? "HIGH" : "LOW",
      finding: compDominance === "high"
        ? `Local competitors in ${input.location.city} are capturing the majority of organic search impressions and Google Maps 3-pack.`
        : "Moderate competitive pressure with open local ranking slots.",
    });

    // 11. Local Search Visibility Gap
    const searchRank = input.localSearchRank ?? (gmbReviews < 15 ? 10 : 3);
    const isSearchInvisible = searchRank > 3;
    dimensions.push({
      dimensionNumber: 11,
      dimensionName: "Local Search Visibility Gap",
      observedStatus: isSearchInvisible ? `Position #${searchRank} (Outside 3-pack)` : "Within Top 3",
      gapSeverity: isSearchInvisible ? "HIGH" : "NONE",
      finding: isSearchInvisible
        ? `Ranked around position #${searchRank} for primary local queries. 70%+ of clicks go to the top 3 Google Maps listings.`
        : "Currently visible in the primary local search cluster.",
    });

    // 12. Reputation & Review Deficit
    const reviewDeficit = gmbReviews < 25 || (input.unansweredReviewsRatio && input.unansweredReviewsRatio > 0.3);
    dimensions.push({
      dimensionNumber: 12,
      dimensionName: "Reputation & Review Deficit",
      observedStatus: reviewDeficit ? "Deficit detected" : "Sound reputation",
      gapSeverity: reviewDeficit ? "MODERATE" : "NONE",
      finding: reviewDeficit
        ? "Review count or review response rate is deficient, weakening social proof when potential clients compare options."
        : "Review velocity and customer ratings support commercial trust.",
    });

    // 13. Seasonal / Event Revenue Opportunities
    const hasSeasonal = input.hasSeasonalOpportunity ?? false;
    dimensions.push({
      dimensionNumber: 13,
      dimensionName: "Seasonal / Event Revenue Opportunities",
      observedStatus: hasSeasonal ? "Seasonal surges present" : "Stable steady-state",
      gapSeverity: "NONE",
      finding: hasSeasonal
        ? `High seasonal demand window identified: ${input.seasonalNotes ?? "Upcoming festive or enrollment period"}. Ideal for promotional campaigns.`
        : "Year-round demand model.",
    });

    // 14. Tech Maturity
    const tech = input.techMaturity ?? "basic";
    dimensions.push({
      dimensionNumber: 14,
      dimensionName: "Tech Maturity",
      observedStatus: tech,
      gapSeverity: tech === "zero" ? "HIGH" : "NONE",
      finding: `Tech adoption is ${tech}. Solutions must be simple, friction-free, and accessible directly via WhatsApp without requiring complex software training.`,
    });

    // 15. Communication Preference
    const comm = input.preferredCommunication ?? "whatsapp";
    dimensions.push({
      dimensionNumber: 15,
      dimensionName: "Communication Preference",
      observedStatus: comm.toUpperCase(),
      gapSeverity: "NONE",
      finding: `Owner communicates predominantly via ${comm}. Outreach and lead delivery must be prioritized via this channel.`,
    });

    // 16. Content & Visual Assets Readiness
    const assets = input.hasVisualAssets ?? false;
    dimensions.push({
      dimensionNumber: 16,
      dimensionName: "Content & Visual Assets Readiness",
      observedStatus: assets ? "Assets available" : "Assets needed",
      gapSeverity: assets ? "NONE" : "LOW",
      finding: assets
        ? "High quality photos/branding elements are available."
        : "Will require StratXcel to provide ready-to-use branded creatives and graphic layouts.",
    });

    // 17. Primary Business Pain
    const statedPain = input.primaryStatedPain ?? (isSearchInvisible ? "Low footfall / poor local search visibility" : "Need consistent inbound inquiries");
    dimensions.push({
      dimensionNumber: 17,
      dimensionName: "Primary Business Pain",
      observedStatus: statedPain,
      gapSeverity: "HIGH",
      finding: `Primary commercial bottleneck identified as: "${statedPain}". All proposed interventions must directly address this pain.`,
    });

    // Compute Overall Digital Maturity
    const criticalCount = dimensions.filter((d) => d.gapSeverity === "CRITICAL").length;
    const highCount = dimensions.filter((d) => d.gapSeverity === "HIGH").length;
    let maturity: "CRITICAL_DEFICIT" | "LOW" | "MODERATE" | "HIGH" = "HIGH";
    if (criticalCount > 0 || highCount >= 4) {
      maturity = "CRITICAL_DEFICIT";
    } else if (highCount >= 2) {
      maturity = "LOW";
    } else if (dimensions.some((d) => d.gapSeverity === "MODERATE")) {
      maturity = "MODERATE";
    }

    const primaryGaps = dimensions
      .filter((d) => d.gapSeverity === "CRITICAL" || d.gapSeverity === "HIGH")
      .map((d) => `${d.dimensionName}: ${d.finding}`);

    // Generate Tailored Recommendations based on Vertical + Specific Gaps
    const { recommendedServices, unrecommendedServices, primaryBottleneck, executiveSummary } =
      this.synthesizeRecommendations(input, dimensions, maturity);

    return {
      businessName: input.businessName,
      category: input.category,
      location: input.location,
      dimensions,
      overallDigitalMaturity: maturity,
      primaryBottleneck,
      primaryGaps,
      recommendedServices,
      unrecommendedServices,
      executiveSummary,
      diagnosedAtIso: new Date().toISOString(),
    };
  }

  private synthesizeRecommendations(
    input: BusinessDiagnosisInput,
    dimensions: DimensionDiagnosis[],
    maturity: "CRITICAL_DEFICIT" | "LOW" | "MODERATE" | "HIGH"
  ): {
    recommendedServices: ServiceRecommendation[];
    unrecommendedServices: UnrecommendedService[];
    primaryBottleneck: string;
    executiveSummary: string;
  } {
    const recommendedServices: ServiceRecommendation[] = [];
    let unrecommendedServices: UnrecommendedService[] = [];
    const normCat = (input.category || "").toLowerCase();
    const hasGoodSite = input.webPresence === "good";
    const needsSite = input.webPresence === "none" || input.webPresence === "broken" || input.webPresence === "outdated";
    const gmbDeficit = dimensions.find((d) => d.dimensionNumber === 3)?.gapSeverity !== "NONE" ||
      dimensions.find((d) => d.dimensionNumber === 11)?.gapSeverity === "HIGH";
    const socialDeficit = input.socialActivity === "none" || input.socialActivity === "dormant";

    const getOffer = (key: string) => STRATXCEL_CANONICAL_OFFERS.find((o) => o.key === key);

    // Specific Vertical Rules
    if (normCat.includes("optical") || normCat.includes("eye_care")) {
      // Optical Shop Rule: Focus on Google Maps Local Growth + Fast 3-page Normal Website with WhatsApp CTA.
      // NEVER recommend custom app.
      if (gmbDeficit) {
        const mapsOffer = getOffer("GOOGLE_BUSINESS_MAPS_GROWTH")!;
        recommendedServices.push({
          offerKey: mapsOffer.key,
          offerName: mapsOffer.name,
          startingPriceInr: mapsOffer.startingPriceInr,
          billingFrequency: mapsOffer.billingFrequency,
          priority: "CRITICAL",
          pricingRuleNote: mapsOffer.pricingRuleNote,
          rationale: "Optical customers buy based on proximity and eye exam convenience. Dominating local 3-pack Maps directly drives walk-in footfall.",
          expectedBusinessOutcome: "Top 3 local Google Maps ranking in target locality, doubling walk-in inquiries for eye exams and spectacles.",
        });
      }

      if (needsSite) {
        const webOffer = getOffer("NORMAL_WEBSITE")!;
        recommendedServices.push({
          offerKey: webOffer.key,
          offerName: webOffer.name,
          startingPriceInr: webOffer.startingPriceInr,
          billingFrequency: webOffer.billingFrequency,
          priority: "HIGH",
          pricingRuleNote: webOffer.pricingRuleNote,
          rationale: "Essential 3-5 page presence showing frames catalog, store timings, doctor availability, and Click-to-WhatsApp booking.",
          expectedBusinessOutcome: "Clean digital presence allowing nearby shoppers to browse spectacle frames and verify store legitimacy.",
        });
      }

      unrecommendedServices = [
        {
          offerKey: "COMPLEX_CUSTOM_WEBSITE",
          offerName: "Complex Custom Enterprise Website",
          reasonWhyNotRecommended: "An optical shop requires local footfall and immediate trust, not high-cost custom web software or proprietary portals.",
        },
        {
          offerKey: "CUSTOMIZED_WEBSITE",
          offerName: "Customized Business Website (₹10,000)",
          reasonWhyNotRecommended: "Over-scoped for a local retail optical storefront; normal 3-5 page site is 100% sufficient and cost-effective.",
        },
      ];
    } else if (normCat.includes("gym") || normCat.includes("fitness")) {
      // Gym / Fitness Rule:
      // If they have a good website, DO NOT pitch website redesign! Pitch Social Media + WhatsApp Lead Funnel.
      if (hasGoodSite) {
        unrecommendedServices = [
          {
            offerKey: "NORMAL_WEBSITE",
            offerName: "Normal Business Website",
            reasonWhyNotRecommended: "Business already possesses an operational, modern website. Rebuilding it would be redundant and fail to solve lead acquisition.",
          },
          {
            offerKey: "PREMIUM_DETAILED_WEBSITE",
            offerName: "Premium Detailed Website",
            reasonWhyNotRecommended: "Website infrastructure is already sound. The real bottleneck is member acquisition and trial bookings.",
          },
        ];
      } else {
        unrecommendedServices = [
          {
            offerKey: "COMPLEX_CUSTOM_WEBSITE",
            offerName: "Complex Custom Enterprise Website",
            reasonWhyNotRecommended: "Gym operations do not require bespoke software at this stage; commercial priority is recurring monthly member signups.",
          },
        ];
      }

      const socialOffer = getOffer("SOCIAL_MEDIA_PREMIUM") ?? getOffer("SOCIAL_MEDIA_STANDARD")!;
      recommendedServices.push({
        offerKey: socialOffer.key,
        offerName: socialOffer.name,
        startingPriceInr: socialOffer.startingPriceInr,
        billingFrequency: socialOffer.billingFrequency,
        priority: "CRITICAL",
        pricingRuleNote: socialOffer.pricingRuleNote,
        rationale: "Gym members join based on visual inspiration, trainer credibility, equipment showcase, and member transformations on Instagram.",
        expectedBusinessOutcome: "20+ monthly workout/diet posters and reels driving direct WhatsApp trial workout bookings.",
      });

      if (gmbDeficit) {
        const mapsOffer = getOffer("GOOGLE_BUSINESS_MAPS_GROWTH")!;
        recommendedServices.push({
          offerKey: mapsOffer.key,
          offerName: mapsOffer.name,
          startingPriceInr: mapsOffer.startingPriceInr,
          billingFrequency: mapsOffer.billingFrequency,
          priority: "HIGH",
          pricingRuleNote: mapsOffer.pricingRuleNote,
          rationale: "People searching 'gym near me' choose the closest gym with strong 4.5+ star reviews and active photos.",
          expectedBusinessOutcome: "Dominating local fitness searches, generating 15-25 direct walk-ins/calls per month.",
        });
      }
    } else if (normCat.includes("industrial") || normCat.includes("manufacturing") || normCat.includes("solar")) {
      // Industrial / Manufacturing / B2B Solar Rule:
      // Custom site / deep catalog + SEO (Min 3 mo) + B2B Leads.
      // Outlaw normal 3-page cheap site (damages enterprise credibility).
      const webOffer = getOffer("CUSTOMIZED_WEBSITE") ?? getOffer("PREMIUM_DETAILED_WEBSITE")!;
      recommendedServices.push({
        offerKey: webOffer.key,
        offerName: webOffer.name,
        startingPriceInr: webOffer.startingPriceInr,
        billingFrequency: webOffer.billingFrequency,
        priority: "CRITICAL",
        pricingRuleNote: webOffer.pricingRuleNote,
        rationale: "B2B industrial buyers and procurement heads evaluate engineering specs, certifications, capacity, and past client installations.",
        expectedBusinessOutcome: "Authoritative digital catalog establishing technical credibility for high-ticket contracts.",
      });

      const seoOffer = getOffer("SEO")!;
      recommendedServices.push({
        offerKey: seoOffer.key,
        offerName: seoOffer.name,
        startingPriceInr: seoOffer.startingPriceInr,
        billingFrequency: seoOffer.billingFrequency,
        minimumCommitmentMonths: 3,
        priority: "HIGH",
        pricingRuleNote: seoOffer.pricingRuleNote,
        rationale: "Industrial buyers search pan-India/state-wide for suppliers on Google. Continuous organic ranking creates high-ticket B2B inquiry flow.",
        expectedBusinessOutcome: "First-page ranking for commercial queries, generating qualified commercial RFQs.",
      });

      unrecommendedServices = [
        {
          offerKey: "NORMAL_WEBSITE",
          offerName: "Normal Business Website (₹3,000)",
          reasonWhyNotRecommended: "A minimal 3-page site lacks the technical depth and specification capacity required for industrial procurement credibility.",
        },
      ];
    } else if (normCat.includes("clinic") || normCat.includes("doctor") || normCat.includes("healthcare") || normCat.includes("hospital")) {
      // Healthcare / Clinic Rule:
      // Maps Growth + Review Engine + WhatsApp Appointment Funnel.
      const mapsOffer = getOffer("GOOGLE_BUSINESS_MAPS_GROWTH")!;
      recommendedServices.push({
        offerKey: mapsOffer.key,
        offerName: mapsOffer.name,
        startingPriceInr: mapsOffer.startingPriceInr,
        billingFrequency: mapsOffer.billingFrequency,
        priority: "CRITICAL",
        pricingRuleNote: mapsOffer.pricingRuleNote,
        rationale: "Patients prioritize proximity and verified patient reviews above all else when selecting a specialist or diagnostic center.",
        expectedBusinessOutcome: "Dominating local medical searches in the city and collecting verified patient reviews.",
      });

      if (needsSite) {
        const webOffer = getOffer("NORMAL_WEBSITE")!;
        recommendedServices.push({
          offerKey: webOffer.key,
          offerName: webOffer.name,
          startingPriceInr: webOffer.startingPriceInr,
          billingFrequency: webOffer.billingFrequency,
          priority: "HIGH",
          pricingRuleNote: webOffer.pricingRuleNote,
          rationale: "Professional clinic website displaying doctor qualifications, clinic timings, treatments offered, and WhatsApp appointment booking.",
          expectedBusinessOutcome: "Frictionless patient scheduling and trust verification.",
        });
      }

      unrecommendedServices = [
        {
          offerKey: "COMPLEX_CUSTOM_WEBSITE",
          offerName: "Complex Custom Enterprise Website",
          reasonWhyNotRecommended: "Clinics require high trust and effortless appointment booking via WhatsApp, not complex portals that cause patient drop-off.",
        },
      ];
    } else {
      // General SMB / Retail / Food & Beverage / Services
      if (needsSite) {
        const webOffer = getOffer("NORMAL_WEBSITE")!;
        recommendedServices.push({
          offerKey: webOffer.key,
          offerName: webOffer.name,
          startingPriceInr: webOffer.startingPriceInr,
          billingFrequency: webOffer.billingFrequency,
          priority: "CRITICAL",
          pricingRuleNote: webOffer.pricingRuleNote,
          rationale: "Establishes immediate digital credibility, showcases core products/services, and captures WhatsApp inquiries.",
          expectedBusinessOutcome: "Professional online storefront with mobile optimization and direct WhatsApp booking.",
        });
      }

      if (gmbDeficit) {
        const mapsOffer = getOffer("GOOGLE_BUSINESS_MAPS_GROWTH")!;
        recommendedServices.push({
          offerKey: mapsOffer.key,
          offerName: mapsOffer.name,
          startingPriceInr: mapsOffer.startingPriceInr,
          billingFrequency: mapsOffer.billingFrequency,
          priority: "HIGH",
          pricingRuleNote: mapsOffer.pricingRuleNote,
          rationale: "Improves local search ranking and review score so nearby shoppers find this business first.",
          expectedBusinessOutcome: "Higher local map visibility and steady footfall/phone inquiries.",
        });
      }

      if (socialDeficit && !needsSite) {
        const socialOffer = getOffer("SOCIAL_MEDIA_STANDARD")!;
        recommendedServices.push({
          offerKey: socialOffer.key,
          offerName: socialOffer.name,
          startingPriceInr: socialOffer.startingPriceInr,
          billingFrequency: socialOffer.billingFrequency,
          priority: "MEDIUM",
          pricingRuleNote: socialOffer.pricingRuleNote,
          rationale: "Maintains an active, polished brand image on Instagram & Facebook with regular promotional posters.",
          expectedBusinessOutcome: "Consistent brand awareness and customer engagement.",
        });
      }

      unrecommendedServices = [
        {
          offerKey: "COMPLEX_CUSTOM_WEBSITE",
          offerName: "Complex Custom Enterprise Website",
          reasonWhyNotRecommended: "Premature for local SMB stage. High ROI entry solutions should precede custom software.",
        },
      ];
    }

    const primaryBottleneck = recommendedServices.length > 0
      ? `${recommendedServices[0].offerName} (${recommendedServices[0].rationale})`
      : "Optimization of existing customer conversion funnels";

    const executiveSummary = `Business Diagnosis for "${input.businessName}" (${normCat.replace(/_/g, " ")}) in ${input.location.city}: ` +
      `Overall digital maturity is ${maturity}. Primary commercial bottleneck is ${primaryBottleneck}. ` +
      `Recommended strategy prioritizes ${recommendedServices.map((r) => `${r.offerName} (₹${r.startingPriceInr}${r.minimumCommitmentMonths ? ` min ${r.minimumCommitmentMonths}mo` : ""})`).join(", ")}. ` +
      `Generic pitches avoided: ${unrecommendedServices.map((u) => u.offerName).join(", ")} ruled out as unsuitable.`;

    return {
      recommendedServices,
      unrecommendedServices,
      primaryBottleneck,
      executiveSummary,
    };
  }
}
