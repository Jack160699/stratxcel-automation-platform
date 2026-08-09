import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";

export const metadata: Metadata = {
  title: "Stratxcel — AI-Powered Growth & Operations Workspace",
  description:
    "Run your content, leads, WhatsApp conversations, website, and campaigns from one intelligent workspace. Planned by AI, approved by you.",
};

const OPERATING_LEVELS = [
  {
    title: "Starter Level",
    bestFor: "Establishing a professional growth foundation",
    package: "Starter Plan · ₹4,999/mo",
    features: [
      "Brand Brain configuration & tone guidelines",
      "Automated social content plan (Instagram & LinkedIn)",
      "Basic lead capture & inquiry logging",
      "Human approval gate before publishing",
      "Weekly performance summary report",
    ],
    ctaText: "Start Business Audit",
    ctaHref: "/audit",
  },
  {
    title: "Growth Level",
    bestFor: "Scaling active marketing, lead capture & WhatsApp follow-up",
    package: "Growth Plan · ₹9,999/mo",
    featured: true,
    features: [
      "Everything in Starter level",
      "Content Calendar & Multi-channel publishing",
      "Instant WhatsApp automated lead sequence",
      "CRM pipeline tracking (New → Scheduled → Closed)",
      "High-converting 5-page website management",
      "Monthly growth analytics & review",
    ],
    ctaText: "Explore Growth Level",
    ctaHref: "/experience",
  },
  {
    title: "Advanced Level",
    bestFor: "Higher-volume execution, advanced Search, and priority support",
    package: "Business Plan · ₹19,999/mo",
    features: [
      "Everything in Growth level",
      "Higher content & campaign volume, advanced Search & Discovery",
      "Advanced WhatsApp + CRM automation",
      "Priority execution & reporting",
    ],
    ctaText: "Get Started with Business",
    ctaHref: "/signup",
  },
];

const FAQS = [
  {
    q: "Will AI post content or spend ad budget without my approval?",
    a: "Never. Stratxcel operates on a strict Human Approval Model. Sensitive actions—such as publishing posts, launching paid campaigns, or sending bulk outreach—require explicit owner sign-off in your approval queue.",
  },
  {
    q: "How does the Business Growth Audit work?",
    a: "When you sign in and start your audit, your business information is saved to your workspace Brand Brain so our operations team can review your growth requirements.",
  },
  {
    q: "Do I need to replace my existing website or domain?",
    a: "No. Stratxcel can manage custom landing pages on your existing domain or build a complete modern website system depending on your selected tier.",
  },
  {
    q: "Are ad spend and domain registration included in the monthly price?",
    a: "No. Subscription prices cover our full AI operating system, content creation, ad workflows, CRM, and website maintenance. Direct ad spend and domain registration remain separate.",
  },
  {
    q: "How is my business data isolated?",
    a: "Every tenant workspace is isolated at the database level with Supabase Row-Level Security (RLS). One client can never see or access another's data.",
  },
];

export default function HomePage() {
  return (
    <div className="sx-public-theme flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        {/* SECTION 1: TWO-COLUMN DESKTOP HERO */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-12 items-center">
            {/* Left Column: Outcome Copy & CTAs */}
            <div className="lg:col-span-7 space-y-6">
              <span className="inline-block rounded-full border border-sx-accent/30 bg-sx-surface-2 px-4 py-1 font-sx-mono text-xs font-bold uppercase tracking-widest text-sx-accent">
                Stratxcel Growth OS
              </span>
              <h1 className="font-sx-sans text-[clamp(2.4rem,5.5vw,4.2rem)] font-extrabold leading-[1.08] tracking-tight text-sx-text">
                Run your growth, content, leads and website from one intelligent workspace.
              </h1>
              <p className="max-w-xl font-sx-sans text-base sm:text-lg leading-relaxed text-sx-text-muted">
                Stratxcel turns business goals into organized missions, social content, WhatsApp follow-ups, and real-time CRM reporting. AI prepares the work; you retain complete approval control.
              </p>

              <div className="pt-2 flex flex-col gap-3.5 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="rounded-sx-sm bg-sx-accent px-7 py-4 text-center font-sx-sans text-sm font-bold text-sx-accent-on transition-all hover:bg-[color:var(--sx-accent-hover)] shadow-xl shadow-blue-500/20"
                >
                  Start with Stratxcel →
                </Link>
                <Link
                  href="/experience"
                  className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-7 py-4 text-center font-sx-sans text-sm font-bold text-sx-text transition-all hover:bg-sx-surface-2 shadow-sm"
                >
                  Explore Product Tour
                </Link>
                <Link
                  href="/pricing"
                  className="px-4 py-2 font-sx-sans text-sm font-semibold text-sx-text-muted hover:text-sx-accent text-center"
                >
                  See Plans & Pricing
                </Link>
              </div>
            </div>

            {/* Right Column: Visual Product Operating System Preview (Explicit Dark Contrast Panel) */}
            <div className="lg:col-span-5">
              <div className="rounded-sx-lg border border-slate-800 bg-[#090D18] p-6 text-white shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-cyan-400">
                      Interactive Product Preview
                    </span>
                  </div>
                  <span className="font-sx-mono text-[10px] text-slate-400">Sample workspace</span>
                </div>

                {/* Workflow Node Graphic */}
                <div className="space-y-3 text-xs">
                  <div className="rounded-sx-md border border-slate-800 bg-[#111827] p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-sx-mono text-slate-400 uppercase">1. Brand Brain Context</span>
                      <p className="font-semibold text-white mt-0.5">Apex Fitness Studio</p>
                    </div>
                    <span className="rounded bg-blue-900/60 px-2 py-0.5 text-[10px] font-bold text-blue-300">Indexed</span>
                  </div>

                  <div className="rounded-sx-md border border-amber-500/40 bg-amber-950/30 p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-sx-mono text-amber-400 uppercase">2. Human Approval Gate</span>
                      <p className="font-semibold text-white mt-0.5">Publish Reels & Ad Mission #412</p>
                    </div>
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">Pending Sign-off</span>
                  </div>

                  <div className="rounded-sx-md border border-emerald-500/40 bg-emerald-950/30 p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-sx-mono text-emerald-400 uppercase">3. WhatsApp Lead Drip</span>
                      <p className="font-semibold text-white mt-0.5">Example WhatsApp follow-up workflow</p>
                    </div>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Active</span>
                  </div>
                </div>

                <p className="text-[10px] font-sx-mono text-slate-500 text-right">
                  [ Stratxcel System Visualization ]
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: IMMEDIATE VALUE OUTCOMES STRIP */}
        <section className="border-t border-b border-sx-border bg-sx-surface-2">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid gap-8 sm:grid-cols-3">
              <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 shadow-sm">
                <span className="font-sx-mono text-xs font-bold text-sx-accent uppercase tracking-wider">OUTCOME 01</span>
                <h3 className="mt-2 font-sx-sans text-lg font-bold text-sx-text">Plan & Produce Consistently</h3>
                <p className="mt-1 text-xs sm:text-sm text-sx-text-muted leading-relaxed">
                  Maintain an active social presence on Instagram & LinkedIn with AI Copilot content drafts.
                </p>
              </div>

              <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 shadow-sm">
                <span className="font-sx-mono text-xs font-bold text-sx-accent uppercase tracking-wider">OUTCOME 02</span>
                <h3 className="mt-2 font-sx-sans text-lg font-bold text-sx-text">Instant Lead Follow-Up</h3>
                <p className="mt-1 text-xs sm:text-sm text-sx-text-muted leading-relaxed">
                  Respond to WhatsApp and website inquiries within seconds with automated qualification sequences.
                </p>
              </div>

              <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 shadow-sm">
                <span className="font-sx-mono text-xs font-bold text-sx-accent uppercase tracking-wider">OUTCOME 03</span>
                <h3 className="mt-2 font-sx-sans text-lg font-bold text-sx-text">Complete Owner Visibility</h3>
                <p className="mt-1 text-xs sm:text-sm text-sx-text-muted leading-relaxed">
                  Review all active missions, leads, and analytics from one unified operational dashboard.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: THREE PRODUCT OPERATING LEVELS */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">
              Product Architecture
            </span>
            <h2 className="mt-2 font-sx-sans text-3xl font-extrabold text-sx-text sm:text-4xl">
              Three Product Operating Levels
            </h2>
            <p className="mt-3 font-sx-sans text-base text-sx-text-muted">
              Choose the level of automation and support that matches your current business stage.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {OPERATING_LEVELS.map((lvl) => (
              <div
                key={lvl.title}
                className={`flex flex-col rounded-sx-lg border p-8 shadow-md transition-all ${
                  lvl.featured
                    ? "border-sx-accent bg-sx-surface-1 ring-2 ring-sx-accent/30 scale-[1.03]"
                    : "border-sx-border bg-sx-surface-1"
                }`}
              >
                {lvl.featured && (
                  <div className="-mt-11 mb-4 self-center">
                    <span className="rounded-full bg-sx-accent px-4 py-1 font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent-on shadow-md">
                      Recommended Fit
                    </span>
                  </div>
                )}

                <h3 className="font-sx-sans text-2xl font-bold text-sx-text">{lvl.title}</h3>
                <p className="mt-1 text-xs text-sx-text-subtle leading-relaxed">{lvl.bestFor}</p>
                <p className="mt-4 font-sx-mono text-xs font-bold text-sx-accent border-b border-sx-border pb-4">
                  {lvl.package}
                </p>

                <ul className="mt-6 flex-1 space-y-3 text-xs text-sx-text-muted">
                  {lvl.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="text-sx-accent font-bold">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 pt-4 border-t border-sx-border">
                  <Link
                    href={lvl.ctaHref}
                    className={`block w-full rounded-sx-sm py-3 text-center font-sx-sans text-xs font-bold transition-colors ${
                      lvl.featured
                        ? "bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-md"
                        : "border border-sx-border-strong bg-sx-surface-2 text-sx-text hover:bg-sx-border"
                    }`}
                  >
                    {lvl.ctaText} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 8: AUTHENTICATED AUDIT PROMOTION */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-sx-lg border border-sx-accent/40 bg-sx-surface-1 p-8 sm:p-12 text-center shadow-xl">
            <span className="inline-block rounded-full bg-sx-accent/20 px-4 py-1 font-sx-mono text-xs font-bold uppercase tracking-widest text-sx-accent">
              AI Growth Analysis
            </span>
            <h2 className="mt-4 font-sx-sans text-3xl font-extrabold text-sx-text">
              Start Your Authenticated AI Business Audit
            </h2>
            <p className="mt-3 text-sm text-sx-text-muted max-w-xl mx-auto leading-relaxed">
              Sign in to request your audit. Your Brand Brain and growth goals are saved to your workspace for review by our operations team.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link
                href="/audit"
                className="rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-xs font-bold text-sx-accent-on shadow-lg hover:bg-[color:var(--sx-accent-hover)]"
              >
                Sign In & Start Audit →
              </Link>
              <Link
                href="/pricing"
                className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-8 py-3.5 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-border"
              >
                View Plans & Pricing
              </Link>
            </div>
          </div>
        </section>

        {/* SECTION 10: OBJECTION HANDLING FAQ */}
        <section className="border-t border-sx-border bg-sx-surface-2 py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-sx-sans text-3xl font-extrabold text-sx-text text-center">
              Frequently Asked Questions
            </h2>
            <div className="mt-10 space-y-4">
              {FAQS.map((faq) => (
                <div key={faq.q} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 shadow-sm">
                  <h3 className="font-sx-sans text-base font-bold text-sx-text">{faq.q}</h3>
                  <p className="mt-2 text-xs sm:text-sm text-sx-text-muted leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 11: FINAL CONVERSION BLOCK */}
        <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-3xl font-extrabold text-sx-text">
            Transform Your Business Operating System Today
          </h2>
          <p className="mt-2 text-sm text-sx-text-muted max-w-md mx-auto">
            Create your account in under a minute and launch your organization&rsquo;s workspace.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-sx-sm bg-sx-accent px-8 py-4 font-sx-sans text-sm font-bold text-sx-accent-on shadow-xl hover:bg-[color:var(--sx-accent-hover)]"
            >
              Start with Stratxcel →
            </Link>
            <Link
              href="/contact?intent=demo"
              className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-8 py-4 font-sx-sans text-sm font-semibold text-sx-text hover:bg-sx-surface-2"
            >
              Book a demo
            </Link>
            <Link
              href="/pricing"
              className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-8 py-4 font-sx-sans text-sm font-semibold text-sx-text hover:bg-sx-surface-2"
            >
              View Commercial Plans
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
