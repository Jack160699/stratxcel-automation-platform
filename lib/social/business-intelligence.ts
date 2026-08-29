/**
 * Business & Audience Content Intelligence Model (Mission G §3)
 *
 * Before writing captions or creating creatives, extracts a rich, structured
 * understanding of THIS specific business:
 * - What it actually sells (exact services/products, strongest offerings)
 * - Target audience psychology (who buys, why, worries, objections, hesitations, trust triggers)
 * - Local geographic context (neighborhood, market dynamics)
 * - Brand voice, tone, visual identity, approved claims
 * - Concrete customer problems solved
 */

export interface AudiencePsychology {
  buyerType: string;
  coreDesire: string;
  primaryWorries: string[];
  commonObjections: string[];
  hesitationTriggers: string[];
  trustTriggers: string[];
  frequentlyAskedQuestions: string[];
}

export interface BusinessOffering {
  name: string;
  description?: string;
  keyDifferentiator?: string;
  idealCustomer?: string;
}

export interface BusinessContentIntelligence {
  businessName: string;
  industry: string;
  subNiche: string;
  offerings: BusinessOffering[];
  primaryAudience: AudiencePsychology;
  secondaryAudience?: AudiencePsychology;
  localMarket: {
    location?: string;
    neighborhood?: string;
    serviceRadius?: string;
    localContextDetails: string[];
  };
  positioning: {
    tier: "accessible" | "premium" | "specialty" | "budget" | "standard";
    uniqueValueProposition: string;
    keyDifferentiators: string[];
  };
  brandVoice: {
    tones: string[];
    communicationStyle: string;
    approvedClaims: string[];
    blockedPhrases: string[];
  };
  problemsSolved: string[];
}

/**
 * Derives structured BusinessContentIntelligence from raw brandProfile + verifiedFacts.
 * Pure and deterministic: extracts real facts, avoids hallucination, and establishes
 * structured audience psychology for downstream strategy generation.
 */
export function deriveBusinessContentIntelligence(input: {
  businessName: string;
  industryText?: string | null;
  descriptionText?: string | null;
  verifiedFacts: string[];
  brandTone?: string[];
  brandColors?: string[];
  audiences?: Array<{ name?: string; description?: string }>;
  blockedPhrases?: string[];
  forbiddenClaims?: string[];
}): BusinessContentIntelligence {
  const name = input.businessName.trim() || "Business";
  const desc = input.descriptionText?.trim() || "";
  const indText = input.industryText?.trim() || "";

  // 1. Extract Offerings from verified facts and description
  const offerings: BusinessOffering[] = [];
  for (const fact of input.verifiedFacts) {
    if (fact.toLowerCase().includes("service:") || fact.toLowerCase().includes("offering:") || fact.toLowerCase().includes("product:")) {
      const parts = fact.split(":");
      const val = parts.slice(1).join(":").trim();
      if (val) offerings.push({ name: val });
    }
  }
  if (!offerings.length && desc) {
    // Extract key sentences or phrases
    const sentences = desc.split(/[.;\n]/).map((s) => s.trim()).filter((s) => s.length > 5 && s.length < 80);
    for (const s of sentences.slice(0, 3)) {
      offerings.push({ name: s });
    }
  }
  if (!offerings.length) {
    offerings.push({ name: `${name} Core Services` });
  }

  // 2. Extract Location / Local Market
  const locFact = input.verifiedFacts.find((f) => f.toLowerCase().includes("location") || f.toLowerCase().includes("address"));
  const locText = locFact ? locFact.split(":").slice(1).join(":").trim() : undefined;

  // 3. Extract Problems Solved
  const problemsSolved: string[] = [];
  for (const fact of input.verifiedFacts) {
    if (fact.toLowerCase().includes("problem") || fact.toLowerCase().includes("solution") || fact.toLowerCase().includes("benefit")) {
      problemsSolved.push(fact.split(":").slice(1).join(":").trim());
    }
  }
  if (!problemsSolved.length) {
    problemsSolved.push(`Delivering reliable, high-standard ${indText || "services"} without hassle or delays`);
    problemsSolved.push(`Providing transparent pricing and expert consultation tailored to individual needs`);
  }

  // 4. Derive Audience Psychology
  const audName = input.audiences?.[0]?.name?.trim() || "Local customers seeking reliable service";
  const primaryAudience: AudiencePsychology = {
    buyerType: audName,
    coreDesire: "Seeking proven quality, peace of mind, and transparent value without guesswork",
    primaryWorries: [
      "Hidden costs or sudden price escalations",
      "Inconsistent quality or lack of reliability",
      "Time wasted on unresponsive service",
    ],
    commonObjections: [
      "Is this worth the investment compared to cheaper alternatives?",
      "How do I know the quality will match what is advertised?",
      "How complicated is the booking or onboarding process?",
    ],
    hesitationTriggers: [
      "Lack of visible proof or customer reviews",
      "Unclear scope of work or deliverables",
      "Vague timelines",
    ],
    trustTriggers: [
      "Demonstrated expertise and behind-the-scenes craft",
      "Clear, upfront communication and transparent guarantees",
      "Local presence and verified customer outcomes",
    ],
    frequentlyAskedQuestions: [
      "How long does the service or delivery take?",
      "What is included in the initial consultation/booking?",
      "What should I prepare before getting started?",
    ],
  };

  // 5. Derive Positioning
  const isPremiumTone = (input.brandTone ?? []).some((t) => ["luxury", "premium", "sophisticated", "exclusive"].includes(t.toLowerCase()));
  const positioningTier = isPremiumTone ? "premium" : "standard";

  return {
    businessName: name,
    industry: indText || "General Business",
    subNiche: indText ? `${indText} Specialist` : "Local Service Specialist",
    offerings,
    primaryAudience,
    localMarket: {
      location: locText,
      localContextDetails: locText ? [`Serving the local ${locText} community with dedicated on-ground care`] : [],
    },
    positioning: {
      tier: positioningTier,
      uniqueValueProposition: desc || `High-standard, customer-first ${indText || "solutions"} with zero compromise on consistency.`,
      keyDifferentiators: [
        "Rigorous standard of execution",
        "Personalized client attention",
        "Transparent, upfront communication",
      ],
    },
    brandVoice: {
      tones: input.brandTone?.length ? input.brandTone : ["professional", "approachable", "authoritative"],
      communicationStyle: "Clear, grounded, and helpful — never using generic corporate jargon or exaggerated hype",
      approvedClaims: input.verifiedFacts,
      blockedPhrases: [
        "AI-powered",
        "automated",
        "data-driven",
        "end-to-end",
        "grow your business",
        "save time",
        "take your business online",
        "experience excellence",
        "elevate your experience",
        "unlock your potential",
        ...(input.blockedPhrases ?? []),
      ],
    },
    problemsSolved,
  };
}
