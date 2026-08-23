/**
 * Multilingual Normalizer & Intent Detector
 *
 * Normalizes customer messages across Hindi (Devanagari), Hinglish, and English
 * into structured intent signals with prompt injection defense.
 */

import type { InputLanguage, WebsiteGoal, VisualStyle, PrimaryCTA, TargetAudience } from "./types.ts";
import type { WebsiteType } from "../specification/schema.ts";

export interface NormalizedInputSignals {
  detectedLanguage: InputLanguage;
  inferredBusinessName?: string;
  inferredCategory?: string;
  inferredWebsiteType?: WebsiteType;
  inferredGoal?: WebsiteGoal;
  inferredStyle?: VisualStyle;
  inferredCta?: PrimaryCTA;
  inferredAudience?: TargetAudience;
  whatsappRequested: boolean;
  ecommerceRequested: boolean;
  bilingualRequested: boolean;
  sanitizedMessage: string;
  isPromptInjection: boolean;
}

export function normalizeCustomerInput(rawMessage: string): NormalizedInputSignals {
  const sanitized = (rawMessage || "").trim().slice(0, 1000);
  const lower = sanitized.toLowerCase();

  // Prompt Injection Defense
  const isPromptInjection =
    lower.includes("ignore previous instructions") ||
    lower.includes("ignore all instructions") ||
    lower.includes("reveal system prompt") ||
    lower.includes("show prompt") ||
    lower.includes("bypass safety") ||
    lower.includes("service_role") ||
    lower.includes("<script") ||
    lower.includes("javascript:");

  // 1. Language Detection
  let detectedLanguage: InputLanguage = "en";
  const hasDevanagari = /[\u0900-\u097F]/.test(sanitized);
  const hasHinglishTokens =
    lower.includes("meri ") ||
    lower.includes("mera ") ||
    lower.includes("bana do") ||
    lower.includes("chahiye") ||
    lower.includes("hona chahiye") ||
    lower.includes("ke hisaab") ||
    lower.includes("ke according") ||
    lower.includes("dukan") ||
    lower.includes("achhi ") ||
    lower.includes("hoga") ||
    lower.includes("karo");

  if (hasDevanagari) {
    detectedLanguage = "hi";
  } else if (hasHinglishTokens) {
    detectedLanguage = "hinglish";
  }

  // 2. Business Category Detection
  let inferredCategory: string | undefined;
  let inferredWebsiteType: WebsiteType = "BUSINESS_WEBSITE";

  if (
    lower.includes("clothing") ||
    lower.includes("kapde") ||
    lower.includes("कपड़े") ||
    lower.includes("fashion") ||
    lower.includes("apparel") ||
    lower.includes("boutique") ||
    lower.includes("saree") ||
    lower.includes("kurti") ||
    lower.includes("ladies fashion")
  ) {
    inferredCategory = "Fashion & Apparel";
    inferredWebsiteType = "ECOMMERCE";
  } else if (
    lower.includes("mithai") ||
    lower.includes("मिठाई") ||
    lower.includes("sweets") ||
    lower.includes("bakery") ||
    lower.includes("restaurant") ||
    lower.includes("cafe") ||
    lower.includes("food") ||
    lower.includes("dhaba")
  ) {
    inferredCategory = "Sweets, Food & Dining";
    inferredWebsiteType = "BUSINESS_WEBSITE";
  } else if (
    lower.includes("doctor") ||
    lower.includes("clinic") ||
    lower.includes("hospital") ||
    lower.includes("dental") ||
    lower.includes("dr.") ||
    lower.includes("डॉक्टर")
  ) {
    inferredCategory = "Healthcare & Clinic";
    inferredWebsiteType = "SERVICE_BUSINESS";
  } else if (
    lower.includes("coaching") ||
    lower.includes("classes") ||
    lower.includes("tuition") ||
    lower.includes("institute") ||
    lower.includes("course") ||
    lower.includes("academy")
  ) {
    inferredCategory = "Education & Coaching";
    inferredWebsiteType = "SERVICE_BUSINESS";
  } else if (
    lower.includes("traders") ||
    lower.includes("wholesale") ||
    lower.includes("distributor") ||
    lower.includes("hardware") ||
    lower.includes("supply")
  ) {
    inferredCategory = "Trading & Wholesale";
    inferredWebsiteType = "BUSINESS_WEBSITE";
  } else if (lower.includes("coffee") || lower.includes("roastery") || lower.includes("espresso")) {
    inferredCategory = "Specialty Coffee Roastery & Café";
    inferredWebsiteType = "ECOMMERCE";
  }

  // 3. Goal & CTA Signals
  const whatsappRequested =
    lower.includes("whatsapp") ||
    lower.includes("वाट्सएप") ||
    lower.includes("व्हाट्सएप") ||
    lower.includes("enquiry");

  const ecommerceRequested =
    lower.includes("online orders") ||
    lower.includes("sell products") ||
    lower.includes("shop") ||
    lower.includes("buy now") ||
    lower.includes("cart") ||
    lower.includes("payment");

  const bilingualRequested =
    lower.includes("hindi + english") ||
    lower.includes("both languages") ||
    lower.includes("dono language") ||
    lower.includes("dono");

  let inferredGoal: WebsiteGoal | undefined;
  let inferredCta: PrimaryCTA | undefined;

  if (whatsappRequested) {
    inferredGoal = "WHATSAPP_ENQUIRIES";
    inferredCta = "WHATSAPP";
  } else if (ecommerceRequested) {
    inferredGoal = "ONLINE_ORDERS";
    inferredCta = "BUY_NOW";
  } else if (inferredWebsiteType === "SERVICE_BUSINESS") {
    inferredGoal = "APPOINTMENT_BOOKINGS";
    inferredCta = "BOOK_APPOINTMENT";
  }

  // 4. Style Detection
  let inferredStyle: VisualStyle | undefined;
  if (lower.includes("premium") || lower.includes("luxury") || lower.includes("royal") || lower.includes("प्रीमियम")) {
    inferredStyle = "PREMIUM_LUXURY";
  } else if (lower.includes("modern") || lower.includes("clean") || lower.includes("sleek")) {
    inferredStyle = "MODERN_CLEAN";
  } else if (lower.includes("traditional") || lower.includes("desi") || lower.includes("indian") || lower.includes("पारंपरिक")) {
    inferredStyle = "TRADITIONAL_INDIAN";
  } else if (lower.includes("editorial") || lower.includes("minimal")) {
    inferredStyle = "EDITORIAL_MINIMAL";
  }

  // 5. Inferred Business Name
  let inferredBusinessName: string | undefined;
  const namePatterns = [
    // Found live during E2E testing: this pattern's [A-Z] is meant to require
    // the captured text look like a proper noun (a real brand name), but the
    // trailing /i flag made the whole pattern case-insensitive -- including
    // [A-Z] itself -- so it happily matched ordinary lowercase phrasing too.
    // A brief like "...growth platform for local businesses in India" matched
    // "for " + capture-until-"in", producing the literal phrase "local
    // businesses" as the inferred business name. Dropping /i restores the
    // capitalization check the [A-Z] was written to enforce.
    /(?:for|named|called)\s+([A-Z][A-Za-z0-9\s&'-]+?)(?:\s+with|\s+and|\s+in|\s*,|\.|$)/,
    /(?:my|mera|meri)\s+(?:shop|store|business|brand|clinic|restaurant|coaching|company)\s*(?:is|hai|ka naam|naam)?\s*([A-Za-z0-9\s&'-]+?)(?:\s+hai|\s+chahiye|\s+ke|\s*,|\.|$)/i,
    /business (?:is|naam|name)?\s*([A-Za-z0-9\s&'-]+?)(?:\s+hai|\s+chahiye|\s+ke|\s*,|\.|$)/i,
    /^([A-Z][a-z0-9&'-]+(?:\s+[A-Z][a-z0-9&'-]+){0,2})\s+(?:luxury|specialty|saree|apparel|clothing|store|shop|boutique|online|website|coaching|clinic|cafe|restaurant|traders)/,
  ];

  for (const pat of namePatterns) {
    const match = sanitized.match(pat);
    if (match && match[1]?.trim().length > 1) {
      const candidate = match[1].trim();
      if (!["a website", "a modern", "an online", "website", "my business", "ek achhi"].includes(candidate.toLowerCase())) {
        inferredBusinessName = candidate;
        break;
      }
    }
  }

  return {
    detectedLanguage,
    inferredBusinessName,
    inferredCategory,
    inferredWebsiteType,
    inferredGoal,
    inferredStyle,
    inferredCta,
    inferredAudience: lower.includes("young") ? "YOUNG_GEN_Z_MILLENNIALS" : lower.includes("b2b") ? "B2B_BUSINESSES" : undefined,
    whatsappRequested,
    ecommerceRequested,
    bilingualRequested,
    sanitizedMessage: sanitized,
    isPromptInjection,
  };
}
