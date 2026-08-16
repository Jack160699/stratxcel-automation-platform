/**
 * StratXcel Google Growth & Google Business Profile (GBP) Engine.
 * Supports:
 *  A. Existing Profile: audit, review management & response drafting, photo updates, posts & events, Q&A, performance metrics.
 *  B. Missing Profile: Guided creation workflow with required business fields.
 *  C. Verification Center: Step-by-step verification experience, honest status tracking, and automation enablement upon verification.
 */

export type GoogleVerificationStatus =
  | "PENDING"
  | "USER_ACTION_REQUIRED"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "FAILED"
  | "REAUTH_REQUIRED";

export interface GoogleBusinessLocationDetails {
  locationId: string;
  businessName: string;
  primaryCategory: string;
  additionalCategories?: string[];
  address: {
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  phone: string;
  websiteUrl: string;
  regularHours?: Record<string, { open: string; close: string; isClosed?: boolean }>;
  description: string;
  services?: string[];
  photoCount: number;
  verificationStatus: GoogleVerificationStatus;
  verificationMethod?: "POSTCARD" | "PHONE_OTP" | "EMAIL_OTP" | "VIDEO_RECORDING" | "INSTANT";
  googleMapsUrl?: string;
  reviewCount: number;
  averageRating: number;
}

export interface GoogleReviewItem {
  reviewId: string;
  reviewerName: string;
  starRating: number; // 1-5
  comment: string;
  createTime: string;
  replyText?: string;
  replyTime?: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  sentimentScore: number;
  requiresEscalation: boolean;
}

export interface GooglePostDraft {
  postId?: string;
  postType: "STANDARD_UPDATE" | "OFFER" | "EVENT" | "ANNOUNCEMENT";
  summary: string;
  callToAction?: {
    actionType: "BOOK" | "ORDER" | "SHOP" | "LEARN_MORE" | "CALL";
    url?: string;
  };
  eventDetails?: {
    title: string;
    startDate: string;
    endDate: string;
  };
  offerDetails?: {
    couponCode?: string;
    redeemUrl?: string;
    terms?: string;
  };
  mediaUrl?: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED";
  scheduledFor?: string;
}

export interface GoogleGbpPerformanceMetrics {
  periodStart: string;
  periodEnd: string;
  directSearches: number;
  discoverySearches: number;
  mapsViews: number;
  searchViews: number;
  websiteClicks: number;
  directionRequests: number;
  phoneCalls: number;
}

export interface GbpCreationRequestInput {
  tenantId: string;
  businessName: string;
  primaryCategory: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  websiteUrl: string;
  description: string;
  services?: string[];
  openingHours?: Record<string, { open: string; close: string }>;
}

export interface VerificationInstructionStep {
  stepNumber: number;
  title: string;
  description: string;
  actionUrl?: string;
  importantNote?: string;
}

export interface GbpVerificationGuide {
  status: GoogleVerificationStatus;
  statusHeadline: string;
  statusExplanation: string;
  recommendedMethod: string;
  estimatedReviewTime: string;
  steps: VerificationInstructionStep[];
  whatHappensNext: string;
  automationStatus: "DISABLED_UNTIL_VERIFIED" | "ACTIVE";
}

/**
 * Evaluates the profile completeness of an existing Google Business Profile.
 */
export function auditGoogleBusinessProfile(location: GoogleBusinessLocationDetails): {
  completenessScore: number; // 0-100
  passedChecks: string[];
  actionItems: Array<{ priority: "HIGH" | "MEDIUM" | "LOW"; title: string; recommendation: string }>;
} {
  const passed: string[] = [];
  const actionItems: Array<{ priority: "HIGH" | "MEDIUM" | "LOW"; title: string; recommendation: string }> = [];

  let score = 0;

  if (location.businessName && location.businessName.length >= 3) {
    passed.push("Business name is set");
    score += 15;
  } else {
    actionItems.push({ priority: "HIGH", title: "Missing Business Name", recommendation: "Set accurate legal business name matching physical storefront." });
  }

  if (location.primaryCategory) {
    passed.push(`Primary category set to ${location.primaryCategory}`);
    score += 20;
  } else {
    actionItems.push({ priority: "HIGH", title: "Primary Category Missing", recommendation: "Select standard Google category matching your main offering." });
  }

  if (location.phone && location.phone.length >= 10) {
    passed.push("Direct phone number verified");
    score += 15;
  } else {
    actionItems.push({ priority: "HIGH", title: "Phone Number Missing", recommendation: "Add local direct phone number to enable customer call inquiries." });
  }

  if (location.websiteUrl) {
    passed.push("Website URL linked");
    score += 15;
  } else {
    actionItems.push({ priority: "MEDIUM", title: "Website URL Missing", recommendation: "Link canonical business website to improve search authority." });
  }

  if (location.description && location.description.length >= 80) {
    passed.push("Rich business description provided");
    score += 15;
  } else {
    actionItems.push({ priority: "MEDIUM", title: "Short Description", recommendation: "Write a detailed 200+ word description including local neighborhood terms." });
  }

  if (location.photoCount >= 5) {
    passed.push(`${location.photoCount} photos uploaded`);
    score += 20;
  } else {
    actionItems.push({ priority: "HIGH", title: "More Photos Required", recommendation: `Upload at least 5 high-resolution exterior, interior, and team photos (currently ${location.photoCount}).` });
  }

  return {
    completenessScore: Math.min(100, score),
    passedChecks: passed,
    actionItems,
  };
}

/**
 * Analyzes a review and drafts an AI response with sentiment and escalation classification.
 */
export function processCustomerReview(
  businessName: string,
  review: { reviewerName: string; starRating: number; comment: string },
): {
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  requiresEscalation: boolean;
  draftResponse: string;
} {
  const isNegative = review.starRating <= 2;
  const isNeutral = review.starRating === 3;
  const isPositive = review.starRating >= 4;

  let sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" = "POSITIVE";
  if (isNegative) sentiment = "NEGATIVE";
  else if (isNeutral) sentiment = "NEUTRAL";

  // Critical escalation check (mentions of legal, fraud, food poisoning, discrimination)
  const lower = review.comment.toLowerCase();
  const hasCriticalFlag = ["scam", "fraud", "police", "legal", "poisoning", "danger", "worst", "cheat"].some((w) => lower.includes(w));
  const requiresEscalation = isNegative && hasCriticalFlag;

  let draftResponse = "";
  if (isPositive) {
    draftResponse = `Thank you so much for the 5-star review, ${review.reviewerName}! We are thrilled to hear you had a great experience with ${businessName}. We look forward to serving you again soon!`;
  } else if (isNeutral) {
    draftResponse = `Hello ${review.reviewerName}, thank you for your feedback. We are always striving to improve and would love to hear how we can make your next experience at ${businessName} a 5-star one.`;
  } else {
    draftResponse = `Hello ${review.reviewerName}, we sincerely apologize that your experience did not meet expectations. At ${businessName}, customer satisfaction is our top priority. Please reach out to our team directly so we can resolve this for you immediately.`;
  }

  return {
    sentiment,
    requiresEscalation,
    draftResponse,
  };
}

/**
 * Generates a structured Google Business Profile Creation Request for a business that lacks one.
 */
export function createGoogleBusinessProfileRequest(input: GbpCreationRequestInput): {
  requestPayload: GbpCreationRequestInput;
  status: GoogleVerificationStatus;
  nextSteps: string[];
} {
  if (!input.businessName || !input.primaryCategory || !input.phone || !input.city) {
    throw new Error("Missing required fields for Google Business Profile creation (businessName, primaryCategory, phone, city)");
  }

  return {
    requestPayload: input,
    status: "USER_ACTION_REQUIRED",
    nextSteps: [
      "Submit location listing to Google My Business API",
      "Request verification method (SMS, Email, or Video)",
      "Customer completes Google verification challenge",
      "StratXcel activates autonomous local map ranking and review management",
    ],
  };
}

/**
 * Returns the guided verification center instructions based on current verification status.
 */
export function getVerificationGuide(
  status: GoogleVerificationStatus,
  businessName: string,
): GbpVerificationGuide {
  switch (status) {
    case "VERIFIED":
      return {
        status: "VERIFIED",
        statusHeadline: "Google Business Profile is Verified",
        statusExplanation: `${businessName} is fully verified on Google Maps and Search. Autonomous local growth operations are active.`,
        recommendedMethod: "N/A",
        estimatedReviewTime: "Verified",
        steps: [
          {
            stepNumber: 1,
            title: "Verification Complete",
            description: "No further action needed. StratXcel will autonomously manage updates, posts, and review replies.",
          },
        ],
        whatHappensNext: "Weekly posts, review response monitoring, and map ranking signals are running on schedule.",
        automationStatus: "ACTIVE",
      };

    case "UNDER_REVIEW":
    case "SUBMITTED":
      return {
        status: "UNDER_REVIEW",
        statusHeadline: "Verification Under Review by Google",
        statusExplanation: `Google has received verification data for ${businessName} and is currently reviewing the submission.`,
        recommendedMethod: "Google Specialist Review",
        estimatedReviewTime: "Typically 1 to 3 business days (Google controls review timing)",
        steps: [
          {
            stepNumber: 1,
            title: "Verification Submitted",
            description: "Google is validating your business details against local registry and map records.",
          },
          {
            stepNumber: 2,
            title: "StratXcel Auto-Sync",
            description: "StratXcel checks your verification status every 6 hours automatically. You will receive a WhatsApp alert as soon as Google confirms verification.",
          },
        ],
        whatHappensNext: "Once confirmed, StratXcel immediately publishes your business photos, hours, and initial welcome post.",
        automationStatus: "DISABLED_UNTIL_VERIFIED",
      };

    case "USER_ACTION_REQUIRED":
    case "PENDING":
    default:
      return {
        status: "USER_ACTION_REQUIRED",
        statusHeadline: "Google Verification Required",
        statusExplanation: `Google requires verification to prove that ${businessName} is an authentic business located at your declared address.`,
        recommendedMethod: "Phone OTP or Video Verification",
        estimatedReviewTime: "Instant to 2 business days after completing steps",
        steps: [
          {
            stepNumber: 1,
            title: "Open Google Verification",
            description: "Click 'Start Google Verification' to open your official Google My Business verification prompt.",
            actionUrl: "https://business.google.com/locations",
          },
          {
            stepNumber: 2,
            title: "Complete Google Verification Challenge",
            description: "Choose the verification method presented by Google (Phone SMS/Call OTP, Business Email, or Short Video Proof).",
            importantNote: "Make sure you have your phone or storefront visible if Google requests video recording.",
          },
          {
            stepNumber: 3,
            title: "Return to StratXcel",
            description: "After completing Google's prompt, return here. StratXcel will automatically detect the verified status.",
          },
        ],
        whatHappensNext: "Upon verification, StratXcel activates automated review alerts, map rank tracking, and weekly posts.",
        automationStatus: "DISABLED_UNTIL_VERIFIED",
      };
  }
}
