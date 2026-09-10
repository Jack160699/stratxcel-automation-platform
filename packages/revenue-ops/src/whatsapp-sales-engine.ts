/**
 * Human-Natural WhatsApp Sales Engine
 *
 * Emulates an experienced, polite, consultative business development assistant.
 *
 * Core Principles:
 * 1. Warm, respectful human tone — never sounds like an automated broadcast bot.
 * 2. Multi-language mastery: Hindi, Hinglish, and English.
 * 3. Understands 7 psychological conversational states:
 *    CURIOUS, INTERESTED, PRICE_FOCUSED, HESITANT, BUSY, CONFUSED, READY.
 * 4. Adaptive timing: respects Indian business hours (IST) and industry rush periods.
 * 5. Strict adherence to StratXcel Canonical Pricing rules (never invent rates).
 */

import {
  STRATXCEL_CANONICAL_OFFERS,
  validateStratXcelPricing,
  type StratXcelCanonicalOffer,
} from "../../workforce-core/src/catalogue/stratxcel-business-brain.ts";
import { BusinessDiagnosisEngine, type BusinessCategory } from "./business-diagnosis.ts";

export interface InboundSalesTurnInput {
  tenantId: string;
  leadId: string;
  conversationId?: string | null;
  inboundText: string;
  conversationHistory?: Array<{ direction: "inbound" | "outbound"; body: string; createdAt?: string }>;
  leadContext: {
    contactPhone: string;
    contactName?: string | null;
    status?: string;
    metadata?: Record<string, unknown>;
  };
  now?: Date;
}

export interface InboundSalesTurnResult {
  replyText: string;
  detectedLanguage: ConversationalLanguage;
  detectedState: ProspectPsychologicalState;
  extractedFacts: {
    businessCategory?: string;
    businessName?: string;
    hasWebsite?: boolean;
    primaryGoal?: string;
    budget?: string;
  };
  recommendedOfferKey: string;
  recommendedOfferName: string;
  startingPriceInr: number;
  opportunityStage: "NEW" | "QUALIFIED" | "ENGAGED" | "OPPORTUNITY" | "PROPOSAL" | "WON";
  nextFollowUpDelayHours: number;
  updatedLeadMetadata: Record<string, unknown>;
  updatedLeadStatus?: "NEW" | "CONTACTED" | "QUALIFIED" | "WON" | "LOST";
  confidence: "high" | "low";
}

export type ConversationalLanguage = "english" | "hindi" | "hinglish";

export type ProspectPsychologicalState =
  | "CURIOUS"
  | "INTERESTED"
  | "PRICE_FOCUSED"
  | "HESITANT"
  | "BUSY"
  | "CONFUSED"
  | "READY";

export interface IndustryTimingConstraint {
  category: string;
  rushHoursIST: Array<{ startHour: number; endHour: number; label: string }>;
  optimalHoursIST: Array<{ startHour: number; endHour: number; label: string }>;
}

export const INDUSTRY_TIMING_PROFILES: Record<string, IndustryTimingConstraint> = {
  restaurant_cafe: {
    category: "restaurant_cafe",
    rushHoursIST: [
      { startHour: 12, endHour: 15, label: "Lunch service rush" },
      { startHour: 19, endHour: 23, label: "Dinner service rush" },
    ],
    optimalHoursIST: [
      { startHour: 10, endHour: 12, label: "Morning prep window" },
      { startHour: 16, endHour: 18, label: "Late afternoon lull" },
    ],
  },
  clinic_healthcare: {
    category: "clinic_healthcare",
    rushHoursIST: [
      { startHour: 9, endHour: 13, label: "Morning OPD consultations" },
      { startHour: 18, endHour: 21, label: "Evening OPD rush" },
    ],
    optimalHoursIST: [
      { startHour: 14, endHour: 17, label: "Afternoon clinic break" },
    ],
  },
  gym_fitness: {
    category: "gym_fitness",
    rushHoursIST: [
      { startHour: 6, endHour: 9, label: "Early morning workout rush" },
      { startHour: 18, endHour: 21, label: "Peak evening workout hours" },
    ],
    optimalHoursIST: [
      { startHour: 11, endHour: 17, label: "Midday administrative window" },
    ],
  },
  retail_boutique: {
    category: "retail_boutique",
    rushHoursIST: [
      { startHour: 18, endHour: 21, label: "Evening shopping rush" },
    ],
    optimalHoursIST: [
      { startHour: 11, endHour: 14, label: "Morning retail opening" },
      { startHour: 15, endHour: 17, label: "Early afternoon quiet hours" },
    ],
  },
  optical_shop: {
    category: "optical_shop",
    rushHoursIST: [
      { startHour: 18, endHour: 21, label: "Evening eye checkup rush" },
    ],
    optimalHoursIST: [
      { startHour: 11, endHour: 14, label: "Morning optical hours" },
      { startHour: 15, endHour: 17, label: "Midday consultation window" },
    ],
  },
  industrial_manufacturing: {
    category: "industrial_manufacturing",
    rushHoursIST: [
      { startHour: 17, endHour: 19, label: "Plant shift change" },
    ],
    optimalHoursIST: [
      { startHour: 10, endHour: 13, label: "Morning procurement hours" },
      { startHour: 14, endHour: 16, label: "Post-lunch commercial review" },
    ],
  },
};

export interface WhatsAppSalesContext {
  leadId: string;
  businessName: string;
  contactName?: string;
  category: string;
  location: {
    city: string;
    area?: string;
  };
  currentState?: ProspectPsychologicalState;
  preferredLanguage?: ConversationalLanguage;
  currentOfferKey: string;
  lastInboundMessage?: string;
  messageHistoryCount?: number;
  followUpAttempt?: number;
  razorpayPaymentUrl?: string;
}

export interface GeneratedSalesMessage {
  messageText: string;
  detectedState: ProspectPsychologicalState;
  selectedLanguage: ConversationalLanguage;
  isPaymentLinkIncluded: boolean;
  nextFollowUpDelayHours: number;
  timingCompliance: {
    canSendNow: boolean;
    reason: string;
    suggestedSendTimeIso?: string;
  };
}

export class WhatsAppSalesEngine {
  /**
   * Detects conversational language from user text.
   */
  detectLanguage(text: string): ConversationalLanguage {
    if (!text || text.trim() === "") return "hinglish";
    const lower = text.toLowerCase();

    // Pure Devanagari Hindi characters
    if (/[\u0900-\u097F]/.test(text)) {
      return "hindi";
    }

    // Hinglish indicators
    const hinglishMarkers = [
      "kya", "hai", "bhai", "sir", "ji", "kitna", "kitne", "kharcha", "kaise",
      "baat", "karein", "batao", "abhi", "busy", "kal", "samajh", "aaya", "nahi",
      "accha", "namaste", "shukriya", "chahiye", "hoga", "sakte", "shuru", "pehle",
    ];
    const words = lower.split(/\s+/);
    const hasHinglish = words.some((w) => hinglishMarkers.includes(w));

    if (hasHinglish) {
      return "hinglish";
    }

    return "english";
  }

  /**
   * Detects the prospect's psychological state from their inbound message.
   */
  detectPsychologicalState(inboundText: string): ProspectPsychologicalState {
    if (!inboundText || inboundText.trim() === "") return "CURIOUS";
    const lower = inboundText.toLowerCase();

    // 1. READY: Signals intent to purchase, ask for payment details, or start
    if (
      lower.includes("payment link") ||
      lower.includes("send payment") ||
      lower.includes("ready to start") ||
      lower.includes("shuru karte hain") ||
      lower.includes("shuru karo") ||
      lower.includes("start kardo") ||
      lower.includes("link bhejo") ||
      lower.includes("qr code") ||
      lower.includes("account details") ||
      lower.includes("pay karna hai") ||
      lower.includes("let's do it") ||
      lower.includes("proceed") ||
      lower.includes("पेमेंट") ||
      lower.includes("लिंक") ||
      lower.includes("शुरू") ||
      lower.includes("क्यूआर")
    ) {
      return "READY";
    }

    // 2. BUSY: Asking to call back or follow up later
    if (
      lower.includes("busy") ||
      lower.includes("baad me") ||
      lower.includes("later") ||
      lower.includes("driving") ||
      lower.includes("meeting") ||
      lower.includes("call me later") ||
      lower.includes("kal baat") ||
      lower.includes("not now") ||
      lower.includes("thodi der me") ||
      lower.includes("travel kar raha hoon") ||
      lower.includes("व्यस्त") ||
      lower.includes("बाद में") ||
      lower.includes("कल बात")
    ) {
      return "BUSY";
    }

    // 3. PRICE_FOCUSED: Directly asking about pricing/cost/discounts
    if (
      lower.includes("kitna") ||
      lower.includes("price") ||
      lower.includes("cost") ||
      lower.includes("charges") ||
      lower.includes("fees") ||
      lower.includes("kharcha") ||
      lower.includes("rate") ||
      lower.includes("how much") ||
      lower.includes("discount") ||
      lower.includes("kam ho sakta") ||
      lower.includes("budget") ||
      lower.includes("कितना") ||
      lower.includes("खर्च") ||
      lower.includes("चार्ज") ||
      lower.includes("दाम") ||
      lower.includes("मूल्य") ||
      lower.includes("प्राइस") ||
      lower.includes("रेट")
    ) {
      return "PRICE_FOCUSED";
    }

    // 4. CONFUSED: Expressing lack of technical understanding
    if (
      lower.includes("samajh nahi") ||
      lower.includes("confused") ||
      lower.includes("kya hota hai") ||
      lower.includes("what does this mean") ||
      lower.includes("seo kya hai") ||
      lower.includes("how does it work") ||
      lower.includes("mujhe idea nahi") ||
      lower.includes("not clear") ||
      lower.includes("समझ नहीं") ||
      lower.includes("क्या होता है")
    ) {
      return "CONFUSED";
    }

    // 5. HESITANT: Expressing doubt, skepticism, or bad past experience
    if (
      lower.includes("pehle bhi karwaya") ||
      lower.includes("faida nahi") ||
      lower.includes("guarantee") ||
      lower.includes("doubt") ||
      lower.includes("fraud") ||
      lower.includes("result aayega") ||
      lower.includes("trust") ||
      lower.includes("bharosa") ||
      lower.includes("sure nahi hoon") ||
      lower.includes("thinking") ||
      lower.includes("महंगा") ||
      lower.includes("संदेह") ||
      lower.includes("शक") ||
      lower.includes("गारंटी") ||
      lower.includes("सोच")
    ) {
      return "HESITANT";
    }

    // 6. INTERESTED: Asking for details, examples, sample work, portfolio
    if (
      lower.includes("details") ||
      lower.includes("sample") ||
      lower.includes("portfolio") ||
      lower.includes("example") ||
      lower.includes("bataiye") ||
      lower.includes("interested") ||
      lower.includes("tell me more") ||
      lower.includes("kaise hoga") ||
      lower.includes("aur jaankari") ||
      lower.includes("जानकारी") ||
      lower.includes("विवरण") ||
      lower.includes("सैंपल")
    ) {
      return "INTERESTED";
    }

    // Default to CURIOUS
    return "CURIOUS";
  }

  /**
   * Checks whether the current time in IST (Indian Standard Time, UTC+5:30)
   * is acceptable for contacting the specific business vertical.
   */
  evaluateTiming(category: string, date: Date = new Date()): {
    isAllowed: boolean;
    reason: string;
    currentHourIST: number;
    suggestedSendTimeIso?: string;
  } {
    // Convert to IST
    const utcMillis = date.getTime() + date.getTimezoneOffset() * 60000;
    const istDate = new Date(utcMillis + 5.5 * 3600000);
    const hour = istDate.getHours();
    const minute = istDate.getMinutes();
    const day = istDate.getDay(); // 0 is Sunday

    // General window: 10:00 AM to 7:30 PM IST (never disturb early morning or late night)
    if (hour < 10) {
      return {
        isAllowed: false,
        reason: `Too early (Current IST: ${hour}:${minute < 10 ? "0" : ""}${minute}). Indian business outreach strictly starts after 10:00 AM IST.`,
        currentHourIST: hour,
      };
    }
    if (hour > 19 || (hour === 19 && minute > 30)) {
      return {
        isAllowed: false,
        reason: `After hours (Current IST: ${hour}:${minute < 10 ? "0" : ""}${minute}). Outreach concludes at 7:30 PM IST to respect personal evening time.`,
        currentHourIST: hour,
      };
    }

    // Specific Vertical Rush Periods
    const timingProfile = INDUSTRY_TIMING_PROFILES[category] || INDUSTRY_TIMING_PROFILES.retail_boutique;
    for (const rush of timingProfile.rushHoursIST) {
      if (hour >= rush.startHour && hour < rush.endHour) {
        return {
          isAllowed: false,
          reason: `Business rush hour detected for ${category}: ${rush.label} (${rush.startHour}:00 - ${rush.endHour}:00 IST). Avoid disturbing during peak operations.`,
          currentHourIST: hour,
        };
      }
    }

    return {
      isAllowed: true,
      reason: `Compliant with Indian commercial hours (${hour}:${minute < 10 ? "0" : ""}${minute} IST). Outside industry rush windows.`,
      currentHourIST: hour,
    };
  }

  /**
   * Generates the tailored, consultative WhatsApp response.
   */
  generateResponse(context: WhatsAppSalesContext): GeneratedSalesMessage {
    const inbound = context.lastInboundMessage ?? "";
    const lang = context.preferredLanguage ?? this.detectLanguage(inbound);
    const state = context.currentState ?? this.detectPsychologicalState(inbound);

    const timing = this.evaluateTiming(context.category);

    const offer = STRATXCEL_CANONICAL_OFFERS.find(
      (o) => o.key === context.currentOfferKey || o.id === context.currentOfferKey
    ) ?? STRATXCEL_CANONICAL_OFFERS[0]; // fallback to normal website

    let messageText = "";
    let isPaymentLinkIncluded = false;
    let nextFollowUpDelayHours = 24;

    const contactGreeting = context.contactName
      ? (lang === "english" ? `Hi ${context.contactName},` : `Namaste ${context.contactName} ji,`)
      : (lang === "english" ? `Hi there,` : `Namaste ji,`);

    const cityStr = context.location.city || "Raipur";

    switch (state) {
      case "PRICE_FOCUSED":
        nextFollowUpDelayHours = 24;
        if (lang === "hinglish") {
          messageText = `${contactGreeting} StratXcel par humara ${offer.name} bilkul transparent pricing ke saath shuru hota hai — exactly ₹${offer.startingPriceInr.toLocaleString("en-IN")}${offer.billingFrequency === "monthly" ? "/month" : ""}.\n\nIsme include hota hai:\n• ${offer.deliverables.slice(0, 3).join("\n• ")}\n\nKoi hidden charge nahi hai. Kya aap chahte hain ki hum aapke business ke liye ek live demo preview share karein?`;
        } else if (lang === "hindi") {
          messageText = `${contactGreeting} StratXcel की ${offer.name} सेवा ₹${offer.startingPriceInr.toLocaleString("en-IN")}${offer.billingFrequency === "monthly" ? "/माह" : ""} से शुरू होती है।\n\nइसमें शामिल है:\n• ${offer.deliverables.slice(0, 3).join("\n• ")}\n\nइसमें कोई छुपा हुआ शुल्क नहीं है। क्या आप इसका संक्षिप्त विवरण देखना चाहेंगे?`;
        } else {
          messageText = `${contactGreeting} For ${offer.name}, our pricing is completely transparent and starts at exactly ₹${offer.startingPriceInr.toLocaleString("en-IN")}${offer.billingFrequency === "monthly" ? "/month" : ""}.\n\nThis includes:\n• ${offer.deliverables.slice(0, 3).join("\n• ")}\n\nNo hidden fees. Would you like to review a quick preview tailored for your business in ${cityStr}?`;
        }
        break;

      case "READY":
        isPaymentLinkIncluded = true;
        nextFollowUpDelayHours = 12;
        const payUrl = context.razorpayPaymentUrl || "https://rzp.io/l/stratxcel-growth";
        if (lang === "hinglish") {
          messageText = `${contactGreeting} Bahut badhiya! Hum kaam aaj hi shuru kar sakte hain.\n\nAap is official Razorpay link se secure onboarding complete kar sakte hain:\n${payUrl}\n\nPayment hote hi hamari team aapka setup start karegi aur receipt WhatsApp par turant share ho jayegi. Dhanyawad!`;
        } else if (lang === "hindi") {
          messageText = `${contactGreeting} बहुत बढ़िया! हम आज ही कार्य आरंभ कर सकते हैं।\n\nआप इस सुरक्षित Razorpay लिंक से ऑनबोर्डिंग पूरी कर सकते हैं:\n${payUrl}\n\nभुगतान होते ही हमारी टीम सेटअप शुरू करेगी और रसीद तुरंत प्राप्त होगी।`;
        } else {
          messageText = `${contactGreeting} Excellent! We are ready to begin onboarding immediately.\n\nYou can complete the secure payment via our verified Razorpay link here:\n${payUrl}\n\nOnce completed, our engineering and marketing team begins immediate setup. Thank you!`;
        }
        break;

      case "BUSY":
        nextFollowUpDelayHours = 24;
        if (lang === "hinglish") {
          messageText = `${contactGreeting} Bilkul sir, koi issue nahi hai! Aap apna zaroori kaam pehle complete kar lijiye. Main kal shaam ko aapse ek baar contact karunga. Shubh din!`;
        } else if (lang === "hindi") {
          messageText = `${contactGreeting} बिल्कुल जी, कोई बात नहीं। आप अपना आवश्यक कार्य पूरा करें। हम कल उपयुक्त समय पर संपर्क करेंगे।`;
        } else {
          messageText = `${contactGreeting} Completely understand! Please take care of your current priorities. I will follow up with you tomorrow at a more convenient time. Have a productive day!`;
        }
        break;

      case "CONFUSED":
        nextFollowUpDelayHours = 48;
        if (lang === "hinglish") {
          messageText = `${contactGreeting} Main asaan bhasha me samjhata hoon: Jaise jab koi local customer ${cityStr} me Google par search karta hai "best ${context.category.replace(/_/g, " ")} near me", to abhi aapke competitors upar aate hain.\n\nHum bas ye ensure karte hain ki aapki shop aur contact number Google aur WhatsApp par unhe sabse pehle dikhe, jisse direct call aur inquiries aapko milein. Koi complex software seekhne ki zaroorat nahi hai.`;
        } else if (lang === "hindi") {
          messageText = `${contactGreeting} सरल शब्दों में समझें: जब ${cityStr} में कोई ग्राहक Google पर सर्च करता है, तो आपका व्यवसाय और नंबर सबसे ऊपर दिखना चाहिए ताकि ग्राहक सीधे आपको कॉल करे। आपको कोई तकनीकी काम नहीं करना होगा, सब कुछ हम संभालेंगे।`;
        } else {
          messageText = `${contactGreeting} Let me explain in simple terms: When a customer in ${cityStr} searches Google for your services, our system ensures your business appears at the top with a direct WhatsApp/Call button. You don't need any technical skills; we handle the complete setup.`;
        }
        break;

      case "HESITANT":
        nextFollowUpDelayHours = 48;
        if (lang === "hinglish") {
          messageText = `${contactGreeting} Aapka doubt bilkul sahi hai sir. Market me kaafi agencies bade waade karke deliver nahi karti hain.\n\nIsi liye StratXcel me hum long lock-in contracts nahi rakhte, aur pehle complete design preview share karte hain. Aap satisfy hone ke baad hi aage proceed kijiye. Kya main aapke competitor comparison ki 2-minute insight share karun?`;
        } else if (lang === "hindi") {
          messageText = `${contactGreeting} आपकी शंका स्वाभाविक है। कई एजेंसियां सही परिणाम नहीं देती हैं। इसलिए StratXcel में हम पहले पूरा प्रीव्यू दिखाते हैं और संतुष्ट होने पर ही कार्य आगे बढ़ता है। क्या आप 2 मिनट की संक्षिप्त रिपोर्ट देखना चाहेंगे?`;
        } else {
          messageText = `${contactGreeting} Your skepticism is completely understandable. Many providers overpromise without tangible ROI.\n\nThat is why StratXcel provides a complete preview and transparent milestone verification before any long-term commitment. Would it help if I shared a brief 2-minute local market insight for your area in ${cityStr}?`;
        }
        break;

      case "INTERESTED":
        nextFollowUpDelayHours = 24;
        if (lang === "hinglish") {
          messageText = `${contactGreeting} Khushi hui jaankar! Humne ${context.businessName} ke liye ek initial layout plan kiya hai. Isme aapki photo gallery, direct WhatsApp inquiry button, aur Google review showcase ready hai.\n\nKya hum 5 minute ke liye connect karein, ya main yahan WhatsApp par demo link share kar doon?`;
        } else if (lang === "hindi") {
          messageText = `${contactGreeting} जानकर खुशी हुई! हमने ${context.businessName} के लिए प्रारंभिक योजना तैयार की है। क्या मैं यहीं WhatsApp पर डेमो साझा करूं या आप 5 मिनट की कॉल पसंद करेंगे?`;
        } else {
          messageText = `${contactGreeting} Glad to hear that! We have prepared an initial growth plan for ${context.businessName} with direct WhatsApp inquiry capture and Google review integration.\n\nWould you prefer a quick 5-minute review call, or should I send the live preview link right here?`;
        }
        break;

      case "CURIOUS":
      default:
        nextFollowUpDelayHours = 48;
        if (lang === "hinglish") {
          messageText = `${contactGreeting} Main StratXcel se connect kar raha hoon. Humne dekha ki ${cityStr} me aapke business ki local demand kaafi achhi hai, lekin Google aur online search par aapki presence abhi thodi kam dikh rahi hai.\n\nHumne local businesses ke footfall aur calls badhane ke liye ek simple solution build kiya hai. Kya aap is par 2 minute discuss karna chahenge?`;
        } else if (lang === "hindi") {
          messageText = `${contactGreeting} मैं StratXcel से संपर्क कर रहा हूँ। ${cityStr} में आपके व्यवसाय की अच्छी मांग है, लेकिन ऑनलाइन सर्च में उपस्थिति बढ़ाई जा सकती है। क्या आप इस पर 2 मिनट चर्चा करना चाहेंगे?`;
        } else {
          messageText = `${contactGreeting} Reaching out from StratXcel. We noticed strong local demand for your services in ${cityStr}, but your business is currently missing out on top search visibility.\n\nWe build simple, direct customer acquisition setups for businesses like yours. Would you be open to a brief 2-minute look at how this works?`;
        }
        break;
    }

    return {
      messageText,
      detectedState: state,
      selectedLanguage: lang,
      isPaymentLinkIncluded,
      nextFollowUpDelayHours,
      timingCompliance: {
        canSendNow: timing.isAllowed,
        reason: timing.reason,
      },
    };
  }

  /**
   * Generates initial personalized consultative outbound message.
   */
  generateInitialOutreach(context: {
    businessName: string;
    contactName?: string;
    category: string;
    city: string;
    specificInsight: string; // e.g. "Google Maps par reviews 12 hain jabki competitors ke 60+ hain"
    language?: ConversationalLanguage;
  }): { messageText: string; language: ConversationalLanguage } {
    const lang = context.language ?? "hinglish";
    const nameGreeting = context.contactName
      ? (lang === "english" ? `Hi ${context.contactName},` : `Namaste ${context.contactName} ji,`)
      : (lang === "english" ? `Hi there,` : `Namaste ji,`);

    let messageText = "";
    if (lang === "hinglish") {
      messageText = `${nameGreeting} maine ${context.city} me aapka business "${context.businessName}" dekha.\n\nEk quick observation tha: ${context.specificInsight}.\n\nIs wajah se local customers aap tak pahunchne ke bajaye doosri jagah ja rahe hain. Humne isko fix karne ka ek simple setup banaya hai. Agar aap free hon to kya main ek chhota sa overview share karun?`;
    } else if (lang === "hindi") {
      messageText = `${nameGreeting} मैंने ${context.city} में आपके व्यवसाय "${context.businessName}" को देखा।\n\nएक महत्वपूर्ण सुझाव: ${context.specificInsight}।\n\nहमने इसे सुधारने के लिए एक सरल समाधान तैयार किया है। क्या मैं इसकी संक्षिप्त जानकारी साझा कर सकता हूँ?`;
    } else {
      messageText = `${nameGreeting} I came across "${context.businessName}" in ${context.city}.\n\nI noticed a specific growth opportunity: ${context.specificInsight}.\n\nWe help businesses in ${context.city} capture these inquiries directly via WhatsApp and Google. Would you be open to a quick 2-minute review of how this works?`;
    }

    return { messageText, language: lang };
  }

  /**
   * Autonomous Inbound Turn Processor:
   * Turns raw inbound WhatsApp inquiries into structured consultative sales turns.
   *
   * 1. Multi-language mastery (English, Hindi, Hinglish).
   * 2. 7-state psychological model.
   * 3. 17-dimension Business Diagnosis integration (no blind website pitching).
   * 4. Strict Canonical Pricing enforcement (₹3,000 / ₹5,000 / ₹10,000 / ₹3,500).
   * 5. Multi-turn memory and opportunity progression.
   */
  processInboundTurn(input: InboundSalesTurnInput): InboundSalesTurnResult {
    const rawInbound = input.inboundText || "";
    const lowerInbound = rawInbound.toLowerCase().trim();

    // 1. Read existing conversation facts from lead metadata
    const existingSalesContext = (input.leadContext.metadata?.sales_context as Record<string, unknown>) || {};
    const existingFacts = (existingSalesContext.facts as Record<string, unknown>) || {};
    const priorCategory = (existingFacts.businessCategory as string) || (input.leadContext.metadata?.industry as string);
    const priorHasWebsite = existingFacts.hasWebsite as boolean | undefined;
    const priorGoal = existingFacts.primaryGoal as string | undefined;
    const priorTurnCount = Number(existingSalesContext.turnCount ?? 0);
    const priorLanguage = (existingSalesContext.preferredLanguage as ConversationalLanguage) || undefined;

    // 2. Language Detection
    let lang: ConversationalLanguage = this.detectLanguage(rawInbound);
    // If the message is a short confirmation and prior language was set, maintain it
    if (priorLanguage && rawInbound.trim().split(/\s+/).length <= 2 && lang === "english") {
      lang = priorLanguage;
    }

    // 3. Extract Facts from Current and Past Turns
    let detectedCategory = priorCategory;
    if (
      lowerInbound.includes("gym") ||
      lowerInbound.includes("fitness") ||
      lowerInbound.includes("crossfit") ||
      lowerInbound.includes("workout") ||
      lowerInbound.includes("bodybuilding")
    ) {
      detectedCategory = "gym_fitness";
    } else if (
      lowerInbound.includes("optical") ||
      lowerInbound.includes("chashma") ||
      lowerInbound.includes("specs") ||
      lowerInbound.includes("eyewear") ||
      lowerInbound.includes("glasses")
    ) {
      detectedCategory = "optical_shop";
    } else if (
      lowerInbound.includes("clinic") ||
      lowerInbound.includes("doctor") ||
      lowerInbound.includes("dental") ||
      lowerInbound.includes("dentist") ||
      lowerInbound.includes("hospital") ||
      lowerInbound.includes("pathology") ||
      lowerInbound.includes("skin")
    ) {
      detectedCategory = "clinic_healthcare";
    } else if (
      lowerInbound.includes("restaurant") ||
      lowerInbound.includes("cafe") ||
      lowerInbound.includes("bakery") ||
      lowerInbound.includes("dhaba") ||
      lowerInbound.includes("food")
    ) {
      detectedCategory = "restaurant_cafe";
    } else if (
      lowerInbound.includes("manufacturing") ||
      lowerInbound.includes("factory") ||
      lowerInbound.includes("steel") ||
      lowerInbound.includes("engineering works") ||
      lowerInbound.includes("fabrication")
    ) {
      detectedCategory = "industrial_manufacturing";
    } else if (
      lowerInbound.includes("school") ||
      lowerInbound.includes("coaching") ||
      lowerInbound.includes("classes") ||
      lowerInbound.includes("academy") ||
      lowerInbound.includes("tuition")
    ) {
      detectedCategory = "education_coaching";
    } else if (
      lowerInbound.includes("solar") ||
      lowerInbound.includes("rooftop solar")
    ) {
      detectedCategory = "solar_clean_energy";
    } else if (
      lowerInbound.includes("boutique") ||
      lowerInbound.includes("retail") ||
      lowerInbound.includes("clothing") ||
      lowerInbound.includes("shop")
    ) {
      detectedCategory = detectedCategory ?? "retail_boutique";
    }

    // Website presence extraction
    let detectedHasWebsite = priorHasWebsite;
    if (
      lowerInbound.includes("already have a website") ||
      lowerInbound.includes("already have website") ||
      lowerInbound.includes("have a website") ||
      lowerInbound.includes("have website") ||
      lowerInbound.includes("website already") ||
      lowerInbound.includes("website hai") ||
      lowerInbound.includes("site hai") ||
      lowerInbound.includes("meri website hai") ||
      lowerInbound.includes("website bani hui hai")
    ) {
      detectedHasWebsite = true;
    } else if (
      lowerInbound.includes("no website") ||
      lowerInbound.includes("don't have a website") ||
      lowerInbound.includes("dont have website") ||
      lowerInbound.includes("website nahi hai") ||
      lowerInbound.includes("website banana hai") ||
      lowerInbound.includes("need a website")
    ) {
      detectedHasWebsite = false;
    }

    // Primary goal extraction
    let detectedGoal = priorGoal;
    if (
      lowerInbound.includes("more customers") ||
      lowerInbound.includes("more customer") ||
      lowerInbound.includes("zyada customer") ||
      lowerInbound.includes("new members") ||
      lowerInbound.includes("more members") ||
      lowerInbound.includes("footfall") ||
      lowerInbound.includes("walk-in") ||
      lowerInbound.includes("leads") ||
      lowerInbound.includes("more sales") ||
      lowerInbound.includes("admissions")
    ) {
      detectedGoal = "more_customers";
    }

    // 4. Psychological State Detection
    let state = this.detectPsychologicalState(rawInbound);
    if (
      lowerInbound.includes("expensive") ||
      lowerInbound.includes("mehenga") ||
      lowerInbound.includes("costly") ||
      lowerInbound.includes("seems high") ||
      lowerInbound.includes("महंगा")
    ) {
      state = "HESITANT";
    } else if (
      lowerInbound.includes("think about it") ||
      lowerInbound.includes("soch ke") ||
      lowerInbound.includes("kal baat") ||
      lowerInbound.includes("will let you know") ||
      lowerInbound.includes("सोच")
    ) {
      state = "BUSY";
    } else if (
      lowerInbound.includes("how much") ||
      lowerInbound.includes("kitna") ||
      lowerInbound.includes("price") ||
      lowerInbound.includes("cost") ||
      lowerInbound.includes("rate") ||
      lowerInbound.includes("charges") ||
      lowerInbound.includes("charge") ||
      lowerInbound.includes("fees") ||
      lowerInbound.includes("kharcha") ||
      lowerInbound.includes("कितना") ||
      lowerInbound.includes("खर्च") ||
      lowerInbound.includes("चार्ज") ||
      lowerInbound.includes("दाम") ||
      lowerInbound.includes("मूल्य")
    ) {
      state = "PRICE_FOCUSED";
    } else if (detectedGoal || detectedHasWebsite !== undefined) {
      if (state !== "PRICE_FOCUSED" && state !== "READY") {
        state = "INTERESTED";
      }
    }

    // 5. Business Diagnosis Engine Integration
    const diagnosisEngine = new BusinessDiagnosisEngine();
    const diagnosisReport = diagnosisEngine.diagnose({
      businessName: input.leadContext.contactName || "Local Business",
      category: (detectedCategory as BusinessCategory) || "general_smb",
      location: { city: "Raipur" },
      webPresence: detectedHasWebsite ? "good" : "none",
      leadCaptureMechanism: "whatsapp_cta",
      primaryStatedPain: detectedGoal === "more_customers" ? "Need more local customers and search visibility" : undefined,
    });

    const recommendedOffer = diagnosisReport.recommendedServices[0] || {
      offerKey: "NORMAL_WEBSITE",
      offerName: "Normal Business Website",
      startingPriceInr: 3000,
    };

    // 6. Formulate Conversational Response
    let replyText = "";
    let opportunityStage: "NEW" | "QUALIFIED" | "ENGAGED" | "OPPORTUNITY" | "PROPOSAL" | "WON" = "QUALIFIED";
    let nextDelayHours = 24;

    // Check specific conversational scenarios:
    // A. "What do you do?" or Bare Greeting
    const isWhatDoYouDo =
      lowerInbound.includes("what do you do") ||
      lowerInbound.includes("what you do") ||
      lowerInbound.includes("kya karte ho") ||
      lowerInbound.includes("kya kaam karte ho") ||
      lowerInbound.includes("who are you") ||
      lowerInbound.includes("aap log kya") ||
      lowerInbound.includes("services kya hain") ||
      lowerInbound === "hi" ||
      lowerInbound === "hello" ||
      lowerInbound === "hey" ||
      lowerInbound === "namaste" ||
      lowerInbound === "hlo" ||
      lowerInbound === "hii";

    if (isWhatDoYouDo && !detectedCategory) {
      opportunityStage = "QUALIFIED";
      nextDelayHours = 48;
      if (lang === "hindi") {
        replyText = "नमस्ते! हम व्यवसायों को वेबसाइट, गूगल मैप्स रैंकिंग, SEO और ऑनलाइन कस्टमर जनरेशन के ज़रिये ग्रो करने में मदद करते हैं। आप किस प्रकार का व्यवसाय चलाते हैं?";
      } else if (lang === "hinglish") {
        replyText = "Hey! Hum businesses ko websites, Google Maps visibility, SEO aur direct customer lead generation ke through grow karne me help karte hain. Aap kis type ka business run kar rahe hain?";
      } else {
        replyText = "Hey! We help businesses grow online through high-converting websites, Google Maps search visibility, SEO, and direct customer lead generation. What kind of business are you running?";
      }
    }
    // B. Prospect just stated their business type (e.g. "I run a gym")
    else if (
      detectedCategory &&
      detectedHasWebsite === undefined &&
      !detectedGoal &&
      state !== "PRICE_FOCUSED" &&
      state !== "READY" &&
      state !== "HESITANT" &&
      state !== "BUSY"
    ) {
      opportunityStage = "ENGAGED";
      nextDelayHours = 24;
      if (detectedCategory === "gym_fitness") {
        if (lang === "hindi") {
          replyText = "शानदार! जिम और फिटनेस स्टूडियो के लिए नए मेंबर्स मुख्य रूप से गूगल मैप्स लोकल सर्च और सोशल मीडिया ट्रायल इंक्वायरी से आते हैं। क्या आपकी वेबसाइट पहले से बनी हुई है, या आप नई शुरुआत करना चाहते हैं?";
        } else if (lang === "hinglish") {
          replyText = "Great! Gyms aur fitness studios ke liye new members usually Google Maps local search ya social media trial inquiries se aate hain. Kya aapka website pehle se bana hua hai, ya bilkul scratch se shuru karna hai?";
        } else {
          replyText = "Awesome! For gyms and fitness studios, getting new members usually comes from either Google Maps local search or targeted social ads with direct WhatsApp trial bookings. Do you already have a website, or are you looking to start from scratch?";
        }
      } else if (detectedCategory === "optical_shop") {
        if (lang === "hindi") {
          replyText = "शानदार! ऑप्टिकल शॉप्स के लिए अधिकांश ग्राहक Google Maps पर 'optical shop near me' सर्च करके आते हैं। क्या आपकी शॉप Google Maps पर लिस्टेड है, या अभी केवल वॉक-इन ग्राहक आते हैं?";
        } else if (lang === "hinglish") {
          replyText = "Great! Optical shops ke liye lagbhag 80% customers Google Maps par nearby search karke aate hain. Kya aapki shop abhi Google Maps par active hai ya majorly walk-in customers aate hain?";
        } else {
          replyText = "Great! For optical shops, almost 80% of prescription eyewear customers search locally on Google Maps before walking in. Do you currently get most customers from walk-ins, or are you already on Google Maps?";
        }
      } else {
        if (lang === "hindi") {
          replyText = `बहुत बढ़िया! इस क्षेत्र में ऑनलाइन विजिबिलिटी से काफी नए ग्राहक प्राप्त होते हैं। क्या आपका व्यवसाय पहले से ऑनलाइन या Google Maps पर सक्रिय है?`;
        } else if (lang === "hinglish") {
          replyText = `Great! Is sector me online presence aur Google search se kaafi new clients milte hain. Kya aapka business already online ya Google Maps par active hai?`;
        } else {
          replyText = `Great! There is strong local demand in this sector. Do you currently have an active website or Google Maps listing, or are you starting fresh?`;
        }
      }
    }
    // C. Prospect states they already have a website (Diagnosis in action: Never sell another website!)
    else if (
      detectedHasWebsite === true &&
      !detectedGoal &&
      state !== "PRICE_FOCUSED" &&
      state !== "READY" &&
      state !== "HESITANT" &&
      state !== "BUSY"
    ) {
      opportunityStage = "OPPORTUNITY";
      nextDelayHours = 24;
      if (detectedCategory === "gym_fitness") {
        if (lang === "hindi") {
          replyText = "समझ गया! जब आपकी वेबसाइट पहले से मौजूद है, तो दूसरी वेबसाइट बनवाना ज़रूरी नहीं है। जिम के लिए सबसे प्रभावी तरीका गूगल मैप्स (Local SEO) पर टॉप रैंकिंग और सीधे WhatsApp पर नए मेंबर्स की इंक्वायरी लाना है। अभी आपका मुख्य लक्ष्य क्या है — वॉक-इन बढ़ाना या मेंबरशिप?";
        } else if (lang === "hinglish") {
          replyText = "Samajh gaya! Agar aapki website already ready hai to doosri website banana redundant hoga. Gyms ke liye sabse bada growth lever Google Maps (Local SEO) par top aana aur direct WhatsApp par membership inquiries lana hai. Abhi aapka main focus kya hai — zyada footfall ya membership inquiries?";
        } else {
          replyText = "Got it! Since your website is already active, pitching another website would be redundant. The biggest growth lever for gyms is getting local fitness seekers to find you first on Google Maps (Local SEO) or driving direct membership inquiries to your WhatsApp. What's your biggest priority right now — more footfall, or filling specific training batches?";
        }
      } else {
        if (lang === "hindi") {
          replyText = "बिल्कुल सही! जब वेबसाइट पहले से है, तो मुख्य प्राथमिकता उस पर ट्रैफिक लाना और Google Maps पर रैंकिंग सुधारना है। अभी आपका मुख्य लक्ष्य क्या है?";
        } else if (lang === "hinglish") {
          replyText = "Got it! Website already ready hai to doosri website pitch karne ki zaroorat nahi hai. Real focus Google Maps visibility aur lead generation par hona chahiye. Abhi aapka main goal kya hai?";
        } else {
          replyText = "Understood! Since you already have a website, pitching another site would be redundant. The primary lever is driving search traffic via Google Maps and direct inquiry capture. What is your primary growth goal right now?";
        }
      }
    }
    // D. Prospect expresses goal: "I need more customers"
    else if (
      detectedGoal === "more_customers" &&
      state !== "PRICE_FOCUSED" &&
      state !== "READY" &&
      state !== "HESITANT" &&
      state !== "BUSY"
    ) {
      opportunityStage = "OPPORTUNITY";
      nextDelayHours = 24;
      if (detectedCategory === "gym_fitness") {
        if (lang === "hindi") {
          replyText = "बिल्कुल। एक सक्रिय वेबसाइट वाले जिम के लिए, हमारा Google Business / Maps Growth (₹3,000/माह से शुरू) या सोशल मीडिया मैनेजमेंट (₹3,500/30 दिन) सबसे उपयुक्त समाधान है। इससे आपके इलाके में जिम सर्च करने वाले लोग सीधे आपको WhatsApp पर संपर्क करेंगे। क्या आप इसका संक्षिप्त विवरण देखना चाहेंगे?";
        } else if (lang === "hinglish") {
          replyText = "Bilkul clear hai! Ek existing website wale gym ke liye humara Google Business / Maps Growth (₹3,000/month se start) ya Social Media Management (₹3,500/30 days) sabse best fit hai. Isse aapke local area me jo bhi fitness search karega, wo direct aapke WhatsApp par inquiry bhejega. Kya aap dekhna chahenge ki ye aapke area me kaise work karega?";
        } else {
          replyText = "Understood. For a gym with an existing website, our Google Business / Maps Growth setup (starting at ₹3,000/month) or Social Media Management (₹3,500/30 days) is the most effective path. That ensures anyone searching 'gym near me' in your area finds you at the top and messages your front desk directly. Would you like to see how that works for your location?";
        }
      } else {
        if (lang === "hindi") {
          replyText = `समझ गया। नए ग्राहकों के लिए हमारा Google Business / Maps Growth (₹3,000/माह से शुरू) स्थानीय सर्च में आपको टॉप पर लाता है। क्या आप इसका त्वरित विवरण देखना चाहेंगे?`;
        } else if (lang === "hinglish") {
          replyText = `Bilkul! Local customers badhane ke liye humara Google Business / Maps Growth setup (₹3,000/month se start) sabse effective hai. Kya aap iska 2-minute overview dekhna chahenge?`;
        } else {
          replyText = `Understood. For capturing new local customers, our Google Business / Maps Growth setup (starting at ₹3,000/month) is the most direct solution. Would you like to see how this works for your area?`;
        }
      }
    }
    // E. Price Focused: "How much?" / "Kitna kharcha hai?"
    else if (state === "PRICE_FOCUSED") {
      opportunityStage = "OPPORTUNITY";
      nextDelayHours = 24;
      if (lang === "hindi") {
        replyText = `हमारी सभी सेवाओं का मूल्य पूरी तरह पारदर्शी है:\n• Google Maps / स्थानीय सर्च ग्रोथ: ₹3,000/माह से शुरू\n• सोशल मीडिया मैनेजमेंट: ₹3,500/30 दिन (स्टैंडर्ड) या ₹5,000/30 दिन (प्रीमियम)\n• संपूर्ण SEO: ₹5,000/माह (न्यूनतम 3 महीने की प्रतिबद्धता)\n• वेबसाइट: ₹3,000 (3-5 पेज) | ₹5,000 (प्रीमियम)\n${detectedHasWebsite ? "चूंकि आपकी वेबसाइट पहले से है, ₹3,000/माह का गूगल मैप्स सेटअप सबसे कम लागत में सीधे नए ग्राहक दिलाएगा।" : "एक नई शुरुआत के लिए ₹3,000 की बिज़नेस वेबसाइट सबसे उपयुक्त रहेगी।"}\nक्या हम इसे शुरू करें?`;
      } else if (lang === "hinglish") {
        replyText = `Humari pricing bilkul transparent hai, koi hidden cost nahi:\n• Google Maps & Local SEO: Exactly ₹3,000/month se shuru\n• Social Media Management: ₹3,500/30 days (Standard) ya ₹5,000/30 days (Premium)\n• Complete SEO: ₹5,000/month (minimum 3 months commitment)\n• Websites: ₹3,000 (3-5 pages) | ₹5,000 (Premium)\n${detectedHasWebsite ? "Aapke paas already website hai, to ₹3,000/month wala Google Maps growth aapko sabse jaldi direct member inquiries lake dega." : "Starting ke liye ₹3,000 ka business website setup sabse best rahega."}\nKya hum yahan se start karein?`;
      } else {
        replyText = `Here is our transparent pricing breakdown:\n• Google Maps & Local Search Growth: Starts at ₹3,000/month\n• Social Media Management: ₹3,500/30 days (Standard) or ₹5,000/30 days (Premium)\n• Full SEO Optimization: ₹5,000/month (3-month minimum commitment)\n• Websites: ₹3,000 (Normal 3-5 pages) | ₹5,000 (Premium)\n${detectedHasWebsite ? "Since you already have a website, the Google Maps setup at ₹3,000/month will give you the highest immediate member acquisition without extra overhead." : "For a fresh online presence, our ₹3,000 business website is the ideal starting point."}\nWould you like to start with that?`;
      }
    }
    // F. Hesitant: "Seems expensive"
    else if (state === "HESITANT") {
      opportunityStage = "OPPORTUNITY";
      nextDelayHours = 48;
      if (lang === "hindi") {
        replyText = "आपकी चिंता पूरी तरह जायज है। इसीलिए StratXcel में कोई लंबा लॉक-इन अनुबंध नहीं है। ₹3,000/माह का सेटअप केवल 2-3 नए मेंबर्स आने पर ही अपनी लागत वसूल कर लेता है। आप केवल एक माह से शुरुआत करके परिणाम देख सकते हैं। क्या यह ठीक रहेगा?";
      } else if (lang === "hinglish") {
        replyText = "Aapka concern bilkul valid hai sir. Isiliye hum koi long lock-in contracts nahi rakhte. ₹3,000/month ka setup sirf 2-3 nayi gym memberships se hi easily recover ho jata hai. Aap pehle ek month try karke result dekh sakte hain. Kya kehte hain?";
      } else {
        replyText = "Completely understand! That's why we don't do long lock-in contracts or push unnecessary services. The goal of the ₹3,000/month Google Maps setup is to pay for itself with just 2-3 new memberships. We can start with a single month so you see the inquiry flow first. How does that sound?";
      }
    }
    // G. Busy / "I'll think about it"
    else if (state === "BUSY") {
      opportunityStage = "QUALIFIED";
      nextDelayHours = 72;
      if (lang === "hindi") {
        replyText = "बिल्कुल, आप आराम से विचार करें! जब भी आप नए ग्राहकों के लिए तैयार हों, आप यहीं संदेश भेज सकते हैं। आपका दिन शुभ हो!";
      } else if (lang === "hinglish") {
        replyText = "Bilkul sir, aap aaram se soch lijiye! Jab bhi aapko local inquiries badhane ke liye discuss karna ho, aap yahan message kar sakte hain. Have a great day!";
      } else {
        replyText = "Take your time, no pressure at all! Whenever you want to look into growing local inquiries for your business, just drop a message right here. Have a great day!";
      }
    }
    // H. Ready to start
    else if (state === "READY") {
      opportunityStage = "OPPORTUNITY";
      nextDelayHours = 12;
      const payUrl = "https://rzp.io/l/stratxcel-growth";
      if (lang === "hindi") {
        replyText = `बहुत बढ़िया! हम आज ही सेटअप शुरू कर सकते हैं। ऑनबोर्डिंग के लिए यह सुरक्षित भुगतान लिंक है:\n${payUrl}\n\nभुगतान पूरा होते ही कार्य आरंभ हो जाएगा और रसीद यहीं WhatsApp पर प्राप्त होगी।`;
      } else if (lang === "hinglish") {
        replyText = `Bahut badhiya! Hum kaam aaj hi shuru kar sakte hain. Aap is official Razorpay link se onboarding complete kar sakte hain:\n${payUrl}\n\nPayment hote hi hamari team setup start karegi aur receipt WhatsApp par turant share ho jayegi. Dhanyawad!`;
      } else {
        replyText = `Excellent! We can get started today. Here is the verified payment link to begin onboarding:\n${payUrl}\n\nOnce completed, our team will immediately initiate setup and share the receipt right here on WhatsApp.`;
      }
    }
    // Fallback: Helpful general consultative reply
    else {
      opportunityStage = "QUALIFIED";
      nextDelayHours = 24;
      if (lang === "hindi") {
        replyText = "StratXcel में आपका स्वागत है। हम व्यवसायों को वेबसाइट, गूगल मैप्स और ऑनलाइन लीड के ज़रिये अधिक ग्राहक दिलाने में मदद करते हैं। क्या आप अपने व्यवसाय के बारे में थोड़ी जानकारी साझा करना चाहेंगे?";
      } else if (lang === "hinglish") {
        replyText = "StratXcel me aapka swagat hai! Hum businesses ko Google Maps visibility, websites aur direct WhatsApp inquiries lake grow karte hain. Kya aap apne business ke baare me thoda batana chahenge?";
      } else {
        replyText = "Welcome to StratXcel! We help local businesses scale their customer acquisition through Google Maps ranking, fast business websites, and direct WhatsApp lead funnels. Could you share what kind of business you run?";
      }
    }

    // 7. Update Metadata for Persistence
    const updatedFacts = {
      ...existingFacts,
      businessCategory: detectedCategory,
      hasWebsite: detectedHasWebsite,
      primaryGoal: detectedGoal,
    };

    const updatedLeadMetadata: Record<string, unknown> = {
      ...(input.leadContext.metadata || {}),
      sales_context: {
        facts: updatedFacts,
        currentState: state,
        preferredLanguage: lang,
        recommendedOfferKey: recommendedOffer.offerKey,
        recommendedOfferName: recommendedOffer.offerName,
        startingPriceInr: recommendedOffer.startingPriceInr,
        opportunityStage,
        turnCount: priorTurnCount + 1,
        lastTurnAtIso: (input.now || new Date()).toISOString(),
      },
    };

    return {
      replyText,
      detectedLanguage: lang,
      detectedState: state,
      extractedFacts: {
        businessCategory: detectedCategory,
        hasWebsite: detectedHasWebsite,
        primaryGoal: detectedGoal,
      },
      recommendedOfferKey: recommendedOffer.offerKey,
      recommendedOfferName: recommendedOffer.offerName,
      startingPriceInr: recommendedOffer.startingPriceInr,
      opportunityStage,
      nextFollowUpDelayHours: nextDelayHours,
      updatedLeadMetadata,
      updatedLeadStatus: "QUALIFIED",
      confidence: "high",
    };
  }
}
