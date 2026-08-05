import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { TrustChips } from "@/app/components/public/TrustChips";
import { Card } from "@/components/ui/Card";
import { whatsappHref } from "@/lib/constants";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing & Plans — Stratxcel Business AI Operating System",
  description:
    "Transparent monthly pricing and Business Growth Audit for Stratxcel. Growth systems, WhatsApp CRM, Meta campaign workflows, and controlled websites built for growth-focused businesses.",
};

const tiers = [
  {
    id: "audit",
    name: "Business Growth Audit",
    badge: "Initial Step",
    price: "₹999",
    period: "one-time",
    pitch: "Comprehensive brand, market, and growth pipeline audit.",
    scope: [
      "Business & brand audit report",
      "Competitor snapshot & market positioning",
      "Social media, website & lead channel review",
      "Actionable growth recommendations",
      "Initial Brand Brain starter record",
    ],
    note: "The full ₹999 is adjusted against your first month subscription if purchased within 7 days.",
    popular: false,
    cta: "Book Audit for ₹999",
    href: "/audit",
  },
  {
    id: "launch",
    name: "Launch",
    badge: "Essential Growth",
    price: "₹9,499",
    period: "per month (GST included)",
    pitch: "Done-for-them monthly growth basics for growing businesses.",
    scope: [
      "Social media content creation & posting (12 posts/mo)",
      "1 Meta ad campaign workflow & ad creative",
      "1 high-conversion ad landing page",
      "WhatsApp connection & inbox dashboard",
      "Basic CRM lead capture & follow-up",
      "Monthly performance reporting",
    ],
    note: "Prices include GST. Ad spend & third-party licenses separate.",
    popular: false,
    cta: "Start Launch Plan",
    href: "/audit",
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Most Popular",
    price: "₹18,999",
    period: "per month (GST included)",
    pitch: "Complete marketing, website, WhatsApp & CRM operating system.",
    scope: [
      "Everything in Launch + higher volume content (30 posts/mo)",
      "2 Meta ad campaign workflows & ongoing optimization",
      "Complete WhatsApp + CRM automated follow-up flows",
      "1st Website included (controlled 5-page template scope)",
      "Website hosting & maintenance included",
      "SEO work & monthly growth reporting",
    ],
    note: "Prices include GST. Domain registration & ad spend separate.",
    popular: true,
    cta: "Get Started with Growth",
    href: "/audit",
  },
  {
    id: "custom",
    name: "Custom Growth",
    badge: "Scale & Enterprise",
    price: "Starting ₹23,999",
    period: "per month (GST included)",
    pitch: "Tailored combination of content, video, website, ads, and human assistance.",
    scope: [
      "Tailored social post & premium video volume",
      "Custom multi-page website & location management",
      "Multi-campaign Meta & Search ad management",
      "Advanced WhatsApp & custom CRM workflows",
      "Dedicated account owner & human assistance",
    ],
    note: "Custom quoted to protect margin and fit complex business needs.",
    popular: false,
    cta: "Request Custom Quote",
    href: "/contact",
  },
];

const trustAboveTiers = [
  "Prices shown are GST inclusive — no hidden surprises",
  "Full ₹999 Audit fee credited if you subscribe within 7 days",
  "Clear service boundaries: ad spend & domains are billed transparently",
];

const faq = [
  {
    q: "How does the ₹999 Business Growth Audit credit work?",
    a: "When you purchase the Business Growth Audit for ₹999, our team conducts a thorough review of your channels, competitor landscape, and growth pipeline. If you move ahead with a Launch or Growth subscription within 7 days of audit completion, the full ₹999 is credited directly against your first month's invoice.",
  },
  {
    q: "Are ad spend and domain names included in the monthly price?",
    a: "Subscription prices cover our full AI operating system, content creation, ad workflows, CRM, and website maintenance. Direct ad spend paid to Meta/Google, domain registration/renewal fees, and third-party software licenses remain separate and owned by your business.",
  },
  {
    q: "Who owns our website domain?",
    a: "You are always the legal beneficial owner of your domain name. Stratxcel registers and configures DNS under your legal registrant details. The free included website is hosted on Stratxcel initially, and full website code export is unlocked after 3 successful subscription months.",
  },
  {
    q: "Can we upgrade or adjust our plan as we scale?",
    a: "Yes! You can start with the ₹999 Audit or Launch plan and upgrade to Growth or Custom Growth at any time as your content volume and ad workflow needs expand.",
  },
];

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-accent">Pricing & Plans</p>
          <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold leading-tight tracking-[-0.02em] text-sx-text">
            Transparent growth systems — collapse complexity into one OS
          </h1>
          <p className="mt-4 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Choose the right growth tier for your business. Full GST-inclusive pricing, zero seats math, and ₹999 audit fee credited towards your subscription.
          </p>

          {/* Audit Callout Banner */}
          <div className="mt-10 rounded-sx-lg border border-sx-accent/30 bg-gradient-to-r from-sx-accent/10 via-sx-surface-2 to-purple-950/30 p-6 text-center sm:p-8">
            <span className="inline-block rounded-sx-pill border border-sx-accent/40 bg-sx-accent/20 px-3.5 py-1 font-sx-mono text-[11px] font-semibold uppercase tracking-widest text-sx-accent">
              Special Offer
            </span>
            <h2 className="mt-3 font-sx-sans text-xl font-bold tracking-tight text-sx-text sm:text-2xl">
              Get Started with a ₹999 Business Growth Audit
            </h2>
            <p className="mt-2 text-sm text-sx-text-muted">
              Receive a complete audit of your brand, social presence, website, and competitor landscape.{" "}
              <strong className="text-sx-accent font-semibold">The full ₹999 is adjusted against your first month subscription</strong> if purchased within 7 days.
            </p>
            <div className="mt-5 flex justify-center">
              <Link
                href="/audit"
                className="rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
              >
                Book Audit for ₹999
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-2xl text-center">
            <TrustChips className="sm:justify-center" items={trustAboveTiers} />
          </div>

          {/* Pricing Tiers Grid */}
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((t) => (
              <li key={t.id} className="relative flex">
                <Card
                  variant={t.popular ? "elevated" : "panel"}
                  className={`flex h-full flex-col p-6 sm:p-7 w-full ${t.popular ? "border-sx-accent/60 ring-1 ring-sx-accent/40" : ""}`}
                >
                  {t.popular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-sx-pill border border-sx-accent/50 bg-sx-accent px-3 py-0.5 font-sx-mono text-[10px] font-bold uppercase tracking-widest text-sx-accent-on">
                      {t.badge}
                    </span>
                  ) : (
                    <span className="font-sx-mono text-[10px] font-semibold uppercase tracking-widest text-sx-text-subtle">
                      {t.badge}
                    </span>
                  )}
                  <h2 className="mt-2 font-sx-sans text-xl font-bold tracking-tight text-sx-text">{t.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-sx-sans text-3xl font-extrabold tracking-tight text-sx-text sm:text-4xl">{t.price}</span>
                  </div>
                  <p className="mt-1 text-xs text-sx-text-subtle">{t.period}</p>
                  <p className="mt-3 text-xs leading-relaxed text-sx-text-muted">{t.pitch}</p>

                  <ul className="mt-6 flex-1 space-y-2.5 text-xs text-sx-text-muted">
                    {t.scope.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sx-accent" aria-hidden />
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
                      className={`block w-full rounded-sx-sm py-2.5 text-center font-sx-sans text-xs font-bold transition-colors ${
                        t.popular
                          ? "bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                          : "border border-sx-border-strong bg-sx-surface-2 text-sx-text hover:bg-sx-border"
                      }`}
                    >
                      {t.cta}
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ Section */}
        <section className="border-t border-sx-border bg-sx-surface-1 py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h3 className="text-center font-sx-mono text-xs font-bold uppercase tracking-widest text-sx-accent">
              Frequently Asked Questions
            </h3>
            <h2 className="mt-2 text-center font-sx-sans text-2xl font-bold tracking-tight text-sx-text">
              Clear boundaries & service guarantees
            </h2>
            <dl className="mt-8 space-y-6">
              {faq.map((item) => (
                <div key={item.q} className="rounded-sx-md border border-sx-border bg-sx-bg p-5">
                  <dt className="font-sx-sans text-base font-semibold text-sx-text">{item.q}</dt>
                  <dd className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-4 py-12 text-center">
          <h3 className="font-sx-sans text-lg font-bold text-sx-text">Need a custom enterprise growth setup?</h3>
          <p className="mt-2 font-sx-sans text-sm text-sx-text-muted">
            Talk directly to our operations engineering team on WhatsApp to scope your custom content, ads, and website requirements.
          </p>
          <div className="mt-6 flex justify-center gap-4">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="rounded-sx-sm bg-sx-accent px-6 py-2.5 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
            >
              Chat on WhatsApp
            </a>
            <Link
              href="/contact"
              className="rounded-sx-sm border border-sx-border-strong px-6 py-2.5 font-sx-sans text-sm font-medium text-sx-text hover:bg-sx-surface-2"
            >
              Submit Inquiry
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
