/**
 * The same real "what does this business want help with" vocabulary
 * app/app/onboarding/steps/StepGoals.tsx's BUSINESS_GOALS already defines
 * for onboarding -- mirrored here (not imported from there) so a
 * server-only audit route never has to import a "use client" onboarding
 * component. Keep in sync with StepGoals.tsx's own key list if it ever
 * changes; this is intentionally the single other place that vocabulary
 * is allowed to exist, per Final Customer Experience Repair Section 4
 * (Audit Service Auto-Preselection) reusing the SAME real goal keys
 * rather than inventing a second, parallel services taxonomy.
 */
export interface BusinessGoalOption {
  key: string;
  title: string;
  description: string;
  icon: string;
}

export const BUSINESS_GOAL_OPTIONS: BusinessGoalOption[] = [
  { key: "local_customers", title: "Get more local customers", description: "Drive foot-traffic, walk-ins, and local nearby inquiries.", icon: "📍" },
  { key: "google_visibility", title: "Improve Google visibility", description: "Rank higher on Google Search and Google Maps local packs.", icon: "🔍" },
  { key: "whatsapp_leads", title: "Get more leads from WhatsApp", description: "Capture, qualify, and answer customer chats 24/7 automatically.", icon: "💬" },
  { key: "social_presence", title: "Stay active on social media", description: "Maintain daily high-quality publishing across Instagram, Facebook, and YouTube.", icon: "📱" },
  { key: "website_conversion", title: "Improve website performance", description: "Turn more website visitors into booked appointments and calls.", icon: "⚡" },
  { key: "lead_followup", title: "Follow up with leads automatically", description: "Never lose a customer lead with instant automated SMS/WhatsApp reminders.", icon: "🎯" },
];

export const BUSINESS_GOAL_KEYS = BUSINESS_GOAL_OPTIONS.map((g) => g.key);
