/**
 * StratXcel 10-Dimension Opportunity Scoring Engine
 *
 * Evaluates commercial opportunities across 10 distinct, explainable dimensions
 * yielding a total score between 0 and 100.
 *
 * Ensures StratXcel only expends sales energy on qualified, high-probability leads.
 */

import type { BusinessDiagnosisReport } from "./business-diagnosis.ts";

export interface OpportunityScoreInput {
  leadId?: string;
  businessName: string;
  category: string;
  location: {
    city: string;
    state?: string;
    locality?: string;
  };
  phone?: string;
  hasVerifiedPhone: boolean;
  hasOwnerPhone: boolean;
  diagnosisReport?: BusinessDiagnosisReport;
  estimatedMonthlyRevenueInr?: number;
  apparentBudgetComfort?: "low" | "medium" | "high";
  competitorPressure?: "low" | "medium" | "high";
  activeCommercialTrigger?: string; // e.g. "new branch opening", "festival sale", "hiring staff", "negative review surge"
  urgencySignal?: "low" | "medium" | "high";
}

export interface DimensionScoreDetail {
  dimensionIndex: number;
  dimensionName: string;
  score: number; // 0 - 10
  maxScore: 10;
  factor: string;
  reasoning: string;
}

export type OpportunityTier =
  | "TIER_1_HOT"        // 80 - 100: Immediate personalized consultative outreach
  | "TIER_2_WARM"       // 60 - 79: Standard consultative sequence
  | "TIER_3_COOL"       // 40 - 59: Automated nurture sequence
  | "DISQUALIFIED";     // 0 - 39: Do not waste outreach capacity

export interface OpportunityScoringResult {
  leadId?: string;
  businessName: string;
  totalScore: number; // 0 - 100
  tier: OpportunityTier;
  dimensionalBreakdown: DimensionScoreDetail[];
  recommendedOfferKey: string;
  recommendedOfferName: string;
  recommendedOutreachAngle: string;
  explainableAuditRationale: string;
  scoredAtIso: string;
}

export class OpportunityScoringEngine {
  /**
   * Scores a prospect on 10 explicit dimensions.
   */
  score(input: OpportunityScoreInput): OpportunityScoringResult {
    const dimensions: DimensionScoreDetail[] = [];
    const diagnosis = input.diagnosisReport;
    const cat = (input.category || "").toLowerCase();
    const city = (input.location.city || "").toLowerCase();
    const state = (input.location.state || "").toLowerCase();

    // 1. Business Fit (0 - 10)
    // Core StratXcel verticals: retail, clinic, gym, optical, restaurants, industrial, coaching, solar
    let fitScore = 6;
    let fitReason = "General commercial business with digital needs.";
    if (
      cat.includes("optical") ||
      cat.includes("gym") ||
      cat.includes("clinic") ||
      cat.includes("healthcare") ||
      cat.includes("industrial") ||
      cat.includes("solar") ||
      cat.includes("education") ||
      cat.includes("retail")
    ) {
      fitScore = 10;
      fitReason = "Exact core vertical matching StratXcel's proven solutions and canonical offers.";
    } else if (cat.includes("restaurant") || cat.includes("salon") || cat.includes("services")) {
      fitScore = 8;
      fitReason = "Strong vertical fit with high local search and WhatsApp inquiry dependency.";
    }
    dimensions.push({
      dimensionIndex: 1,
      dimensionName: "Business Fit",
      score: fitScore,
      maxScore: 10,
      factor: cat,
      reasoning: fitReason,
    });

    // 2. Problem Severity (0 - 10)
    // Evaluates how acute the pain is based on diagnosis
    let severityScore = 5;
    let severityReason = "Moderate baseline need for marketing improvements.";
    if (diagnosis) {
      if (diagnosis.overallDigitalMaturity === "CRITICAL_DEFICIT") {
        severityScore = 10;
        severityReason = "Critical digital deficit: business is essentially invisible to local mobile and search customers.";
      } else if (diagnosis.overallDigitalMaturity === "LOW") {
        severityScore = 8;
        severityReason = "High deficit: significant gaps in Google Maps reviews, website accessibility, or lead capture.";
      } else if (diagnosis.overallDigitalMaturity === "MODERATE") {
        severityScore = 6;
        severityReason = "Moderate deficit: presence exists but suffers from low conversion velocity.";
      } else {
        severityScore = 3;
        severityReason = "Low deficit: digital infrastructure already performing decently.";
      }
    }
    dimensions.push({
      dimensionIndex: 2,
      dimensionName: "Problem Severity",
      score: severityScore,
      maxScore: 10,
      factor: diagnosis?.overallDigitalMaturity ?? "unassessed",
      reasoning: severityReason,
    });

    // 3. Service Fit (0 - 10)
    // Do we have a direct, canonical service for this?
    let serviceFitScore = 8;
    let primaryOfferKey = "NORMAL_WEBSITE";
    let primaryOfferName = "Normal Business Website";
    let serviceFitReason = "Matches canonical web presence package.";

    if (diagnosis && diagnosis.recommendedServices.length > 0) {
      const topRec = diagnosis.recommendedServices[0];
      primaryOfferKey = topRec.offerKey;
      primaryOfferName = topRec.offerName;
      serviceFitScore = 10;
      serviceFitReason = `Direct 1:1 match with canonical service: ${topRec.offerName} (₹${topRec.startingPriceInr}).`;
    }
    dimensions.push({
      dimensionIndex: 3,
      dimensionName: "Service Fit",
      score: serviceFitScore,
      maxScore: 10,
      factor: primaryOfferKey,
      reasoning: serviceFitReason,
    });

    // 4. Buying Signal (0 - 10)
    // Any active commercial indicators?
    let buyingSignalScore = 4;
    let buyingSignalReason = "Standard passive operating business.";
    if (input.activeCommercialTrigger) {
      buyingSignalScore = 9;
      buyingSignalReason = `Active commercial trigger identified: "${input.activeCommercialTrigger}".`;
    } else if (input.urgencySignal === "high") {
      buyingSignalScore = 8;
      buyingSignalReason = "High stated commercial urgency to increase customer volume.";
    } else if (input.urgencySignal === "medium") {
      buyingSignalScore = 6;
      buyingSignalReason = "Moderate commercial motivation.";
    } else if (input.urgencySignal === "low") {
      buyingSignalScore = 2;
      buyingSignalReason = "Low commercial urgency stated.";
    }
    dimensions.push({
      dimensionIndex: 4,
      dimensionName: "Buying Signal",
      score: buyingSignalScore,
      maxScore: 10,
      factor: input.activeCommercialTrigger ?? input.urgencySignal ?? "none",
      reasoning: buyingSignalReason,
    });

    // 5. Ability to Pay (0 - 10)
    // Does the customer have the budget for StratXcel canonical pricing (₹3,000 - ₹15,000)?
    let abilityScore = 6;
    let abilityReason = "Standard local business with operating storefront and commercial cashflow.";
    const rev = input.estimatedMonthlyRevenueInr ?? 100000;
    if (rev >= 500000 || input.apparentBudgetComfort === "high" || cat.includes("industrial") || cat.includes("solar")) {
      abilityScore = 10;
      abilityReason = `High revenue profile (Est. ₹${rev.toLocaleString("en-IN")}/mo). Budget for ₹3,000–₹10,000 digital service is negligible expense.`;
    } else if (rev >= 100000 && input.apparentBudgetComfort !== "low") {
      abilityScore = 8;
      abilityReason = "Solid revenue tier easily supporting ₹3,000/mo or ₹3,500 package.";
    } else if (input.apparentBudgetComfort === "low") {
      abilityScore = 3;
      abilityReason = "Budget constrained; price sensitivity will be primary hesitation.";
    }
    dimensions.push({
      dimensionIndex: 5,
      dimensionName: "Ability to Pay",
      score: abilityScore,
      maxScore: 10,
      factor: `Est. Rev ₹${rev.toLocaleString("en-IN")}`,
      reasoning: abilityReason,
    });

    // 6. Expected ROI (0 - 10)
    // How easily can the service pay for itself?
    let roiScore = 7;
    let roiReason = "Single new customer or 2 extra walk-ins per month covers our service cost entirely.";
    if (cat.includes("optical") || cat.includes("clinic") || cat.includes("gym")) {
      roiScore = 10;
      roiReason = "High average customer value: 1-2 new patients/members directly recoups our entire ₹3,000–₹3,500 fee.";
    } else if (cat.includes("industrial") || cat.includes("solar")) {
      roiScore = 10;
      roiReason = "B2B deals worth ₹50,000–₹5,00,000+ yield astronomical ROI on our ₹5,000–₹10,000 fee.";
    } else if (input.apparentBudgetComfort === "low") {
      roiScore = 4;
      roiReason = "Lower margin profile slows payback velocity.";
    }
    dimensions.push({
      dimensionIndex: 6,
      dimensionName: "Expected ROI",
      score: roiScore,
      maxScore: 10,
      factor: "Payback ratio",
      reasoning: roiReason,
    });

    // 7. Contactability (0 - 10)
    // Direct mobile/WhatsApp access to decision maker
    let contactScore = 0;
    let contactReason = "No verified direct telephone or WhatsApp channel available.";
    if (input.hasOwnerPhone) {
      contactScore = 10;
      contactReason = "Verified direct mobile/WhatsApp number of owner/decision maker available.";
    } else if (input.hasVerifiedPhone) {
      contactScore = 8;
      contactReason = "Verified direct business telephone line/WhatsApp available.";
    }
    dimensions.push({
      dimensionIndex: 7,
      dimensionName: "Contactability",
      score: contactScore,
      maxScore: 10,
      factor: input.phone ? "Phone Present" : "Missing Phone",
      reasoning: contactReason,
    });

    // 8. Geographic Fit (0 - 10)
    // Priority: Chhattisgarh (Raipur, Bhilai, Durg, Bilaspur) or pan-India target cities
    let geoScore = 5;
    let geoReason = "Target Indian commercial region.";
    if (
      city.includes("raipur") ||
      city.includes("bhilai") ||
      city.includes("durg") ||
      city.includes("bilaspur") ||
      state.includes("chhattisgarh")
    ) {
      geoScore = 10;
      geoReason = "Primary home territory (Chhattisgarh). Highest local trust, physical presence, and rapid conversion.";
    } else if (
      city.includes("nagpur") ||
      city.includes("bhopal") ||
      city.includes("indore") ||
      city.includes("delhi") ||
      city.includes("bangalore") ||
      city.includes("mumbai")
    ) {
      geoScore = 8;
      geoReason = "Tier-1 / Tier-2 Indian commercial growth hub.";
    } else if (city.includes("unknown") || !city) {
      geoScore = 2;
      geoReason = "Unverified geography outside priority zones.";
    }
    dimensions.push({
      dimensionIndex: 8,
      dimensionName: "Geographic Fit",
      score: geoScore,
      maxScore: 10,
      factor: `${input.location.city}, ${input.location.state ?? "India"}`,
      reasoning: geoReason,
    });

    // 9. Digital Maturity Gap (0 - 10)
    // Is there room for high-impact improvement without them being tech-allergic?
    let maturityGapScore = 7;
    let maturityGapReason = "Clear room for growth with moderate tech readiness.";
    if (diagnosis) {
      const tech = diagnosis.dimensions.find((d) => d.dimensionNumber === 14)?.observedStatus;
      if (tech === "zero") {
        maturityGapScore = 4; // High gap, but adoption friction
        maturityGapReason = "Owner is unfamiliar with tech; requires extreme hand-holding.";
      } else if (tech === "basic" || tech === "intermediate") {
        maturityGapScore = 9;
        maturityGapReason = "Sweet spot: uses WhatsApp actively, understands digital value, but hasn't built modern customer acquisition assets.";
      }
    }
    dimensions.push({
      dimensionIndex: 9,
      dimensionName: "Digital Maturity Gap",
      score: maturityGapScore,
      maxScore: 10,
      factor: "Sweet spot zone",
      reasoning: maturityGapReason,
    });

    // 10. Competitive Opportunity (0 - 10)
    // Are nearby competitors outpacing them?
    let compScore = 6;
    let compReason = "Standard local competition.";
    if (input.competitorPressure === "high") {
      compScore = 9;
      compReason = "Aggressive competitor dominance creates high urgency to protect local market share.";
    } else if (input.competitorPressure === "medium") {
      compScore = 7;
      compReason = "Noticeable competitor lead in reviews and online visibility.";
    }
    dimensions.push({
      dimensionIndex: 10,
      dimensionName: "Competitive Opportunity",
      score: compScore,
      maxScore: 10,
      factor: input.competitorPressure ?? "moderate",
      reasoning: compReason,
    });

    // Sum Total Score
    const totalScore = dimensions.reduce((acc, d) => acc + d.score, 0);

    // Determine Tier
    let tier: OpportunityTier;
    if (totalScore >= 80) {
      tier = "TIER_1_HOT";
    } else if (totalScore >= 60) {
      tier = "TIER_2_WARM";
    } else if (totalScore >= 40) {
      tier = "TIER_3_COOL";
    } else {
      tier = "DISQUALIFIED";
    }

    // Determine Outreach Angle
    let recommendedOutreachAngle = "Direct Consultative Insight";
    if (cat.includes("optical")) {
      recommendedOutreachAngle = "Local Google Maps Footfall & Spectacles Inquiries";
    } else if (cat.includes("gym")) {
      recommendedOutreachAngle = "Monthly Member Growth & Direct WhatsApp Trial Bookings";
    } else if (cat.includes("clinic")) {
      recommendedOutreachAngle = "Google Search Ranking & Automated Patient Appointment Flow";
    } else if (cat.includes("industrial") || cat.includes("solar")) {
      recommendedOutreachAngle = "High-Ticket Commercial B2B Inquiries & Digital Catalog Authority";
    } else {
      recommendedOutreachAngle = "Customer Acquisition & Digital Trust Enhancement";
    }

    const explainableAuditRationale =
      `Opportunity Score: ${totalScore}/100 (${tier}). ` +
      `Evaluated on 10 criteria for ${input.businessName} (${input.location.city}). ` +
      `Primary Strengths: ${dimensions.filter((d) => d.score >= 8).map((d) => `${d.dimensionName} (${d.score}/10)`).join(", ")}. ` +
      `Recommended Strategy: Lead with ${primaryOfferName} focusing on "${recommendedOutreachAngle}".`;

    return {
      leadId: input.leadId,
      businessName: input.businessName,
      totalScore,
      tier,
      dimensionalBreakdown: dimensions,
      recommendedOfferKey: primaryOfferKey,
      recommendedOfferName: primaryOfferName,
      recommendedOutreachAngle,
      explainableAuditRationale,
      scoredAtIso: new Date().toISOString(),
    };
  }
}
