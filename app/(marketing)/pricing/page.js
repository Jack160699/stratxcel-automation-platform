import { PageHero } from "@/app/components/PageHero";
import { PrimaryButton, GhostButton, CTARow, CTAMicrocopy, TrustChips } from "@/app/components/marketing-ui";
import { whatsappHref } from "@/lib/constants";
import { Reveal } from "@/app/components/Reveal";
import Link from "next/link";

export const metadata = {
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
    <>
      <PageHero
        eyebrow="Transparent Pricing"
        title="Business growth systems — collapse complexity into one OS"
        description="Choose the right growth tier for your business. Full GST-inclusive pricing, zero seats math, and ₹999 audit fee credited towards your subscription."
      />

      <div className="border-t border-slate-800/60 bg-[#05070e] py-10 sm:py-14 lg:py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Audit Callout Banner */}
          <Reveal>
            <div className="mx-auto max-w-3xl rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-purple-950/60 p-6 sm:p-8 text-center shadow-[0_0_40px_rgba(99,102,241,0.15)] backdrop-blur-md mb-12">
              <span className="inline-block rounded-full bg-indigo-500/20 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-300 border border-indigo-400/30">
                Special Offer
              </span>
              <h2 className="mt-3 text-xl font-bold tracking-tight text-white sm:text-2xl">
                Get Started with a ₹999 Business Growth Audit
              </h2>
              <p className="mt-2 text-sm text-slate-300 sm:text-base">
                Receive a complete audit of your brand, social presence, website, and competitor landscape.{" "}
                <strong className="text-indigo-200">The full ₹999 is adjusted against your first month subscription</strong> if purchased within 7 days.
              </p>
              <div className="mt-5 flex justify-center gap-4">
                <Link
                  href="/audit"
                  className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
                >
                  Book Audit for ₹999
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <TrustChips items={trustAboveTiers} />
            </div>
          </Reveal>

          {/* Pricing Tiers Grid */}
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((t, i) => (
              <Reveal key={t.id} delay={80 + i * 70}>
                <li
                  className={`relative flex h-full flex-col rounded-2xl border p-6 sm:p-7 backdrop-blur-xl transition-all hover:border-indigo-400/50 ${
                    t.popular
                      ? "border-indigo-500 bg-gradient-to-b from-indigo-950/40 via-slate-900/90 to-slate-950 shadow-[0_0_50px_rgba(99,102,241,0.2)] ring-1 ring-indigo-400/30"
                      : "border-slate-800/80 bg-slate-900/50 shadow-xl"
                  }`}
                >
                  {t.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-indigo-400/50 bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-white shadow-md">
                      {t.badge}
                    </span>
                  )}
                  {!t.popular && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      {t.badge}
                    </span>
                  )}
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-white">{t.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t.price}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{t.period}</p>
                  <p className="mt-3 text-xs leading-relaxed text-slate-300">{t.pitch}</p>

                  <ul className="mt-6 flex-1 space-y-2.5 text-xs text-slate-300">
                    {t.scope.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-6 border-t border-slate-800 pt-4 text-[11px] leading-relaxed text-slate-400 italic">
                    {t.note}
                  </p>

                  <div className="mt-6">
                    <Link
                      href={t.href}
                      className={`block w-full rounded-xl py-3 text-center text-xs font-bold transition-all shadow-md ${
                        t.popular
                          ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:brightness-110"
                          : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                      }`}
                    >
                      {t.cta}
                    </Link>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="border-t border-slate-800/60 bg-[#070a14] py-14 text-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h3 className="text-center text-xs font-bold uppercase tracking-widest text-indigo-400">
            Frequently Asked Questions
          </h3>
          <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-white">
            Clear boundaries & service guarantees
          </h2>
          <dl className="mt-8 space-y-6">
            {faq.map((item) => (
              <div key={item.q} className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5">
                <dt className="text-base font-semibold text-white">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-300">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="bg-[#05070e] py-12 text-center border-t border-slate-800/40">
        <div className="mx-auto max-w-2xl px-4">
          <h3 className="text-lg font-bold text-white">Need a custom enterprise growth setup?</h3>
          <p className="mt-2 text-sm text-slate-400">
            Talk directly to our operations engineering team on WhatsApp to scope your custom content, ads, and website requirements.
          </p>
          <CTARow className="mt-6">
            <PrimaryButton href={whatsappHref} external>
              Chat on WhatsApp
            </PrimaryButton>
            <GhostButton href="/contact">Submit Inquiry</GhostButton>
          </CTARow>
        </div>
      </div>
    </>
  );
}
