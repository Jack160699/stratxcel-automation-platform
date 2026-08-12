import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";

export const metadata: Metadata = {
  title: "Stratxcel — Start with a clear growth plan",
  description:
    "A staff-delivered Business Growth Audit with a practical 30/60/90-day roadmap for ₹999, GST included.",
};

const GROWTH_STEPS = [
  {
    title: "Share your context",
    body: "Complete three guided sections about your business, customers, current channels, and goals.",
  },
  {
    title: "We review the evidence",
    body: "The Stratxcel team reviews your positioning, website, public presence, competitors, and lead path.",
  },
  {
    title: "Receive your roadmap",
    body: "Your workspace receives a written report with priority risks and a practical 30/60/90-day action plan.",
  },
  {
    title: "Choose the next step",
    body: "Use the report yourself or ask Stratxcel to scope staff-assisted monthly execution. No subscription starts automatically.",
  },
];

const EXECUTES = [
  { title: "Positioning", href: "/audit", body: "Clarify who the business is for, what it promises, and where the message is unclear." },
  { title: "Website & discovery", href: "/audit", body: "Review the public website and findability signals available to the team." },
  { title: "Leads & follow-up", href: "/audit", body: "Find practical gaps in inquiry capture, response, ownership, and follow-up." },
  { title: "Priority roadmap", href: "/audit", body: "Turn findings into a written sequence of actions for the next 30, 60, and 90 days." },
];

const PLANS = [
  {
    title: "Starter",
    outcome: "Build a consistent growth engine",
    package: "₹4,999/mo",
    features: [
      "Brand Brain & tone guidelines",
      "Social content plan with approval before publish",
      "Basic lead capture & inquiry logging",
      "Weekly performance summary",
    ],
  },
  {
    title: "Growth",
    outcome: "Generate and follow up more opportunities",
    package: "₹9,999/mo",
    featured: true,
    features: [
      "Everything in Starter",
      "Content calendar & multi-channel publishing",
      "WhatsApp lead follow-up sequences",
      "CRM pipeline tracking",
      "Website management & monthly growth review",
    ],
  },
  {
    title: "Business",
    outcome: "Run higher-volume growth execution",
    package: "₹19,999/mo",
    features: [
      "Everything in Growth",
      "Higher content & campaign volume",
      "Advanced Search & Discovery",
      "Priority execution & reporting",
    ],
  },
];

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        {/* 1. OUTCOME */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="font-sx-mono text-xs font-bold uppercase tracking-[0.18em] text-sx-accent">Stratxcel</p>
            <h1 className="mt-4 font-sx-sans text-[clamp(2.2rem,5vw,3.6rem)] font-extrabold leading-[1.1] tracking-tight text-sx-text">
              Find the growth gaps worth fixing first.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl font-sx-sans text-base leading-relaxed text-sx-text-muted sm:text-lg">
              Start with a staff-delivered Business Growth Audit and receive an evidence-based 30/60/90-day roadmap for ₹999, GST included.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/audit"
                className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md transition-colors hover:bg-[color:var(--sx-accent-hover)]"
              >
                Start the ₹999 Audit
              </Link>
              <Link
                href="/how-it-works"
                className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-7 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
              >
                How it works
              </Link>
            </div>
          </div>
        </section>

        {/* 2. HOW STRATXCEL GROWS THE BUSINESS */}
        <section className="border-y border-sx-border bg-sx-surface-2">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">How the Audit works</h2>
              <p className="mt-3 text-sm text-sx-text-muted sm:text-base">
                One paid starting point, three guided intake sections, a staff review, and a written deliverable.
              </p>
            </div>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {GROWTH_STEPS.map((step, i) => (
                <div key={step.title} className="min-w-0">
                  <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-2 font-sx-sans text-lg font-semibold text-sx-text">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-sx-text-muted">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. WHAT IT EXECUTES */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">What the Audit covers</h2>
            <p className="mt-3 text-sm text-sx-text-muted sm:text-base">
              The review stays focused on evidence the team can inspect and actions a business can use.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {EXECUTES.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 transition-colors hover:border-sx-border-strong"
              >
                <h3 className="font-sx-sans text-base font-semibold text-sx-text">{item.title}</h3>
                <p className="mt-1 text-sm text-sx-text-muted">{item.body}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* 4. PROOF — honest: no fabricated metrics */}
        <section className="border-y border-sx-border bg-sx-surface-2">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8">
            <h2 className="font-sx-sans text-2xl font-bold text-sx-text">Built for owner control</h2>
            <p className="mt-3 text-sm leading-relaxed text-sx-text-muted sm:text-base">
              Sensitive actions — publishing, campaigns, bulk outreach — stay behind human approval. Workspace data is isolated per customer. We do not publish fabricated customer counts or conversion rates.
            </p>
            <Link href="/security" className="mt-5 inline-block text-sm font-semibold text-sx-accent hover:underline">
              Read how security works →
            </Link>
          </div>
        </section>

        {/* 5. HOW IT WORKS */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">How it works</h2>
            <p className="mt-3 text-sm text-sx-text-muted sm:text-base">
              The paid Audit has one clear path from checkout to a delivered report.
            </p>
          </div>
          <ol className="mx-auto mt-10 max-w-2xl space-y-6">
            {[
              "Pay securely and claim the order in your workspace.",
              "Complete the guided business intake.",
              "The Stratxcel team reviews the available evidence and prepares the report.",
              "Open the delivered roadmap in your workspace and choose what to do next.",
            ].map((line, i) => (
              <li key={line} className="flex gap-4">
                <span className="font-sx-mono text-sm font-bold text-sx-accent">{i + 1}</span>
                <span className="text-sm text-sx-text-muted sm:text-base">{line}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8 text-center">
            <Link href="/how-it-works" className="text-sm font-semibold text-sx-accent hover:underline">
              See the full operating model →
            </Link>
          </div>
        </section>

        {/* 6. PLANS */}
        <section className="border-t border-sx-border bg-sx-surface-2">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">Plans</h2>
              <p className="mt-3 text-sm text-sx-text-muted">Monthly plans are staff-activated during closed beta after scope and availability are confirmed.</p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.title}
                  className={`flex flex-col rounded-sx-lg border bg-sx-surface-1 p-7 ${
                    plan.featured ? "border-sx-accent ring-1 ring-sx-accent/30" : "border-sx-border"
                  }`}
                >
                  <h3 className="font-sx-sans text-xl font-bold text-sx-text">{plan.title}</h3>
                  <p className="mt-1 text-sm font-medium text-sx-accent">{plan.outcome}</p>
                  <p className="mt-4 font-sx-mono text-sm font-bold text-sx-text">{plan.package}</p>
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm text-sx-text-muted">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-sx-accent">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/pricing"
                    className={`mt-7 block rounded-sx-sm py-3 text-center text-xs font-bold ${
                      plan.featured
                        ? "bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                        : "border border-sx-border-strong text-sx-text hover:bg-sx-surface-2"
                    }`}
                  >
                    See plan details
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. TRUST */}
        <section className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-bold text-sx-text">Trust & security</h2>
          <p className="mt-3 text-sm leading-relaxed text-sx-text-muted">
            Human approval for sensitive actions. Tenant isolation at the database. No fabricated proof on this site.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm font-semibold">
            <Link href="/security" className="text-sx-accent hover:underline">
              Security
            </Link>
            <Link href="/contact" className="text-sx-accent hover:underline">
              Contact
            </Link>
          </div>
        </section>

        {/* 8. FINAL CTA */}
        <section className="border-t border-sx-border bg-sx-surface-2">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
            <h2 className="font-sx-sans text-2xl font-extrabold text-sx-text sm:text-3xl">Ready for a clearer growth plan?</h2>
            <p className="mt-3 text-sm text-sx-text-muted">Start with the ₹999 Business Growth Audit. No subscription is added.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/audit"
                className="rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
              >
                Start the Audit
              </Link>
              <Link
                href="/contact?intent=demo"
                className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-8 py-3.5 font-sx-sans text-sm font-semibold text-sx-text hover:bg-sx-surface-2"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
