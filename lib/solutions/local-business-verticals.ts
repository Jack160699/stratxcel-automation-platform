import type { LocalBusinessJourneyStageId } from "./journey-model.ts";
import { LOCAL_BUSINESS_JOURNEY_STAGES } from "./journey-model.ts";

export type LocalBusinessVerticalJourneyStep = {
  stageId: LocalBusinessJourneyStageId;
  focus: string;
};

export type LocalBusinessVertical = {
  slug: string;
  title: string;
  headline: string;
  description: string;
  journeySteps: readonly LocalBusinessVerticalJourneyStep[];
  published: boolean;
};

export const LOCAL_BUSINESS_VERTICALS = [
  {
    slug: "restaurants-cafes",
    title: "Restaurants & cafes",
    headline: "Fill tables with locals who are already searching.",
    description: "Local discovery, mouth-watering social proof, and fast replies to reservation enquiries.",
    journeySteps: [
      { stageId: "get-found", focus: "Optimize Google Business Profile, menu pages, and hours for local search." },
      { stageId: "get-attention", focus: "Share daily specials and ambience on social with on-brand captions." },
      { stageId: "get-enquiries", focus: "Capture table bookings, catering leads, and WhatsApp orders in one place." },
      { stageId: "follow-up", focus: "Confirm reservations and follow up on missed calls before service." },
      { stageId: "understand", focus: "Track which dishes, posts, and offers drive the most bookings." },
    ],
    published: true,
  },
  {
    slug: "salon-beauty",
    title: "Salon & beauty",
    headline: "Turn walk-bys and DMs into booked appointments.",
    description: "Show your work online, capture style enquiries, and keep follow-up personal.",
    journeySteps: [
      { stageId: "get-found", focus: "Rank for near-me searches and showcase services on a clear site." },
      { stageId: "get-attention", focus: "Post transformations and offers where your clients scroll." },
      { stageId: "get-enquiries", focus: "Route booking forms, Instagram DMs, and calls into one inbox." },
      { stageId: "follow-up", focus: "Send reminders and rebooking nudges without losing your voice." },
      { stageId: "understand", focus: "See which stylists, services, and campaigns fill the calendar." },
    ],
    published: true,
  },
  {
    slug: "clinics-healthcare",
    title: "Clinics & healthcare practices",
    headline: "Make it easy for patients to find you and book consultations.",
    description: "Clear practice information, respectful follow-up, and operational visibility—without medical outcome claims.",
    journeySteps: [
      { stageId: "get-found", focus: "Publish accurate location, services, and hours for local search." },
      { stageId: "get-attention", focus: "Share educational posts that build trust before the first visit." },
      { stageId: "get-enquiries", focus: "Capture appointment requests and general enquiries with consent in mind." },
      { stageId: "follow-up", focus: "Confirm slots and route messages to the right front-desk owner." },
      { stageId: "understand", focus: "Review enquiry sources and response times to improve access." },
    ],
    published: true,
  },
  {
    slug: "retail",
    title: "Retail stores",
    headline: "Drive footfall and recover high-intent shoppers.",
    description: "Local discovery, product highlights, and organised follow-up for store visits.",
    journeySteps: [
      { stageId: "get-found", focus: "Help shoppers find your store, hours, and collections online." },
      { stageId: "get-attention", focus: "Highlight new arrivals and promotions on social channels." },
      { stageId: "get-enquiries", focus: "Capture product questions, stock checks, and visit intents." },
      { stageId: "follow-up", focus: "Reply to WhatsApp and form leads while interest is high." },
      { stageId: "understand", focus: "Understand which categories and campaigns bring store visits." },
    ],
    published: true,
  },
  {
    slug: "real-estate",
    title: "Real estate",
    headline: "Win more site visits and buyer conversations.",
    description: "Property discovery, credible content, and disciplined lead follow-up.",
    journeySteps: [
      { stageId: "get-found", focus: "Improve project and broker visibility in local search results." },
      { stageId: "get-attention", focus: "Showcase listings and neighbourhood context on social." },
      { stageId: "get-enquiries", focus: "Capture site-visit requests, brochure downloads, and callbacks." },
      { stageId: "follow-up", focus: "Assign brokers and follow up on warm leads quickly." },
      { stageId: "understand", focus: "See which listings and channels produce qualified conversations." },
    ],
    published: true,
  },
  {
    slug: "hotels-hospitality",
    title: "Hotels & hospitality",
    headline: "Increase direct bookings and guest enquiries.",
    description: "Discovery for travellers, compelling visuals, and responsive guest communication.",
    journeySteps: [
      { stageId: "get-found", focus: "Clarify location, amenities, and booking paths on search and web." },
      { stageId: "get-attention", focus: "Share stays, events, and seasonal packages on social." },
      { stageId: "get-enquiries", focus: "Capture room enquiries, group bookings, and event leads." },
      { stageId: "follow-up", focus: "Respond to OTA redirects and WhatsApp questions promptly." },
      { stageId: "understand", focus: "Track campaigns and seasons that lift direct enquiries." },
    ],
    published: true,
  },
  {
    slug: "coaching-education",
    title: "Coaching & education",
    headline: "Grow enrolments with clearer positioning.",
    description: "Help parents and learners discover programs and start conversations.",
    journeySteps: [
      { stageId: "get-found", focus: "Rank for program and location searches with a trustworthy site." },
      { stageId: "get-attention", focus: "Share student outcomes stories and class highlights on social." },
      { stageId: "get-enquiries", focus: "Capture demo class, counselling, and brochure requests." },
      { stageId: "follow-up", focus: "Follow up on trial sign-ups and fee questions consistently." },
      { stageId: "understand", focus: "Measure which programs and channels drive enrolment interest." },
    ],
    published: true,
  },
  {
    slug: "professional-services",
    title: "Professional services",
    headline: "Turn expertise into qualified enquiries.",
    description: "Authority content, credible discovery, and organised client follow-up.",
    journeySteps: [
      { stageId: "get-found", focus: "Improve visibility for the services you actually deliver." },
      { stageId: "get-attention", focus: "Publish insights that answer client questions before they call." },
      { stageId: "get-enquiries", focus: "Capture consultation requests and scope discussions in one CRM." },
      { stageId: "follow-up", focus: "Route proposals and reminders without dropping threads." },
      { stageId: "understand", focus: "Review which topics and channels produce the best leads." },
    ],
    published: true,
  },
  {
    slug: "d2c-ecommerce",
    title: "D2C & ecommerce",
    headline: "Grow attention and recover more carts.",
    description: "Consistent content, clearer offers, and faster post-click follow-up.",
    journeySteps: [
      { stageId: "get-found", focus: "Strengthen branded search and landing pages for your hero products." },
      { stageId: "get-attention", focus: "Plan social drops and UGC-style content with approvals." },
      { stageId: "get-enquiries", focus: "Capture waitlists, offers, and high-intent form leads." },
      { stageId: "follow-up", focus: "Automate WhatsApp recovery and human handoffs where needed." },
      { stageId: "understand", focus: "See which creatives and cohorts deserve more spend." },
    ],
    published: true,
  },
  {
    slug: "local-manufacturers",
    title: "Local manufacturers",
    headline: "Win B2B enquiries from nearby buyers.",
    description: "Catalogue clarity, proof of capability, and reliable distributor follow-up.",
    journeySteps: [
      { stageId: "get-found", focus: "Make capabilities, MOQs, and locations easy to find online." },
      { stageId: "get-attention", focus: "Share plant updates, certifications, and product use cases." },
      { stageId: "get-enquiries", focus: "Capture distributor, RFQ, and sample requests centrally." },
      { stageId: "follow-up", focus: "Assign owners and follow up on open quotes quickly." },
      { stageId: "understand", focus: "Track which segments and regions respond best." },
    ],
    published: true,
  },
] as const satisfies readonly LocalBusinessVertical[];

export const PUBLISHED_LOCAL_BUSINESS_VERTICALS = LOCAL_BUSINESS_VERTICALS.filter((v) => v.published);

const stageIds = new Set(LOCAL_BUSINESS_JOURNEY_STAGES.map((s) => s.id));
for (const vertical of LOCAL_BUSINESS_VERTICALS) {
  if (vertical.journeySteps.length !== LOCAL_BUSINESS_JOURNEY_STAGES.length) {
    throw new Error(`Vertical ${vertical.slug} must define all journey steps`);
  }
  for (const step of vertical.journeySteps) {
    if (!stageIds.has(step.stageId)) {
      throw new Error(`Unknown stage ${step.stageId} on ${vertical.slug}`);
    }
  }
}

export function getLocalBusinessVerticalBySlug(slug: string) {
  return LOCAL_BUSINESS_VERTICALS.find((v) => v.slug === slug);
}

