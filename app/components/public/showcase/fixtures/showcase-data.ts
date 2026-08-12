/**
 * Deterministic, fictional demo data for public product-proof showcases.
 * Business: Northstar Coffee — clearly illustrative, never real customer PII.
 */

import type { CrmMessage } from "@/components/crm/types";
import type { InboxEntry } from "@/components/crm/types";
import type { MissionSummary } from "@/app/app/components/MissionSummaryCard";

export const DEMO_BUSINESS = {
  name: "Northstar Coffee",
  industry: "Specialty café & roastery",
  website: "northstarcoffee.example",
  location: "Indiranagar, Bengaluru",
} as const;

export const DEMO_DISCLAIMER =
  "Illustrative product interface — sample data for Northstar Coffee, a fictional business.";

const T = {
  mon0930: "2026-08-11T09:30:00.000Z",
  mon1015: "2026-08-11T10:15:00.000Z",
  mon1042: "2026-08-11T10:42:00.000Z",
  tue1402: "2026-08-12T14:02:00.000Z",
  wed1100: "2026-08-13T11:00:00.000Z",
} as const;

export const DEMO_BRAND_BRAIN = {
  business_name: DEMO_BUSINESS.name,
  industry: DEMO_BUSINESS.industry,
  website_url: `https://${DEMO_BUSINESS.website}`,
  location: DEMO_BUSINESS.location,
  positioning:
    "Single-origin pour-overs and small-batch roasts for professionals who want café quality without the commute.",
  tone_of_voice: "Warm, knowledgeable, unhurried — like a barista who remembers your order.",
  target_audience: "Remote workers and design teams within 2 km of Indiranagar 100 ft Road.",
  differentiators: [
    "Roasted in-house twice weekly",
    "Seasonal bean menu with origin cards",
    "Quiet workspace zone before noon",
  ],
  goals: [
    "Grow weekday morning footfall by 20%",
    "Launch a subscription for office deliveries",
    "Publish 3 educational posts per week",
  ],
  channels: ["Instagram", "WhatsApp", "Google Maps", "Walk-in referrals"],
};

export const DEMO_DASHBOARD = {
  attention: [
    { label: "1 approval waiting", detail: "Weekend promo carousel needs your sign-off." },
    { label: "Follow up: Priya S.", detail: "Office subscription inquiry — replied 2h ago." },
  ],
  inProgress: [
    { goal: "Draft August social calendar", state: "AWAITING_APPROVAL" as const },
    { goal: "Analyse local search visibility", state: "RUNNING" as const },
  ],
  recentDone: [
    { goal: "Brand Brain onboarding", state: "COMPLETED" as const },
    { goal: "Welcome sequence for new leads", state: "COMPLETED" as const },
  ],
  metrics: { activeMissions: 2, openLeads: 18, scheduledPosts: 4 },
};

export const DEMO_SOCIAL_POSTS = [
  {
    day: "Monday",
    format: "Reel script",
    title: "Why we cup every batch before it hits the bar",
    hook: "Most cafés never taste-test the roast you're drinking. We do — every time.",
  },
  {
    day: "Wednesday",
    format: "Carousel",
    title: "5 ways to taste notes in a pour-over",
    hook: "Start with aroma, then sip — here's what to listen for.",
  },
  {
    day: "Friday",
    format: "Story + offer",
    title: "Quiet hour: 8–10 AM workspace pass",
    hook: "First coffee on us when you book a morning slot.",
  },
];

export const DEMO_APPROVAL = {
  title: "Publish weekend promo carousel",
  platforms: "Instagram feed + story",
};

export const DEMO_SEARCH = {
  propertyUrl: `https://${DEMO_BUSINESS.website}`,
  lastAnalysis: "11 Aug 2026",
  opportunities: [
    {
      category: "Local intent",
      action: "Add structured hours and menu link to Google Business Profile",
      severity: "High",
    },
    {
      category: "Content gap",
      action: "Publish a page comparing pour-over vs espresso for beginners",
      severity: "Medium",
    },
    {
      category: "Technical",
      action: "Fix missing meta descriptions on 3 menu pages",
      severity: "Low",
    },
  ],
};

const tenantId = "demo-tenant-northstar";

function demoLead(
  id: string,
  name: string,
  status: InboxEntry["lead"]["status"],
  source: InboxEntry["lead"]["source"],
  preview: string,
  unread: number,
  at: string,
): InboxEntry {
  return {
    lead: {
      id,
      tenant_id: tenantId,
      source,
      contact_name: name,
      contact_phone: null,
      contact_email: null,
      status,
      metadata: {},
      tags: [],
      assigned_to: null,
      last_interaction_at: at,
      next_follow_up_at: null,
      notes: null,
      created_at: at,
      updated_at: at,
    },
    conversation: {
      id: `conv-${id}`,
      tenant_id: tenantId,
      lead_id: id,
      phone_binding_id: null,
      automation_mode: "automated",
      assigned_staff: null,
      status: "open",
      last_message_at: at,
      last_message_preview: preview,
      unread_count: unread,
      created_at: at,
      updated_at: at,
    },
  };
}

export const DEMO_INBOX: InboxEntry[] = [
  demoLead("lead-1", "Priya S.", "QUALIFIED", "whatsapp", "Can you deliver 20 cups every Monday?", 2, T.tue1402),
  demoLead("lead-2", "Rahul K.", "NEW", "website_form", "Interested in the quiet workspace pass", 1, T.mon1042),
  demoLead("lead-3", "Ananya M.", "CONTACTED", "whatsapp", "Thanks — I'll visit Saturday morning", 0, T.mon1015),
];

export const DEMO_THREAD: CrmMessage[] = [
  {
    id: "msg-1",
    tenant_id: tenantId,
    conversation_id: "conv-lead-1",
    lead_id: "lead-1",
    direction: "inbound",
    body: "Hi! We have a 12-person design team nearby. Can you deliver 20 cups every Monday?",
    media_ref: null,
    template_id: null,
    provider_message_id: null,
    idempotency_key: null,
    status: "delivered",
    status_updated_at: T.tue1402,
    error: null,
    created_at: T.tue1402,
  },
  {
    id: "msg-2",
    tenant_id: tenantId,
    conversation_id: "conv-lead-1",
    lead_id: "lead-1",
    direction: "outbound",
    body: "Absolutely — we offer office subscriptions with a tasting session first. Would Tuesday 10 AM work for a quick cupping?",
    media_ref: null,
    template_id: null,
    provider_message_id: null,
    idempotency_key: null,
    status: "read",
    status_updated_at: T.tue1402,
    error: null,
    created_at: T.tue1402,
  },
  {
    id: "msg-3",
    tenant_id: tenantId,
    conversation_id: "conv-lead-1",
    lead_id: "lead-1",
    direction: "inbound",
    body: "Tuesday works. Please share pricing for 20 cups/week.",
    media_ref: null,
    template_id: null,
    provider_message_id: null,
    idempotency_key: null,
    status: "delivered",
    status_updated_at: T.wed1100,
    error: null,
    created_at: T.wed1100,
  },
];

export const DEMO_MISSIONS: MissionSummary[] = [
  {
    id: "demo-m-1",
    goal_text: "Plan and draft August Instagram content calendar",
    state: "AWAITING_APPROVAL",
    service_key: "social_content",
    estimated_cost_cents: 45000,
    created_at: T.mon0930,
  },
  {
    id: "demo-m-2",
    goal_text: "Run local search analysis for northstarcoffee.example",
    state: "RUNNING",
    service_key: "search_discovery",
    estimated_cost_cents: 12000,
    created_at: T.mon0930,
  },
  {
    id: "demo-m-3",
    goal_text: "Compile Brand Brain from onboarding answers",
    state: "COMPLETED",
    service_key: "brand_brain",
    estimated_cost_cents: null,
    created_at: T.mon0930,
  },
];

export const SHOWCASE_TABS = [
  { id: "dashboard", label: "Dashboard", headline: "See your whole growth operation." },
  { id: "brand-brain", label: "Brand Brain", headline: "Your AI understands your business." },
  { id: "social", label: "Social Copilot", headline: "From idea to approved content." },
  { id: "search", label: "SEO", headline: "Know what customers search for." },
  { id: "crm", label: "CRM / WhatsApp", headline: "Never lose a lead because follow-up was missed." },
  { id: "workforce", label: "AI Workforce", headline: "Give the system an outcome, not ten disconnected tasks." },
] as const;

export type ShowcaseTabId = (typeof SHOWCASE_TABS)[number]["id"];
