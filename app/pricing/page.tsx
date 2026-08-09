import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";
import { whatsappHref } from "@/lib/constants";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing & Plans — Stratxcel Business AI Operating System",
  description:
    "Transparent monthly pricing and AI Business Growth Audit for Stratxcel. Growth systems, WhatsApp CRM, Meta campaign workflows, and controlled websites.",
};

/**
 * The customer-facing plans (one-time Audit plus the Notion v1 subscription
 * catalog: Free, Starter, Growth, Business, Scale/Custom). Only
 * Starter/Growth/Business are self-service checkout; Free and Scale are not.
 * app/app/onboarding/types.ts mirrors these keys and names so the wizard's
 * plan step and this page can never present two different vocabularies.
 */
const tiers = [
  {
    id: "audit",
    name: "Audit",
    badge: "Start Here",
    price: "₹999",
    period: "one-time (GST included)",
    pitch: "An evidence-based read on where your growth is actually leaking.",
    scope: [
      "AI review of your brand positioning and Brand Brain",
      "Website health and discoverability check",
      "Competitor and category landscape",
      "Lead-channel and response-speed review",
      "30/60/90-day growth roadmap",
    ],
    note: "A one-time audit. No subscription starts from this.",
    popular: false,
    cta: "Start Your Audit",
    href: "/audit",
  },
  {
    id: "free",
    name: "Free",
    badge: "Explore",
    price: "₹0",
    period: "no card required",
    pitch: "Explore the workspace and prepare your growth system.",
    scope: [
      "1 workspace, 1 user",
      "AI drafts to explore Brand Brain",
      "1 Search & Discovery task (preview only)",
      "No published posts or campaigns yet",
    ],
    note: "Free is not a paid subscription — no card required.",
    popular: false,
    cta: "Start Free",
    href: "/signup",
  },
  {
    id: "starter",
    name: "Starter",
    badge: "Essential Growth",
    price: "₹4,999",
    period: "per month (GST included)",
    pitch: "A complete entry system for one small or local business.",
    scope: [
      "Social media content creation & posting (12 posts/mo)",
      "1 Meta ad campaign workflow & ad creative",
      "WhatsApp connection & inbox dashboard",
      "Basic CRM lead capture & follow-up (up to 100 AI-handled leads)",
      "Monthly performance reporting",
    ],
    note: "Prices include GST. Ad spend & third-party software separate.",
    popular: false,
    cta: "Start Starter Plan",
    href: "/signup",
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Most Popular Fit",
    price: "₹9,999",
    period: "per month (GST included)",
    pitch: "The serious SMB plan for recurring execution and follow-up.",
    scope: [
      "Everything in Starter + higher volume content (25 posts/mo)",
      "Complete WhatsApp + CRM automated follow-up flows (up to 500 AI-handled leads)",
      "1st Website included (controlled template scope)",
      "Website hosting & maintenance included",
      "Search & Discovery + monthly growth reporting",
    ],
    note: "Prices include GST. Domain registration & ad spend separate.",
    popular: true,
    cta: "Get Started with Growth",
    href: "/signup",
  },
  {
    id: "business",
    name: "Business",
    badge: "Advanced Execution",
    price: "₹19,999",
    period: "per month (GST included)",
    pitch: "Advanced Search, CRM, publishing, ads support, and priority execution.",
    scope: [
      "Higher volume content (50 posts/mo) & 3 Meta ad campaign workflows",
      "Advanced WhatsApp + CRM automation (up to 1,500 AI-handled leads)",
      "Website hosting & maintenance included",
      "Advanced Search & Discovery, priority execution & reporting",
    ],
    note: "Prices include GST. Domain registration & ad spend separate.",
    popular: false,
    cta: "Get Started with Business",
    href: "/signup",
  },
  {
    id: "scale",
    name: "Scale / Custom",
    badge: "Scale & Enterprise",
    price: "Starting ₹34,999",
    period: "per month (GST included)",
    pitch: "Custom limits for multi-location, high-volume, or advanced execution.",
    scope: [
      "Tailored social post & premium video volume",
      "Custom multi-location, multi-website management",
      "Multi-campaign Meta & Search ad management",
      "Advanced WhatsApp & custom CRM workflows",
      "Dedicated account owner & human assistance",
    ],
    note: "Custom quoted to fit complex business needs. Not available through self-service checkout.",
    popular: false,
    cta: "Request Custom Quote",
    href: "/contact?intent=custom",
  },
];

const faq = [
  {
    q: "How does the AI Business Audit work?",
    a: "When you sign in and start your audit, our AI engine indexes your Brand Brain, analyzes your public channels, reviews lead response speeds, and builds a customized 30/60/90-day roadmap.",
  },
  {
    q: "Are ad spend and domain names included in the monthly price?",
    a: "Subscription prices cover our full AI operating system, content creation, ad workflows, CRM, and website maintenance. Direct ad spend paid to Meta/Google and domain registration remain separate.",
  },
  {
    q: "Who owns our website domain?",
    a: "You are always the legal beneficial owner of your domain name. Stratxcel registers and configures DNS under your legal registrant details.",
  },
  {
    q: "Can we upgrade or adjust our plan as we scale?",
    a: "Yes! You can start with Starter and upgrade to Growth or Business at any time as your content volume and ad workflow needs expand. Scale / Custom is quote-led for larger, multi-location needs.",
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">
              Pricing & Plans
            </span>
            <h1 className="mt-2 font-sx-sans text-3xl sm:text-5xl font-extrabold tracking-tight text-sx-text">
              Choose the Operating System Your Growth Needs
            </h1>
            <p className="mt-3 font-sx-sans text-base text-sx-text-muted">
              Transparent monthly plans, full GST-inclusive pricing, and zero seats math.
            </p>
          </div>

          {/* Audit Banner */}
          <div className="mt-12 rounded-sx-lg border border-sx-accent/40 bg-sx-surface-1 p-8 text-center shadow-lg sm:p-10 max-w-4xl mx-auto">
            <span className="inline-block rounded-full bg-sx-accent/20 px-3.5 py-1 font-sx-mono text-xs font-bold uppercase tracking-widest text-sx-accent">
              Initial Step
            </span>
            <h2 className="mt-3 font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
              Start with a ₹999 AI Business Growth Audit
            </h2>
            <p className="mt-2 text-sm text-sx-text-muted max-w-xl mx-auto">
              Receive a complete AI audit of your brand positioning, website health, competitor landscape, and lead channels.
            </p>
            <p className="mt-3 text-xs text-sx-text-subtle max-w-xl mx-auto">
              Online checkout is being activated. Submit your audit and the Stratxcel team will confirm payment and next
              steps with you directly.
            </p>
            <div className="mt-6 flex justify-center">
              <Link
                href="/audit"
                className="rounded-sx-sm bg-sx-accent px-8 py-3 font-sx-sans text-xs font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
              >
                Sign In & Start Audit →
              </Link>
            </div>
          </div>

          {/* Pricing Tiers Grid */}
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 max-w-7xl mx-auto">
            {tiers.map((t) => (
              <div key={t.id} className="relative flex">
                <Card
                  variant={t.popular ? "elevated" : "panel"}
                  className={`flex h-full flex-col p-8 w-full border ${
                    t.popular ? "border-sx-accent/60 ring-2 ring-sx-accent/30 bg-sx-surface-1" : "border-sx-border bg-sx-surface-1"
                  }`}
                >
                  {t.popular ? (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-sx-accent px-4 py-1 font-sx-mono text-[10px] font-bold uppercase tracking-widest text-sx-accent-on shadow-md">
                      {t.badge}
                    </span>
                  ) : (
                    <span className="font-sx-mono text-[10px] font-bold uppercase tracking-widest text-sx-text-subtle">
                      {t.badge}
                    </span>
                  )}
                  <h2 className="mt-2 font-sx-sans text-2xl font-bold text-sx-text">{t.name}</h2>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-sx-sans text-4xl font-extrabold text-sx-text">{t.price}</span>
                  </div>
                  <p className="mt-1 text-xs text-sx-text-subtle">{t.period}</p>
                  <p className="mt-3 text-xs leading-relaxed text-sx-text-muted">{t.pitch}</p>

                  <ul className="mt-6 flex-1 space-y-3 text-xs text-sx-text-muted">
                    {t.scope.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <span className="text-sx-accent font-bold">✓</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-6 border-t border-sx-border pt-4 font-sx-sans text-[11px] leading-relaxed text-sx-text-subtle italic">
                    {t.note}
                  </p>

                  <div className="mt-6">
                    <Link
                      href={t.href}
                      className={`block w-full rounded-sx-sm py-3 text-center font-sx-sans text-xs font-bold transition-colors ${
                        t.popular
                          ? "bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-md"
                          : "border border-sx-border-strong bg-sx-surface-2 text-sx-text hover:bg-sx-border"
                      }`}
                    >
                      {t.cta}
                    </Link>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="border-t border-sx-border bg-sx-surface-1 py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-center font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
              Frequently Asked Questions
            </h2>
            <dl className="mt-10 space-y-4">
              {faq.map((item) => (
                <div key={item.q} className="rounded-sx-md border border-sx-border bg-sx-bg p-6 shadow-sm">
                  <dt className="font-sx-sans text-base font-bold text-sx-text">{item.q}</dt>
                  <dd className="mt-2 font-sx-sans text-xs sm:text-sm leading-relaxed text-sx-text-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h3 className="font-sx-sans text-xl font-bold text-sx-text">Need a custom enterprise growth setup?</h3>
          <p className="mt-2 font-sx-sans text-sm text-sx-text-muted">
            Talk directly to our operations engineering team on WhatsApp to scope your custom requirements.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-sx-sm bg-sx-accent px-6 py-3 font-sx-sans text-xs font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
            >
              Chat on WhatsApp
            </a>
            <Link
              href="/contact?intent=custom"
              className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-6 py-3 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2"
            >
              Submit Custom Inquiry
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
