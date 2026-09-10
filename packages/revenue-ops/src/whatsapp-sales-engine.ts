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
      lower.includes("proceed")
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
      lower.includes("travel kar raha hoon")
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
      lower.includes("budget")
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
      lower.includes("not clear")
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
      lower.includes("thinking")
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
      lower.includes("aur jaankari")
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
}
