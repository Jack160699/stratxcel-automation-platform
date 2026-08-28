/**
 * Public commercial catalog — pricing pillars, integrations truth model, and
 * trust claims with inspectable evidence.
 */

export type CommercialPillarId = "audit" | "platform" | "growth_execution" | "websites" | "enterprise";

export interface CommercialPillar {
  id: CommercialPillarId;
  title: string;
  subtitle: string;
  description: string;
}

export const COMMERCIAL_PILLARS: CommercialPillar[] = [
  {
    id: "audit",
    title: "Instant Business Audit",
    subtitle: "Free Discovery Product",
    description:
      "An instant, evidence-backed read on positioning, discoverability, competitors, and lead paths — completely free with a written 30/60/90-day roadmap.",
  },
  {
    id: "platform",
    title: "Core Services",
    subtitle: "Targeted Growth Solutions",
    description:
      "Individual monthly services for SEO growth and premium social content execution, grounded in your Brand Brain.",
  },
  {
    id: "growth_execution",
    title: "Advanced Growth Operations",
    subtitle: "Autonomous Multi-Channel Execution",
    description:
      "Advanced SEO, Social Autopilot with strategic research, 100 image generations, and flagship Advanced Growth with WhatsApp Autopilot & free landing page.",
  },
  {
    id: "websites",
    title: "Website Products",
    subtitle: "High-Converting Digital Presence",
    description:
      "Productized landing pages, 5–6 page business websites, and tailored custom quote development.",
  },
  {
    id: "enterprise",
    title: "Custom / Specialist",
    subtitle: "Tailored Architecture",
    description:
      "Custom quotations for multi-location brands, complex integrations, and specialized website architecture.",
  },
];

export type IntegrationStatus = "connected" | "available" | "coming_soon";

export interface IntegrationEntry {
  id: string;
  name: string;
  category: "social" | "search" | "messaging" | "storage" | "payments";
  status: IntegrationStatus;
  note?: string;
  evidence: string;
}

export const INTEGRATIONS: IntegrationEntry[] = [
  { id: "google_business", name: "Google Business Profile", category: "search", status: "connected", note: "Manage profile, posts, and reviews.", evidence: "lib/social/providers/google-business.ts" },
  { id: "instagram", name: "Instagram", category: "social", status: "connected", note: "Publishing waits for approval.", evidence: "lib/social/providers/instagram.ts" },
  { id: "facebook", name: "Facebook", category: "social", status: "connected", evidence: "lib/social/providers/facebook.ts" },
  { id: "threads", name: "Threads", category: "social", status: "connected", evidence: "lib/social/providers/threads.ts" },
  { id: "linkedin", name: "LinkedIn", category: "social", status: "connected", evidence: "lib/social/providers/linkedin.ts" },
  { id: "youtube", name: "YouTube", category: "social", status: "connected", evidence: "lib/social/providers/youtube.ts" },
  { id: "whatsapp", name: "WhatsApp Business", category: "messaging", status: "available", note: "Autonomous WhatsApp reception on Advanced Growth.", evidence: "packages/whatsapp/" },
  { id: "google_search_console", name: "Google Search Console", category: "search", status: "connected", note: "Read-only OAuth.", evidence: "packages/search-discovery/src/google/oauth.ts" },
  { id: "google_analytics", name: "Google Analytics 4", category: "search", status: "connected", note: "Read-only property access.", evidence: "packages/search-discovery/src/google/oauth.ts" },
  { id: "google_drive", name: "Google Drive", category: "storage", status: "available", evidence: "app/api/platform/storage/drive/connect/route.ts" },
  { id: "razorpay", name: "Razorpay", category: "payments", status: "connected", evidence: "packages/payments-and-wallet/" },
  { id: "domain_registrar", name: "Domain registrar search", category: "search", status: "coming_soon", note: "Public registration not yet available.", evidence: "app/api/platform/domains/search/route.ts" },
];

const PUBLIC_EXCLUDED_INTEGRATION_IDS = new Set(["linkedin", "threads", "x"]);

export function getPublicIntegrations(): IntegrationEntry[] {
  return INTEGRATIONS.filter((integration) => !PUBLIC_EXCLUDED_INTEGRATION_IDS.has(integration.id));
}

export interface TrustClaim {
  id: string;
  title: string;
  body: string;
  evidence: string;
}

export const TRUST_CLAIMS: TrustClaim[] = [
  { id: "tenant_isolation", title: "Tenant isolation at the database", body: "Workspace data is separated with row-level security policies.", evidence: "app/security/page.tsx; Supabase RLS" },
  { id: "secure_sessions", title: "Secure account architecture", body: "Elevated DB access never ships to the browser; membership verified via httpOnly sessions.", evidence: "app/security/page.tsx" },
  { id: "approvals", title: "Human approval for consequential work", body: "Publishing, spend, and outreach pause for explicit approval.", evidence: "packages/approvals/" },
  { id: "audit_trail", title: "Activity evidence & audit trail", body: "Operational progress and audit intake produce inspectable workspace records.", evidence: "packages/audit/" },
  { id: "connected_permissions", title: "Connected account permissions", body: "Scoped OAuth grants govern available connector actions.", evidence: "lib/social/providers/; lib/reporting/status.ts" },
  { id: "privacy_controls", title: "Privacy & deletion controls", body: "Data deletion requests and legal routes without over-promising compliance programs.", evidence: "app/(marketing)/data-deletion/page.tsx" },
  { id: "controlled_publishing", title: "Controlled publishing", body: "Social Autopilot stays inside configured autonomy and approval policies.", evidence: "app/social-autopilot/page.tsx" },
  { id: "payment_security", title: "Payment security", body: "Checkout runs through Razorpay — card/UPI details not stored in app code.", evidence: "packages/payments-and-wallet/" },
  { id: "data_ownership", title: "Data ownership principles", body: "You remain legal owner of domain and business data.", evidence: "pricing FAQ" },
];

export interface PricingTier {
  id: string;
  pillar: CommercialPillarId;
  name: string;
  badge: string;
  price: string;
  priceCents: number | null;
  period: string;
  pitch: string;
  whoItsFor: string;
  upgradePath?: string;
  scope: string[];
  note: string;
  popular: boolean;
  cta: string;
  href: string;
  planKey?: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "audit",
    pillar: "audit",
    name: "Instant Business Audit",
    badge: "100% Free",
    price: "Free",
    priceCents: null,
    period: "instant evidence-backed report",
    pitch: "Get an evidence-backed audit of your business, website and online presence — free.",
    whoItsFor: "Owners who want clarity on digital priorities and growth gaps.",
    scope: [
      "Structured review of positioning and business context",
      "Website health and discoverability check",
      "Competitor and category landscape",
      "Lead-channel and response-speed review",
      "30/60/90-day growth roadmap",
    ],
    note: "100% Free audit. No payment or credit card required.",
    popular: false,
    cta: "Get Your Free Instant Audit",
    href: "/audit",
    planKey: "audit",
  },
  {
    id: "free",
    pillar: "platform",
    name: "Free Trial",
    badge: "Explore",
    price: "₹0",
    priceCents: 0,
    period: "no card required",
    pitch: "Experience the workspace and test our AI generation tools.",
    whoItsFor: "Anyone who wants to see real software and test AI creatives before purchasing.",
    upgradePath: "Activate SEO Growth, Social Content, or Advanced Growth when ready.",
    scope: [
      "Instant Business Audit & Growth Report",
      "3 AI image generation trial attempts/month",
      "Brand Brain profile & tone builder",
      "Workspace preview across all modules",
    ],
    note: "Free is a trial, not a full service package. Paid services activate upon subscription.",
    popular: false,
    cta: "Start Free Trial",
    href: "/signup",
    planKey: "free",
  },
  {
    id: "seo",
    pillar: "platform",
    name: "SEO Growth",
    badge: "Local Search",
    price: "₹2,999",
    priceCents: 299_900,
    period: "per month, GST included",
    pitch: "Rank higher on Google Maps and search results.",
    whoItsFor: "Businesses looking to capture local search demand and Google map rankings.",
    upgradePath: "Upgrade to Advanced SEO or Advanced Growth for deep research and blog automation.",
    scope: [
      "Audit-based SEO recommendations & continuous local optimization",
      "Google Business Profile management & ranking tracking",
      "Review monitoring and AI response drafting",
      "Monthly search visibility & performance reports",
    ],
    note: "GST included. Execution begins immediately after payment.",
    popular: false,
    cta: "Start SEO Growth",
    href: "/app/billing?plan=seo",
    planKey: "seo",
  },
  {
    id: "social",
    pillar: "platform",
    name: "Social Content",
    badge: "28 Posts/Mo",
    price: "₹3,999",
    priceCents: 399_900,
    period: "per month, GST included",
    pitch: "28 premium brand-grounded posts created, scheduled and published every month.",
    whoItsFor: "Businesses needing consistent, high-quality social media presence across Instagram & Facebook.",
    upgradePath: "Upgrade to Advanced Social for full Social Autopilot and 100 image attempts.",
    scope: [
      "28 premium posts per month across connected platforms",
      "Brand Brain grounding & zero-hallucination quality gate",
      "AI visual asset creation with brand typography and colors",
      "Automated scheduling and multi-platform publishing",
      "Festival & seasonal observance awareness",
    ],
    note: "GST included. Social Autopilot research available on Advanced Social.",
    popular: true,
    cta: "Start Social Content",
    href: "/app/billing?plan=social",
    planKey: "social",
  },
  {
    id: "advanced_seo",
    pillar: "growth_execution",
    name: "Advanced SEO",
    badge: "Strategic Search",
    price: "₹9,999",
    priceCents: 999_900,
    period: "per month, GST included",
    pitch: "Deep search intelligence, competitor gap conquest, and automated blog posting.",
    whoItsFor: "Competitive businesses ready to dominate organic Google search results.",
    upgradePath: "Combine with Advanced Social in Advanced Growth for complete automation.",
    scope: [
      "Everything in SEO Growth, plus deep competitor intelligence",
      "High-intent keyword discovery & content gap mapping",
      "SEO blog generation & automated publishing workflow",
      "Advanced AEO (AI Engine Optimization) & search citations",
    ],
    note: "GST included.",
    popular: false,
    cta: "Start Advanced SEO",
    href: "/app/billing?plan=advanced_seo",
    planKey: "advanced_seo",
  },
  {
    id: "advanced_social",
    pillar: "growth_execution",
    name: "Advanced Social",
    badge: "Social Autopilot",
    price: "₹8,499",
    priceCents: 849_900,
    period: "per month, GST included",
    pitch: "Full Social Autopilot: 28 premium posts, strategic research, and 100 image generations.",
    whoItsFor: "Brands in visual or fast-moving industries wanting full strategic autopilot.",
    upgradePath: "Move to Advanced Growth to add Advanced SEO, WhatsApp Autopilot, and a free website.",
    scope: [
      "28 premium posts/month with full Social Autopilot",
      "Strategic content planning, trend & industry research",
      "Up to 100 AI image generation attempts/month",
      "Advanced creative intelligence & visual archetype selection",
      "Approval workflows & priority automated publishing",
    ],
    note: "GST included. 100 image attempts per month with server-side quota tracking.",
    popular: false,
    cta: "Start Advanced Social",
    href: "/app/billing?plan=advanced_social",
    planKey: "advanced_social",
  },
  {
    id: "advanced_growth",
    pillar: "growth_execution",
    name: "Advanced Growth",
    badge: "Flagship Suite",
    price: "₹18,498",
    priceCents: 1_849_800,
    period: "per month, GST included",
    pitch: "The complete AI growth operations system: Advanced SEO + Advanced Social + WhatsApp Autopilot + Free Landing Page.",
    whoItsFor: "Businesses wanting complete, hands-off digital growth across search, social, messaging, and web.",
    scope: [
      "Advanced SEO: deep research, keyword discovery, blog posting",
      "Advanced Social: 28 posts, Social Autopilot, 100 image attempts",
      "WhatsApp Autopilot: autonomous 24/7 lead reception & booking",
      "FREE high-converting landing page included",
      "Dedicated growth strategy & priority execution",
    ],
    note: "GST included (₹9,999 Advanced SEO + ₹8,499 Advanced Social combined).",
    popular: true,
    cta: "Start Advanced Growth",
    href: "/app/billing?plan=advanced_growth",
    planKey: "advanced_growth",
  },
  {
    id: "website_landing_page",
    pillar: "websites",
    name: "Basic Landing Page",
    badge: "One-Time",
    price: "₹999",
    priceCents: 99_900,
    period: "one-time, GST included",
    pitch: "A standardized, high-converting productized landing page.",
    whoItsFor: "Businesses needing an immediate, fast-loading digital destination.",
    scope: [
      "Single-page high-converting conversion layout",
      "Mobile-optimized, fast loading & Brand Brain styled",
      "Lead capture form & WhatsApp click-to-chat CTA",
      "Custom domain linking support",
    ],
    note: "GST included. Free bonus on Advanced Growth subscription.",
    popular: false,
    cta: "Get Landing Page",
    href: "/app/billing?addon=landing_page",
    planKey: "website_landing_page",
  },
  {
    id: "website_standard",
    pillar: "websites",
    name: "5–6 Page Business Website",
    badge: "One-Time",
    price: "₹2,999",
    priceCents: 299_900,
    period: "one-time, GST included",
    pitch: "A complete 5–6 page business website generated and structured for your industry.",
    whoItsFor: "Established businesses wanting a complete digital presence with services, about, and contact.",
    scope: [
      "Home, About, Services, Gallery/Portfolio, FAQ & Contact pages",
      "SEO metadata, responsive layouts, and clean typography",
      "Integrated lead forms and contact channels",
      "Hosted and ready for custom domain connection",
    ],
    note: "GST included. One-time setup with zero recurring website fees.",
    popular: false,
    cta: "Get Full Website",
    href: "/app/billing?addon=website_standard",
    planKey: "website_standard",
  },
  {
    id: "website_custom",
    pillar: "enterprise",
    name: "Custom Website",
    badge: "Custom Quote",
    price: "Get a Quote",
    priceCents: null,
    period: "custom scope & quotation",
    pitch: "Tailored multi-page architectures, custom integrations, and complex business logic.",
    whoItsFor: "Brands needing specialized web applications, e-commerce, or custom workflows.",
    scope: [
      "Specialist requirements interview with dedicated agent",
      "Custom page counts, layouts, and external integrations",
      "Transparent itemized quotation and approval workflow",
      "Direct execution upon quotation acceptance",
    ],
    note: "Quoted transparently after requirements collection.",
    popular: false,
    cta: "Talk to Website Specialist",
    href: "/contact?intent=website_specialist",
    planKey: "website_custom",
  },
];
