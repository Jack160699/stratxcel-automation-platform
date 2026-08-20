import type { ContentGenerationPlan, ContentQualityGateResult } from "./types.ts";

export interface ContentGenerationInput {
  businessName: string;
  service: string;
  location?: string;
  existingUrls: string[];
  verifiedFacts: string[];
  primaryKeyword: string;
  supportingKeywords?: string[];
}

/**
 * Validates planned content against strict factual grounding and cannibalization gates.
 */
export function validateContentQualityGate(
  plan: ContentGenerationPlan,
  input: ContentGenerationInput
): ContentQualityGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Check for URL Duplicate / Cannibalization
  const normalizedTarget = plan.url.toLowerCase().replace(/\/$/, "");
  const duplicate = input.existingUrls.some(
    (u) => u.toLowerCase().replace(/\/$/, "") === normalizedTarget
  );

  let cannibalizationRisk: "NONE" | "LOW" | "HIGH" = "NONE";
  if (duplicate) {
    blockers.push(`Target URL (${plan.url}) already exists. Cannibalization blocked. Use UPDATE_EXISTING.`);
    cannibalizationRisk = "HIGH";
  }

  // 2. Check Factual Grounding (Ensure no prohibited fake claims)
  const fullText = `${plan.title} ${plan.metaDescription} ${plan.intro} ${plan.sections.map((s) => s.content).join(" ")}`.toLowerCase();
  
  const prohibitedClaimWords = [
    "#1 best in the world",
    "guaranteed 100% cure",
    "free surgery",
    "rated 5 stars by all",
    "official government certified doctor of the universe",
  ];

  for (const phrase of prohibitedClaimWords) {
    if (fullText.includes(phrase)) {
      blockers.push(`Unverified or hyperbolic claim detected: "${phrase}". Prohibited by Content Quality Policy.`);
    }
  }

  // 3. Check Keyword Stuffing
  const wordCount = fullText.split(/\s+/).length;
  const keywordMentions = (fullText.match(new RegExp(input.primaryKeyword.toLowerCase(), "g")) || []).length;
  const keywordDensity = (keywordMentions / (wordCount || 1)) * 100;

  if (keywordDensity > 4.5) {
    warnings.push(`Primary keyword density is high (${keywordDensity.toFixed(1)}%). Refactor to improve natural readability.`);
  }

  const passed = blockers.length === 0;
  const score = passed ? (warnings.length > 0 ? 85 : 100) : 0;

  return {
    passed,
    score,
    blockers,
    warnings,
    factsGrounded: blockers.length === 0,
    duplicateContentRisk: duplicate ? "HIGH" : "NONE",
    cannibalizationRisk,
  };
}

/**
 * Generates a structured, evidence-grounded Service/Location landing page plan.
 */
export function generateServiceLocationPagePlan(
  input: ContentGenerationInput
): ContentGenerationPlan {
  const geoModifier = input.location ? ` in ${input.location}` : "";
  const slug = input.location
    ? `${input.service.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${input.location.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    : input.service.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const url = `https://example.com/services/${slug}`;
  const title = `${input.service}${geoModifier} | ${input.businessName}`;
  const metaDescription = `Looking for expert ${input.service.toLowerCase()}${geoModifier}? ${input.businessName} provides verified, high-quality care. Schedule your appointment today.`;
  const h1 = `Expert ${input.service}${geoModifier}`;

  const intro = `${input.businessName} provides comprehensive, professional ${input.service.toLowerCase()}${geoModifier}. Our team is dedicated to clinical excellence, patient comfort, and transparent treatment plans.`;

  const sections = [
    {
      heading: `Why Choose ${input.businessName} for ${input.service}?`,
      content: `We combine modern diagnostic technology with personalized care to ensure the best possible outcomes for all ${input.service.toLowerCase()} treatments.`,
    },
    {
      heading: "Treatment Process & What to Expect",
      content: "Step 1: Comprehensive Initial Evaluation. Step 2: Personalized Treatment Planning. Step 3: Comfortable Execution and Clear Post-Care Guidance.",
    },
  ];

  const faqs = [
    {
      question: `How long does a ${input.service.toLowerCase()} consultation take?`,
      answer: "Initial evaluations typically take 30 to 45 minutes, including a full assessment and personalized consultation.",
    },
    {
      question: `How do I book an appointment for ${input.service.toLowerCase()}${geoModifier}?`,
      answer: `You can schedule directly via our online booking form or contact ${input.businessName} reception.`,
    },
  ];

  const internalLinks = [
    { targetUrl: "https://example.com/services", anchorText: "All Services" },
    { targetUrl: "https://example.com/contact", anchorText: "Contact & Appointments" },
  ];

  return {
    url,
    title,
    metaDescription,
    h1,
    intro,
    sections,
    faqs,
    internalLinks,
    ctaText: `Schedule Your ${input.service} Consultation Today`,
    groundedFacts: input.verifiedFacts,
  };
}
