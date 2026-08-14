"use client";

import { track } from "@vercel/analytics";

/**
 * Customer funnel events, sent through the Vercel Analytics `track()` channel
 * that already ships with <Analytics /> in app/layout.tsx. No second analytics
 * client is introduced and no page_view is sent from here — automatic page
 * views stay the sole responsibility of <Analytics /> and the GA4 tag, so
 * nothing here can double-count them.
 *
 * These events are anonymous. The allow-listed property values below are the
 * only things that may travel with an event, and `sanitize()` drops anything
 * else, so a future caller cannot leak a name, email, phone number, free-form
 * customer text, token, or payment detail by passing an extra field.
 */

export type FunnelEvent =
  | "audit_cta"
  | "audit_cta_click"
  | "hero_cta_click"
  | "explore_agent"
  | "use_case_selection"
  | "agent_demo_interaction"
  | "integration_exploration"
  | "pricing_interaction"
  | "audit_checkout_started"
  | "audit_payment_confirmed"
  | "audit_purchase"
  | "audit_intake_started"
  | "audit_business_completed"
  | "audit_deep_dive_completed"
  | "audit_goals_completed"
  | "audit_started"
  | "audit_report_ready"
  | "signup_started"
  | "signup_completed"
  | "onboarding_started"
  | "business_profile_completed"
  | "brand_brain_completed"
  | "consultation_requested"
  | "homepage_primary_cta"
  | "explore_product"
  | "view_pricing"
  | "start_audit"
  | "signup_intent"
  | "intent_selected"
  | "product_story_selected"
  | "business_type_selected";

/**
 * Properties an event may carry. Every one is a low-cardinality, non-personal
 * descriptor — where the click came from, which plan was looked at. There is
 * deliberately no field for anything a customer typed.
 */
export interface FunnelProps {
  /** Where in the product the action started, e.g. "pricing", "header". */
  surface?: string;
  /** Public plan key: audit | launch | growth | custom. Never a price. */
  plan?: string;
  /** Auth method label: "google" | "password". Never an identifier. */
  method?: string;
  /**
   * Enumerable catalogue slug the visitor picked on a public page — a customer
   * intent id, product id, or business-vertical slug. Never free-form input.
   */
  choice?: string;
}

const ALLOWED_KEYS = ["surface", "plan", "method", "choice"] as const;

/** Short, enumerable values only — a stray identifier cannot pass this. */
const SAFE_VALUE = /^[a-z0-9_-]{1,32}$/;

function sanitize(props?: FunnelProps): Record<string, string> {
  const out: Record<string, string> = {};
  if (!props) return out;
  for (const key of ALLOWED_KEYS) {
    const value = props[key];
    if (typeof value === "string" && SAFE_VALUE.test(value)) out[key] = value;
  }
  return out;
}

/**
 * Fire-and-forget. Analytics must never be able to break a customer flow, so
 * every failure — blocked script, ad blocker, server render — is swallowed.
 */
export function trackFunnel(event: FunnelEvent, props?: FunnelProps): void {
  if (typeof window === "undefined") return;
  try {
    track(event, sanitize(props));
  } catch {
    // Non-critical by design.
  }
}
