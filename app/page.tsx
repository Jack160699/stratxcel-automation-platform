import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";

export const metadata: Metadata = {
  title: "Stratxcel — Growth work that turns attention into customers",
  description:
    "Create demand, capture inquiries, follow up leads, improve your digital presence, and see what is driving growth — from one operating system.",
};

const GROWTH_STEPS = [
  {
    title: "Create demand",
    body: "Consistent social content, media, and campaigns that keep your business visible — with human approval before anything publishes.",
  },
  {
    title: "Get discovered",
    body: "Website, search, and local presence work that helps the right people find you when they are looking.",
  },
  {
    title: "Capture & convert",
    body: "Landing pages, forms, WhatsApp, and CRM follow-up so inquiries do not go cold.",
  },
  {
    title: "Measure & improve",
    body: "Clear reporting on what ran, what needs approval, and what to do next — without inventing vanity numbers.",
  },
];

const EXECUTES = [
  { title: "Content & media", href: "/social-autopilot", body: "Plan, draft, and publish social work with approval control." },
  { title: "Website & discovery", href: "/modules", body: "Keep your digital presence current and findable." },
  { title: "Leads & follow-up", href: "/use-cases", body: "Capture inquiries and keep conversations moving." },
  { title: "Reports", href: "/how-it-works", body: "See progress and decide what happens next." },
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
              Stratxcel runs the growth work that turns attention into opportunities and helps turn more opportunities into customers.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl font-sx-sans text-base leading-relaxed text-sx-text-muted sm:text-lg">
              Create demand, capture inquiries, follow up leads, improve your digital presence, and see what is driving growth — from one operating system.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md transition-colors hover:bg-[color:var(--sx-accent-hover)]"
              >
                Start with Stratxcel
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
              <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">How Stratxcel grows the business</h2>
              <p className="mt-3 text-sm text-sx-text-muted sm:text-base">
                Outcomes first — find opportunity, create demand, capture leads, follow up, convert, measure, improve.
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
            <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">What Stratxcel executes</h2>
            <p className="mt-3 text-sm text-sx-text-muted sm:text-base">
              The work behind growth — presented as outcomes, not internal machinery.
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
              AI prepares the work. You approve what matters. Stratxcel executes and reports back.
            </p>
          </div>
          <ol className="mx-auto mt-10 max-w-2xl space-y-6">
            {[
              "Tell Stratxcel what growth outcome you want.",
              "Review prepared content, follow-ups, and missions in Approvals.",
              "Approve what should go live — nothing sensitive publishes without you.",
              "Track results and decide the next improvement.",
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
              <p className="mt-3 text-sm text-sx-text-muted">Commercial tiers unchanged — framed by the outcome each plan supports.</p>
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
            <h2 className="font-sx-sans text-2xl font-extrabold text-sx-text sm:text-3xl">Ready to run growth as a system?</h2>
            <p className="mt-3 text-sm text-sx-text-muted">Create your workspace and start with the outcomes that matter.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
              >
                Start with Stratxcel
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
