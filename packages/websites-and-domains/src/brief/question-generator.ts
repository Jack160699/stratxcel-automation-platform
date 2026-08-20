/**
 * Dynamic Smart Question Generator & Missing-Information Detector
 *
 * Dynamically plans 0 to 5 button-selectable questions based on what information
 * is already known from customer input, Brand Brain, and connected tools.
 */

import type { SmartQuestion, AuthorizedConnectorContext } from "./types.ts";
import type { NormalizedInputSignals } from "./normalizer.ts";

export function planSmartQuestions(
  signals: NormalizedInputSignals,
  connectorContext?: AuthorizedConnectorContext
): SmartQuestion[] {
  const questions: SmartQuestion[] = [];

  const hasBusinessName = Boolean(
    signals.inferredBusinessName || connectorContext?.brandBrain?.businessName
  );
  const hasCategory = Boolean(
    signals.inferredCategory || connectorContext?.brandBrain?.industry
  );
  const hasGoal = Boolean(
    signals.inferredGoal ||
      signals.whatsappRequested ||
      (connectorContext?.catalog?.existingProducts && connectorContext.catalog.existingProducts.length > 0)
  );
  const hasStyle = Boolean(
    signals.inferredStyle ||
      (connectorContext?.brandBrain?.primaryColor && connectorContext?.brandBrain?.tagline)
  );
  const hasAudience = Boolean(
    signals.inferredAudience ||
      (connectorContext?.brandBrain?.industry && connectorContext?.analytics?.connected)
  );

  // 1. Business Name (if completely unknown)
  if (!hasBusinessName) {
    questions.push({
      id: "q_business_name",
      title: "What is your business name?",
      explanation: "Aapke business ya brand ka naam kya hai?",
      fieldKey: "businessName",
      options: [],
      allowCustomText: true,
      isRequired: true,
    });
  }

  // 2. Business Category / Offering (if unknown)
  if (!hasCategory) {
    questions.push({
      id: "q_category",
      title: "What kind of business do you run?",
      explanation: "Aapka business kis category mein aata hai?",
      fieldKey: "businessCategory",
      options: [
        { id: "opt_clothing", label: "Fashion & Clothing Shop", value: "Fashion & Apparel" },
        { id: "opt_food", label: "Restaurant / Sweets / Bakery", value: "Sweets, Food & Dining" },
        { id: "opt_clinic", label: "Doctor / Clinic / Healthcare", value: "Healthcare & Clinic" },
        { id: "opt_coaching", label: "Coaching Institute / Academy", value: "Education & Coaching" },
        { id: "opt_services", label: "Professional Services / Agency", value: "Professional Services" },
        { id: "opt_retail", label: "Retail / Wholesale Trader", value: "Trading & Wholesale" },
      ],
      allowCustomText: true,
      isRequired: true,
    });
  }

  // 3. Primary Business Goal (if unknown)
  if (!hasGoal) {
    questions.push({
      id: "q_goal",
      title: "What should your website help you achieve most?",
      explanation: "Website se aapko sabse pehle kya chahiye?",
      fieldKey: "primaryGoal",
      options: [
        { id: "opt_whatsapp", label: "Get more WhatsApp enquiries", value: "WHATSAPP_ENQUIRIES" },
        { id: "opt_orders", label: "Sell products online directly", value: "ONLINE_ORDERS" },
        { id: "opt_calls", label: "Get direct phone calls", value: "PHONE_CALLS" },
        { id: "opt_bookings", label: "Book appointments / consultations", value: "APPOINTMENT_BOOKINGS" },
        { id: "opt_trust", label: "Build strong brand trust", value: "BRAND_TRUST" },
      ],
      allowCustomText: true,
      isRequired: true,
      inferredDefault: signals.whatsappRequested ? "WHATSAPP_ENQUIRIES" : undefined,
    });
  }

  // 4. Visual Style & Aesthetic (if unknown)
  if (!hasStyle) {
    questions.push({
      id: "q_style",
      title: "Which visual style do you prefer?",
      explanation: "Aapko website ka look aur feel kaisa chahiye?",
      fieldKey: "visualStyle",
      options: [
        { id: "opt_luxury", label: "Premium & Luxury (Dark + Gold accents)", value: "PREMIUM_LUXURY" },
        { id: "opt_modern", label: "Modern & Clean (Minimalist + Fresh)", value: "MODERN_CLEAN" },
        { id: "opt_desi", label: "Traditional & Indian (Warm & Rich)", value: "TRADITIONAL_INDIAN" },
        { id: "opt_professional", label: "Simple & Professional (Corporate)", value: "SIMPLE_PROFESSIONAL" },
      ],
      allowCustomText: true,
      isRequired: true,
      inferredDefault: "PREMIUM_LUXURY",
    });
  }

  // 5. Target Audience (if unknown and < 5 questions)
  if (!hasAudience && questions.length < 5) {
    questions.push({
      id: "q_audience",
      title: "Who is your primary customer base?",
      explanation: "Aapke main customers kaun hain?",
      fieldKey: "targetAudience",
      options: [
        { id: "opt_premium_buyers", label: "Premium / Luxury Buyers", value: "PREMIUM_CONNOISSEURS" },
        { id: "opt_youth", label: "Young Shoppers (Gen Z & Millennials)", value: "YOUNG_GEN_Z_MILLENNIALS" },
        { id: "opt_local", label: "Local neighborhood customers", value: "LOCAL_CUSTOMERS" },
        { id: "opt_b2b", label: "Businesses / Bulk Traders (B2B)", value: "B2B_BUSINESSES" },
        { id: "opt_all", label: "General Public & Families", value: "GENERAL_PUBLIC" },
      ],
      allowCustomText: true,
      isRequired: false,
      inferredDefault: "PREMIUM_CONNOISSEURS",
    });
  }

  // Cap strictly at 5 questions maximum
  return questions.slice(0, 5);
}
