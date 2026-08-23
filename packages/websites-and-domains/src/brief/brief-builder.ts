/**
 * Structured Website Brief Builder
 *
 * Compiles customer signals, answers, and connector intelligence into a validated brief,
 * explicitly distinguishing between 'inferred' and 'customer_confirmed' properties.
 */

import type {
  StructuredWebsiteBrief,
  CustomerAnswer,
  AuthorizedConnectorContext,
  PreGenerationSummary,
  WebsiteGoal,
  VisualStyle,
  PrimaryCTA,
  TargetAudience,
} from "./types.ts";
import type { NormalizedInputSignals } from "./normalizer.ts";
import { synthesizeConnectorContext } from "./connector-loader.ts";
import { planSmartQuestions } from "./question-generator.ts";
import type { WebsiteType } from "../specification/schema.ts";

export function buildStructuredWebsiteBrief(params: {
  tenantId: string;
  projectId?: string;
  signals: NormalizedInputSignals;
  answers?: CustomerAnswer[];
  connectorContext?: AuthorizedConnectorContext;
}): StructuredWebsiteBrief {
  const { tenantId, projectId, signals, answers = [], connectorContext } = params;

  const connectorSummary = synthesizeConnectorContext(connectorContext);
  const answerMap = new Map<string, string>();
  for (const a of answers) {
    answerMap.set(a.questionId, a.selectedOptionId || a.customText || "");
  }

  // 1. Business Name Resolution
  const ansName = answerMap.get("q_business_name");
  const businessName = ansName
    ? { value: ansName, source: "customer_confirmed" as const }
    : connectorContext?.brandBrain?.businessName
    ? { value: connectorContext.brandBrain.businessName, source: "connector" as const, confidence: 1.0 }
    : signals.inferredBusinessName
    ? { value: signals.inferredBusinessName, source: "prompt" as const, confidence: 0.9 }
    : { value: "Aura Boutique", source: "inferred" as const, confidence: 0.6 };

  // 2. Business Category Resolution
  const ansCategory = answerMap.get("q_category");
  const businessCategory = ansCategory
    ? { value: ansCategory, source: "customer_confirmed" as const }
    : signals.inferredCategory
    ? { value: signals.inferredCategory, source: "prompt" as const, confidence: 0.95 }
    : { value: "Fashion & Retail", source: "inferred" as const, confidence: 0.7 };

  // 3. Goal Resolution
  const ansGoal = answerMap.get("q_goal") as WebsiteGoal | undefined;
  const primaryGoal = ansGoal
    ? { value: ansGoal, source: "customer_confirmed" as const }
    : signals.inferredGoal
    ? { value: signals.inferredGoal, source: "prompt" as const, confidence: 0.9 }
    : { value: "WHATSAPP_ENQUIRIES" as WebsiteGoal, source: "inferred" as const, confidence: 0.8 };

  // 4. Visual Style Resolution
  const ansStyle = answerMap.get("q_style") as VisualStyle | undefined;
  const visualStyle = ansStyle
    ? { value: ansStyle, source: "customer_confirmed" as const }
    : signals.inferredStyle
    ? { value: signals.inferredStyle, source: "prompt" as const, confidence: 0.9 }
    : { value: "PREMIUM_LUXURY" as VisualStyle, source: "inferred" as const, confidence: 0.85 };

  // 5. Target Audience Resolution
  const ansAudience = answerMap.get("q_audience") as TargetAudience | undefined;
  const targetAudience = ansAudience
    ? { value: ansAudience, source: "customer_confirmed" as const }
    : signals.inferredAudience
    ? { value: signals.inferredAudience, source: "prompt" as const, confidence: 0.9 }
    : { value: "PREMIUM_CONNOISSEURS" as TargetAudience, source: "inferred" as const, confidence: 0.8 };

  // 6. Primary CTA Resolution
  let ctaValue: PrimaryCTA = "WHATSAPP";
  if (primaryGoal.value === "ONLINE_ORDERS") ctaValue = "BUY_NOW";
  if (primaryGoal.value === "APPOINTMENT_BOOKINGS") ctaValue = "BOOK_APPOINTMENT";
  if (primaryGoal.value === "PHONE_CALLS") ctaValue = "CALL_NOW";

  const primaryCta = { value: ctaValue, source: "inferred" as const, confidence: 0.9 };

  // 7. Pages Architecture Planning
  let websiteTypeValue: WebsiteType = signals.inferredWebsiteType || "BUSINESS_WEBSITE";
  if (primaryGoal.value === "ONLINE_ORDERS") websiteTypeValue = "ECOMMERCE";

  let requiredPages = ["Home", "About", "Contact"];
  if (websiteTypeValue === "ECOMMERCE") {
    requiredPages = ["Home", "Shop", "Product Details", "About", "Contact"];
  } else if (businessCategory.value.includes("Dining") || businessCategory.value.includes("Food")) {
    requiredPages = ["Home", "Menu", "Our Story", "Specials", "Contact"];
  } else if (businessCategory.value.includes("Healthcare") || businessCategory.value.includes("Clinic")) {
    requiredPages = ["Home", "Doctors", "Treatments", "Testimonials", "Book Appointment"];
  } else if (businessCategory.value.includes("Coaching") || businessCategory.value.includes("Education")) {
    requiredPages = ["Home", "Courses", "Faculty", "Success Stories", "Enquire Now"];
  }

  // 8. Questions calculation & completion state
  const remainingQuestions = planSmartQuestions(signals, connectorContext).filter(
    (q) => !answerMap.has(q.id)
  );

  const isComplete =
    remainingQuestions.filter((q) => q.isRequired).length === 0 || answers.length > 0;

  const siteLanguagePreference = signals.bilingualRequested
    ? "bilingual"
    : signals.detectedLanguage === "hi"
    ? "hindi"
    : "english";

  return {
    briefId: `brf_${Date.now()}`,
    tenantId,
    projectId,
    detectedLanguage: signals.detectedLanguage,
    rawCustomerMessage: signals.sanitizedMessage,
    businessName,
    businessCategory,
    industry: businessCategory,
    primaryGoal,
    secondaryGoals: [primaryGoal.value],
    websiteType: { value: websiteTypeValue, source: "inferred", confidence: 0.9 },
    targetAudience,
    visualStyle,
    primaryCta,
    requiredPages,
    features: {
      whatsappEnquiry: signals.whatsappRequested || primaryGoal.value === "WHATSAPP_ENQUIRIES",
      ecommerceShopping: websiteTypeValue === "ECOMMERCE",
      appointmentBooking: primaryGoal.value === "APPOINTMENT_BOOKINGS",
      // Found live during E2E testing: this was hardcoded true for every
      // business, so a non-ecommerce site (an SaaS platform, a clinic, a
      // consultancy) would still get "AI Shopping Concierge grounded on public
      // product data" copy promising a product catalog it doesn't have --
      // and that same always-present "Shopping" text is what made the website
      // type classifier in generation/engine.ts misdetect every request as
      // ECOMMERCE (see engine.ts's website-type detection comment). Only claim
      // a shopping assistant for businesses that actually sell products.
      aiShoppingAssistant: websiteTypeValue === "ECOMMERCE",
      bilingualSupport: signals.bilingualRequested,
    },
    siteLanguagePreference,
    connectorInsightsApplied: connectorSummary.derivedRecommendations,
    unresolvedQuestions: remainingQuestions,
    isComplete,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function formatPreGenerationSummary(brief: StructuredWebsiteBrief): PreGenerationSummary {
  return {
    brandName: brief.businessName.value,
    businessType: brief.businessCategory.value,
    primaryGoal: brief.primaryGoal.value.replace(/_/g, " "),
    audience: brief.targetAudience.value.replace(/_/g, " "),
    visualStyle: brief.visualStyle.value.replace(/_/g, " "),
    pageList: brief.requiredPages,
    keyFeatures: [
      brief.features.whatsappEnquiry ? "Direct WhatsApp Ordering / Enquiry" : "",
      brief.features.ecommerceShopping ? "Online E-Commerce Catalog & Checkout" : "",
      brief.features.aiShoppingAssistant ? "AI Shopping & Business Assistant" : "",
      brief.features.bilingualSupport ? "Hindi + English Bilingual Support" : "",
    ].filter(Boolean),
    primaryCta: brief.primaryCta.value.replace(/_/g, " "),
    siteLanguage: brief.siteLanguagePreference.toUpperCase(),
    connectorSignalsSummary: brief.connectorInsightsApplied,
  };
}
