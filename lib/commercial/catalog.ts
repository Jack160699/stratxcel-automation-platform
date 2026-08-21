/**
 * Public commercial catalog — pricing pillars, integrations truth model, and
 * trust claims with inspectable evidence.
 */

export type CommercialPillarId = "audit" | "platform" | "growth_execution" | "enterprise";

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
    title: "Stratxcel Platform",
    subtitle: "Recurring software access",
    description:
      "Workspace software for Brand Brain, content workflows, lead capture, and connected reporting — activated after scope confirmation during closed beta.",
  },
  {
    id: "growth_execution",
    title: "Growth + Execution",
    subtitle: "Higher-touch operations",
    description:
      "Higher-volume content, campaign workflows, CRM follow-up, and priority execution for teams ready to run growth work inside Stratxcel.",
  },
  {
    id: "enterprise",
    title: "Custom / Enterprise",
    subtitle: "Volume & integration",
    description:
      "Quote-led plans for multi-location brands, advanced integrations, custom workflows, and dedicated account ownership.",
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
  { id: "whatsapp", name: "WhatsApp Business", category: "messaging", status: "available", note: "Staff-assisted phone bindings.", evidence: "packages/whatsapp/" },
  { id: "google_search_console", name: "Google Search Console", category: "search", status: "connected", note: "Read-only OAuth.", evidence: "packages/search-discovery/src/google/oauth.ts" },
  { id: "google_analytics", name: "Google Analytics 4", category: "search", status: "connected", note: "Read-only property access.", evidence: "packages/search-discovery/src/google/oauth.ts" },
  { id: "google_drive", name: "Google Drive", category: "storage", status: "available", evidence: "app/api/platform/storage/drive/connect/route.ts" },
  { id: "razorpay", name: "Razorpay", category: "payments", status: "connected", evidence: "packages/payments-and-wallet/" },
  { id: "meta_ads", name: "Meta Ads", category: "social", status: "coming_soon", note: "Planning workflows exist; direct connect not self-serve yet.", evidence: "workforce capabilities" },
  { id: "domain_registrar", name: "Domain registrar search", category: "search", status: "coming_soon", note: "Public registration not yet available.", evidence: "app/api/platform/domains/search/route.ts" },
];

/**
 * Public marketing copy sticks to the approved connector ecosystem (Google
 * Business Profile, Instagram, Facebook, YouTube, WhatsApp, GA4, Search
 * Console) — see AGENTS §15. LinkedIn and Threads are real, shipped
 * providers used by the authenticated app (kept in INTEGRATIONS above so
 * that stays accurate), but are not surfaced on public pages until the
 * product team explicitly expands this public-facing scope.
 */
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
  { id: "approvals", title: "Human approval for consequential work", body: "Publishing, spend, and outreach can pause for explicit approval.", evidence: "packages/approvals/" },
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
  { id: "audit", pillar: "audit", name: "Instant Business Audit", badge: "100% Free", price: "Free", period: "instant evidence-backed report", pitch: "Get an evidence-backed audit of your business, website and online presence — free.", whoItsFor: "Owners who want clarity on digital priorities and growth gaps.", scope: ["Structured review of positioning and business context", "Website health and discoverability check", "Competitor and category landscape", "Lead-channel and response-speed review", "30/60/90-day growth roadmap"], note: "100% Free audit. No payment or credit card required.", popular: false, cta: "Get Your Free Instant Audit", href: "/audit", planKey: "audit" },
  { id: "free", pillar: "platform", name: "Free", badge: "Explore", price: "₹0", period: "no card required", pitch: "Explore the workspace and prepare your growth system.", whoItsFor: "Anyone who wants to see real software before paying.", upgradePath: "Move to Starter or take the audit for a roadmap.", scope: ["1 workspace, 1 user", "Guided Brand Brain drafts", "1 Search & Discovery task (preview only)", "No published posts or campaigns yet"], note: "Free is not a paid subscription.", popular: false, cta: "Get Started", href: "/signup", planKey: "free" },
  { id: "starter", pillar: "platform", name: "Starter", badge: "Essential Growth", price: "₹4,999", period: "per month (GST included)", pitch: "Build a consistent growth engine.", whoItsFor: "Solo owners starting consistent content and lead capture.", upgradePath: "Upgrade to Growth for more volume and a website.", scope: ["Social content workflow for up to 12 posts/mo", "1 Meta ad campaign planning workflow & ad creative", "WhatsApp and CRM setup assistance", "Lead workflow for up to 100 captured leads", "Monthly summary from connected sources"], note: "Staff-assisted activation during closed beta.", popular: false, cta: "Request Starter Activation", href: "/contact?intent=starter", planKey: "starter" },
  { id: "growth", pillar: "platform", name: "Growth", badge: "Most Popular Fit", price: "₹9,999", period: "per month (GST included)", pitch: "Generate and follow up on more opportunities.", whoItsFor: "Growing businesses ready for higher volume and structured follow-up.", upgradePath: "Move to Business for priority execution.", scope: ["Everything in Starter + higher volume content workflow (25 posts/mo)", "WhatsApp and CRM follow-up workflow for up to 500 captured leads", "One controlled-scope website, confirmed during activation", "Website hosting and maintenance", "Search review and monthly reporting from connected sources"], note: "Staff-assisted activation. Domain registration & ad spend separate.", popular: true, cta: "Request Growth Activation", href: "/contact?intent=growth", planKey: "growth" },
  { id: "business", pillar: "growth_execution", name: "Business", badge: "Advanced Execution", price: "₹19,999", period: "per month (GST included)", pitch: "Run higher-volume growth execution.", whoItsFor: "Teams with active lead flow needing more campaigns and priority execution.", upgradePath: "Talk to us about Scale/Custom.", scope: ["Higher volume content workflow (50 posts/mo) & 3 Meta ad campaign workflows", "WhatsApp and CRM workflow for up to 1,500 captured leads", "Website hosting and maintenance", "Priority search review, execution, and reporting"], note: "Staff-assisted activation. Domain registration & ad spend separate.", popular: false, cta: "Request Business Activation", href: "/contact?intent=business", planKey: "business" },
  { id: "scale", pillar: "enterprise", name: "Scale / Custom", badge: "Scale & Enterprise", price: "Starting ₹34,999", period: "per month (GST included)", pitch: "Custom limits for multi-location, high-volume, or advanced execution.", whoItsFor: "Multi-location brands and high-volume teams.", scope: ["Tailored social post & premium video volume", "Custom multi-location, multi-website management", "Multi-campaign Meta & Search ad management", "Advanced WhatsApp & custom CRM workflows", "Dedicated account owner & human assistance"], note: "Custom quoted after scope review.", popular: false, cta: "Request Custom Quote", href: "/contact?intent=custom", planKey: "scale" },
];
