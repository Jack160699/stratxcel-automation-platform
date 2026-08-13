import { PRODUCTS } from "../product-suite/taxonomy.ts";
import type { SolutionOutcomeId } from "./outcomes.ts";

export type CustomerIntentId =
  | "more-customers"
  | "grow-on-social"
  | "found-on-google"
  | "follow-up-leads"
  | "improve-website"
  | "save-time-with-ai";

export type CustomerIntent = {
  id: CustomerIntentId;
  title: string;
  summary: string;
  outcomeId: SolutionOutcomeId;
  productIds: readonly string[];
};

export const CUSTOMER_INTENTS = [
  {
    id: "more-customers",
    title: "Get more customers",
    summary: "Capture enquiries from your site, campaigns, and WhatsApp in one pipeline.",
    outcomeId: "more-leads",
    productIds: ["crm", "whatsapp-ai", "website"],
  },
  {
    id: "grow-on-social",
    title: "Grow on social",
    summary: "Plan and publish on-brand posts with approval before anything goes live.",
    outcomeId: "grow-social",
    productIds: ["social-copilot", "content-creation", "brand-brain"],
  },
  {
    id: "found-on-google",
    title: "Get found on Google",
    summary: "Improve local search visibility and the pages people land on first.",
    outcomeId: "rank-google",
    productIds: ["seo-intelligence", "website", "analytics"],
  },
  {
    id: "follow-up-leads",
    title: "Follow up with leads",
    summary: "Reply faster on WhatsApp and keep ownership clear in your CRM.",
    outcomeId: "automate-whatsapp",
    productIds: ["whatsapp-ai", "crm", "automations"],
  },
  {
    id: "improve-website",
    title: "Improve my website",
    summary: "Make your site clearer, faster to trust, and ready for search.",
    outcomeId: "improve-website",
    productIds: ["website", "seo-intelligence", "creative-studio"],
  },
  {
    id: "save-time-with-ai",
    title: "Save time with AI",
    summary: "Hand off repeatable growth tasks to AI specialists with human approval.",
    outcomeId: "automate-work",
    productIds: ["ai-workforce", "automations", "brand-brain"],
  },
] as const satisfies readonly CustomerIntent[];

const productIds = new Set(Object.keys(PRODUCTS));
for (const intent of CUSTOMER_INTENTS) {
  for (const productId of intent.productIds) {
    if (!productIds.has(productId)) {
      throw new Error(`Unknown productId ${productId} on intent ${intent.id}`);
    }
  }
}

export function getCustomerIntentById(id: string) {
  return CUSTOMER_INTENTS.find((intent) => intent.id === id);
}
