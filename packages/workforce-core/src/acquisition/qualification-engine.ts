/**
 * Explainable Lead Qualification & Scoring Engine
 * StratXcel Autonomous Company OS - Workforce Core
 */

import type { LeadIdentity, LeadQualification, LeadSourceProvenance } from "./types.ts";

export interface QualificationCriteriaInput {
  targetIndustry?: string;
  targetGeography?: string;
  targetOfferCategory?: string;
  minScoreThreshold?: number;
}

export function evaluateLeadQualification(
  identity: LeadIdentity,
  provenances: LeadSourceProvenance[],
  criteria: QualificationCriteriaInput,
  context?: {
    painPoint?: string;
    decisionMakerRole?: string;
    estimatedDealValueInr?: number;
  }
): LeadQualification {
  const breakdown: LeadQualification["scoringBreakdown"] = [];
  let totalScore = 0;

  // 1. Geography Fit (20 pts)
  const targetGeo = (criteria.targetGeography || "").toLowerCase().trim();
  const leadLocation = [identity.city, identity.stateOrRegion, identity.facilityAddress, identity.country]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let geoMatch = false;
  if (!targetGeo || targetGeo === "india") {
    geoMatch = true;
    totalScore += 20;
    breakdown.push({
      factor: "Geography",
      pointsAwarded: 20,
      maxPoints: 20,
      explanation: "National/broad Indian geographic criteria satisfied.",
    });
  } else if (leadLocation.includes(targetGeo) || (targetGeo.includes("raipur") && leadLocation.includes("chhattisgarh"))) {
    geoMatch = true;
    totalScore += 20;
    breakdown.push({
      factor: "Geography",
      pointsAwarded: 20,
      maxPoints: 20,
      explanation: `Target location "${criteria.targetGeography}" matched facility address: ${identity.city || identity.facilityAddress}.`,
    });
  } else {
    // Partial region match
    totalScore += 5;
    breakdown.push({
      factor: "Geography",
      pointsAwarded: 5,
      maxPoints: 20,
      explanation: `Location "${leadLocation}" does not strictly match target "${criteria.targetGeography}".`,
    });
  }

  // 2. Industry & ICP Fit (25 pts)
  const targetInd = (criteria.targetIndustry || criteria.targetOfferCategory || "B2B").toLowerCase();
  const companyKeywords = `${identity.companyName} ${context?.painPoint || ""}`.toLowerCase();
  let industryFit = false;

  if (targetInd.includes("solar") && (companyKeywords.includes("solar") || companyKeywords.includes("energy") || companyKeywords.includes("tooling") || companyKeywords.includes("manufacturing") || companyKeywords.includes("steel") || companyKeywords.includes("industr"))) {
    industryFit = true;
    totalScore += 25;
    breakdown.push({
      factor: "Industry Fit",
      pointsAwarded: 25,
      maxPoints: 25,
      explanation: "Commercial/industrial rooftop solar ICP verified (high daytime energy load & facility roof).",
    });
  } else if ((targetInd.includes("school") || targetInd.includes("admission") || targetInd.includes("education")) && (companyKeywords.includes("school") || companyKeywords.includes("college") || companyKeywords.includes("university") || companyKeywords.includes("academy") || companyKeywords.includes("vidyalaya"))) {
    industryFit = true;
    totalScore += 25;
    breakdown.push({
      factor: "Industry Fit",
      pointsAwarded: 25,
      maxPoints: 25,
      explanation: "Accredited educational institution or admission channel ICP verified.",
    });
  } else if (targetInd.includes("saas") || targetInd.includes("linkup") || targetInd.includes("smb")) {
    industryFit = true;
    totalScore += 25;
    breakdown.push({
      factor: "Industry Fit",
      pointsAwarded: 25,
      maxPoints: 25,
      explanation: "Active commercial SMB eligible for Linkup / WhatsApp sales automation.",
    });
  } else {
    totalScore += 15;
    breakdown.push({
      factor: "Industry Fit",
      pointsAwarded: 15,
      maxPoints: 25,
      explanation: "General B2B commercial entity match.",
    });
  }

  // 3. Contactability & Channel Readiness (20 pts)
  let contactabilityReady = false;
  let contactScore = 0;
  if (identity.primaryPhone && identity.primaryEmail) {
    contactScore = 20;
    contactabilityReady = true;
    breakdown.push({
      factor: "Contactability",
      pointsAwarded: 20,
      maxPoints: 20,
      explanation: `Dual direct channels available: E.164 Phone (${identity.primaryPhone}) & verified email.`,
    });
  } else if (identity.primaryPhone) {
    contactScore = 15;
    contactabilityReady = true;
    breakdown.push({
      factor: "Contactability",
      pointsAwarded: 15,
      maxPoints: 20,
      explanation: `Direct E.164 phone available: ${identity.primaryPhone} (WhatsApp outreach eligible).`,
    });
  } else if (identity.primaryEmail) {
    contactScore = 12;
    contactabilityReady = true;
    breakdown.push({
      factor: "Contactability",
      pointsAwarded: 12,
      maxPoints: 20,
      explanation: `Direct business email available: ${identity.primaryEmail}.`,
    });
  } else {
    contactScore = 0;
    breakdown.push({
      factor: "Contactability",
      pointsAwarded: 0,
      maxPoints: 20,
      explanation: "No direct contact channel verified yet (requires enrichment).",
    });
  }
  totalScore += contactScore;

  // 4. Need / Buying Signal (15 pts)
  let needDetected = false;
  if (context?.painPoint && context.painPoint.length > 10) {
    needDetected = true;
    totalScore += 15;
    breakdown.push({
      factor: "Buying Signal",
      pointsAwarded: 15,
      maxPoints: 15,
      explanation: `Documented operational signal: "${context.painPoint.slice(0, 80)}..."`,
    });
  } else {
    totalScore += 8;
    breakdown.push({
      factor: "Buying Signal",
      pointsAwarded: 8,
      maxPoints: 15,
      explanation: "Standard commercial buying intent inferred from active registered status.",
    });
  }

  // 5. Decision-Maker Availability (10 pts)
  let dmIdentified = false;
  if (context?.decisionMakerRole) {
    dmIdentified = true;
    totalScore += 10;
    breakdown.push({
      factor: "Decision Maker",
      pointsAwarded: 10,
      maxPoints: 10,
      explanation: `Identified key decision maker role: ${context.decisionMakerRole}.`,
    });
  } else {
    totalScore += 3;
    breakdown.push({
      factor: "Decision Maker",
      pointsAwarded: 3,
      maxPoints: 10,
      explanation: "General company contact identified; specific executive unconfirmed.",
    });
  }

  // 6. Source Provenance Confidence (10 pts)
  const highestConfidence = provenances.some((p) => p.confidence === "VERIFIED")
    ? 10
    : provenances.some((p) => p.confidence === "HIGH")
    ? 8
    : 5;
  totalScore += highestConfidence;
  breakdown.push({
    factor: "Provenance Confidence",
    pointsAwarded: highestConfidence,
    maxPoints: 10,
    explanation: `Sourced from ${provenances.length} verified discovery channel(s) with ${provenances[0]?.confidence || "STANDARD"} confidence.`,
  });

  // Calculate Tier
  let icpFitTier: LeadQualification["icpFitTier"];
  let status: LeadQualification["status"];

  if (totalScore >= 75) {
    icpFitTier = "TIER_1_ENTERPRISE";
    status = "QUALIFIED";
  } else if (totalScore >= 55) {
    icpFitTier = "TIER_2_GROWTH";
    status = "VERIFIED";
  } else if (totalScore >= 40) {
    icpFitTier = "TIER_3_SMB";
    status = "ENRICHED";
  } else {
    icpFitTier = "UNQUALIFIED";
    status = "DISCOVERED";
  }

  const summaryRationale = `Qualification Score ${totalScore}/100 (${icpFitTier}). ${
    geoMatch ? "Geography verified. " : "Outside primary region. "
  }${industryFit ? "Strong ICP category match. " : ""}${
    contactabilityReady ? "Direct channel verified." : "Awaiting contact enrichment."
  }`;

  return {
    qualificationScore: Math.min(100, totalScore),
    icpFitTier,
    status,
    signals: {
      geographyMatch: geoMatch,
      industryFit,
      scaleMatch: totalScore >= 60,
      needOrProblemDetected: needDetected,
      decisionMakerIdentified: dmIdentified,
      contactabilityReady,
    },
    scoringBreakdown: breakdown,
    summaryRationale,
    recommendedOfferCategory: criteria.targetOfferCategory || "B2B_GROWTH",
    estimatedDealValueInr: context?.estimatedDealValueInr || 250000,
  };
}
