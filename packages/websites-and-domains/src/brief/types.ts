/**
 * Types & Data Contracts for the Smart Website Brief Engine
 */

import type { WebsiteType } from "../specification/schema.ts";

export type InputLanguage = "en" | "hi" | "hinglish";

export type WebsiteGoal =
  | "WHATSAPP_ENQUIRIES"
  | "ONLINE_ORDERS"
  | "PHONE_CALLS"
  | "APPOINTMENT_BOOKINGS"
  | "BRAND_TRUST"
  | "SHOWCASE_SERVICES"
  | "LEAD_GENERATION";

export type BriefVisualStyle =
  | "PREMIUM_LUXURY"
  | "MODERN_CLEAN"
  | "BOLD_ENERGETIC"
  | "TRADITIONAL_INDIAN"
  | "SIMPLE_PROFESSIONAL"
  | "EDITORIAL_MINIMAL";

export type VisualStyle = BriefVisualStyle;

export type PrimaryCTA =
  | "WHATSAPP"
  | "CALL_NOW"
  | "BUY_NOW"
  | "BOOK_APPOINTMENT"
  | "GET_QUOTE"
  | "CONTACT_US";

export type TargetAudience =
  | "LOCAL_CUSTOMERS"
  | "PREMIUM_CONNOISSEURS"
  | "B2B_BUSINESSES"
  | "FAMILIES"
  | "YOUNG_GEN_Z_MILLENNIALS"
  | "GENERAL_PUBLIC";

export interface SmartQuestionOption {
  id: string;
  label: string;
  subtext?: string;
  value: string;
}

export interface SmartQuestion {
  id: string;
  title: string;
  explanation?: string;
  fieldKey: string;
  options: SmartQuestionOption[];
  allowCustomText: boolean;
  isRequired: boolean;
  inferredDefault?: string;
}

export interface CustomerAnswer {
  questionId: string;
  selectedOptionId?: string;
  customText?: string;
}

export interface AuthorizedConnectorContext {
  brandBrain?: {
    businessName?: string;
    tagline?: string;
    industry?: string;
    brandVoice?: string;
    primaryColors?: string[];
    primaryColor?: string;
    logoUrl?: string;
    establishedYear?: number;
    story?: string;
  };
  analytics?: {
    connected: boolean;
    topPages?: Array<{ path: string; views: number }>;
    topTrafficSources?: string[];
    mobileTrafficPercentage?: number;
    topLocations?: string[];
  };
  searchConsole?: {
    connected: boolean;
    topQueries?: string[];
  };
  crm?: {
    connected: boolean;
    leadVolumeMonthly?: number;
    preferredContactChannel?: "whatsapp" | "call" | "email";
  };
  catalog?: {
    existingProducts?: Array<{ title: string; priceCents: number; category?: string }>;
    existingServices?: Array<{ title: string; priceCents?: number }>;
  };
}

export interface InferredField<T> {
  value: T;
  source: "prompt" | "connector" | "intelligence" | "inferred";
  confidence: number;
}

export interface ConfirmedField<T> {
  value: T;
  source: "customer_confirmed";
}

export type FieldOrigin<T> = InferredField<T> | ConfirmedField<T>;

export interface StructuredWebsiteBrief {
  briefId: string;
  tenantId: string;
  projectId?: string;
  detectedLanguage: InputLanguage;
  rawCustomerMessage: string;
  businessName: FieldOrigin<string>;
  businessCategory: FieldOrigin<string>;
  industry: FieldOrigin<string>;
  primaryGoal: FieldOrigin<WebsiteGoal>;
  secondaryGoals: WebsiteGoal[];
  websiteType: FieldOrigin<WebsiteType>;
  targetAudience: FieldOrigin<TargetAudience>;
  visualStyle: FieldOrigin<VisualStyle>;
  primaryCta: FieldOrigin<PrimaryCTA>;
  requiredPages: string[];
  features: {
    whatsappEnquiry: boolean;
    ecommerceShopping: boolean;
    appointmentBooking: boolean;
    aiShoppingAssistant: boolean;
    bilingualSupport: boolean;
  };
  siteLanguagePreference: "english" | "hindi" | "bilingual";
  connectorInsightsApplied: string[];
  unresolvedQuestions: SmartQuestion[];
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreGenerationSummary {
  brandName: string;
  businessType: string;
  primaryGoal: string;
  audience: string;
  visualStyle: string;
  pageList: string[];
  keyFeatures: string[];
  primaryCta: string;
  siteLanguage: string;
  connectorSignalsSummary?: string[];
}
