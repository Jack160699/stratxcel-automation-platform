import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { StatusChip } from "@/components/ui/StatusChip";

export const metadata: Metadata = {
  title: "Stratxcel — AI-Powered Growth & Operations Workspace",
  description:
    "Run your content, leads, WhatsApp conversations, website, and campaigns from one intelligent workspace. Planned by AI, approved by you.",
};

const OPERATING_LEVELS = [
  {
    title: "Starter Level",
    bestFor: "Establishing a professional growth foundation",
    package: "Launch Plan · ₹9,499/mo",
    features: [
      "Brand Brain configuration & tone guidelines",
      "Automated social content plan (Instagram & LinkedIn)",
      "Basic lead capture & inquiry logging",
      "Human approval gate before publishing",
      "Weekly performance summary report",
    ],
    ctaText: "Start Growth Audit (₹999)",
    ctaHref: "/audit",
  },
  {
    title: "Growth Level",
    bestFor: "Scaling active marketing, lead capture & WhatsApp follow-up",
    package: "Growth Plan · ₹18,999/mo",
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
    bestFor: "Custom business operations, multi-team permissions & campaigns",
    package: "Custom Growth · Starting ₹23,999/mo",
    features: [
      "Everything in Growth level",
      "Multi-channel Meta & Search campaign missions",
      "Custom workflow triggers & API integrations",
      "Human assistance & dedicated engineer handoffs",
      "Advanced CRM roles & multi-client permissions",
    ],
    ctaText: "Consult Our Team",
    ctaHref: "/contact?intent=custom",
  },
];

const FAQS = [
  {
    q: "Will AI post content or spend ad budget without my approval?",
    a: "Never. Stratxcel operates on a strict Human Approval Model. Sensitive actions—such as publishing posts, launching paid campaigns, or sending bulk outreach—require explicit owner sign-off in your approval queue.",
  },
  {
    q: "How does the ₹999 Business Growth Audit fee adjustment work?",
    a: "After you complete the audit questionnaire and pay the ₹999 fee, our team prepares a business-specific growth report. If you subscribe to any qualifying plan (Launch, Growth, or Custom) within 7 days of delivery, 100% of the ₹999 fee is credited toward your subscription.",
  },
  {
    q: "Do I need to replace my existing website or domain?",
    a: "No. Stratxcel can manage custom landing pages on your existing domain or build a complete modern website system depending on your selected tier.",
  },
  {
    q: "Is ad spend included in the monthly subscription fee?",
    a: "No. Advertising budgets are paid directly to your Meta or Google ad accounts. Stratxcel manages campaign strategy, creative assets, and lead tracking.",
  },
  {
    q: "How is my business data isolated?",
    a: "Every tenant workspace is isolated at the database level with Supabase Row-Level Security (RLS). One client can never see or access another's data.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        {/* SECTION 1: HERO */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <span className="inline-block rounded-sx-pill border border-sx-accent/40 bg-sx-accent/10 px-3.5 py-1 font-sx-mono text-[11px] font-semibold uppercase tracking-widest text-sx-accent">
              Stratxcel Growth Operating System
            </span>
            <h1 className="mt-5 font-sx-sans text-[clamp(2.2rem,5.5vw,3.6rem)] font-extrabold leading-[1.08] tracking-[-0.02em] text-sx-text">
              Run your growth, content, leads and website from one AI-powered workspace.
            </h1>
            <p className="mt-5 max-w-xl font-sx-sans text-[15.5px] leading-relaxed text-sx-text-muted sm:text-base">
              Stratxcel plans your content, captures leads, automates WhatsApp follow-ups, and manages your web presence. AI prepares the work; you retain complete approval control.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="rounded-sx-sm bg-sx-accent px-6 py-3.5 text-center font-sx-sans text-sm font-bold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)] shadow-lg"
              >
                Start with Stratxcel →
              </Link>
              <Link
                href="/experience"
                className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-6 py-3.5 text-center font-sx-sans text-sm font-semibold text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
              >
                Explore Product Tour 🎮
              </Link>
              <Link
                href="/contact?intent=demo"
                className="rounded-sx-sm border border-sx-border-strong px-5 py-3.5 text-center font-sx-sans text-sm font-medium text-sx-text hover:bg-sx-surface-2"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </section>

        {/* SECTION 2: IMMEDIATE VALUE STATEMENT */}
        <section className="border-t border-b border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-5">
                <span className="text-xl">📅</span>
                <h3 className="mt-2 font-sx-sans text-base font-bold text-sx-text">Plan & Produce Consistently</h3>
                <p className="mt-1 text-xs text-sx-text-muted leading-relaxed">
                  Maintain an active social presence on Instagram & LinkedIn with AI Copilot content drafts.
                </p>
              </div>

              <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-5">
                <span className="text-xl">💬</span>
                <h3 className="mt-2 font-sx-sans text-base font-bold text-sx-text">Instant Lead Follow-Up</h3>
                <p className="mt-1 text-xs text-sx-text-muted leading-relaxed">
                  Respond to WhatsApp and website inquiries within seconds with automated qualification sequences.
                </p>
              </div>

              <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-5">
                <span className="text-xl">📊</span>
                <h3 className="mt-2 font-sx-sans text-base font-bold text-sx-text">Complete Owner Visibility</h3>
                <p className="mt-1 text-xs text-sx-text-muted leading-relaxed">
                  Review all active missions, leads, and analytics from one unified operational dashboard.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: THREE PRODUCT OPERATING LEVELS */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="text-center">
            <h2 className="font-sx-sans text-2xl font-extrabold text-sx-text sm:text-3xl">
              Three Product Operating Levels
            </h2>
            <p className="mt-2 font-sx-sans text-sm text-sx-text-muted max-w-lg mx-auto">
              Choose the level of automation and support that matches your current business stage.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {OPERATING_LEVELS.map((lvl) => (
              <div
                key={lvl.title}
                className={`flex flex-col rounded-sx-lg border p-6 shadow-xl transition-all ${
                  lvl.featured
                    ? "border-sx-accent bg-sx-surface-1 ring-2 ring-sx-accent/30 scale-[1.02]"
                    : "border-sx-border bg-sx-surface-1"
                }`}
              >
                {lvl.featured && (
                  <div className="-mt-9 mb-4 self-center">
                    <span className="rounded-full bg-sx-accent px-3 py-1 font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent-on">
                      Recommended
                    </span>
                  </div>
                )}

                <h3 className="font-sx-sans text-xl font-bold text-sx-text">{lvl.title}</h3>
                <p className="mt-1 text-xs text-sx-text-muted">{lvl.bestFor}</p>
                <p className="mt-3 font-sx-mono text-xs font-semibold text-sx-accent border-b border-sx-border pb-3">
                  {lvl.package}
                </p>

                <ul className="mt-4 flex-1 space-y-2.5 text-xs text-sx-text-muted">
                  {lvl.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-sx-accent font-bold">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 pt-4 border-t border-sx-border">
                  <Link
                    href={lvl.ctaHref}
                    className={`block w-full rounded-sx-sm py-2.5 text-center font-sx-sans text-xs font-bold transition-colors ${
                      lvl.featured
                        ? "bg-sx-accent text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
                        : "border border-sx-border-strong bg-sx-bg text-sx-text hover:bg-sx-surface-2"
                    }`}
                  >
                    {lvl.ctaText} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4: HOW STRATXCEL WORKS */}
        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <h2 className="font-sx-sans text-2xl font-extrabold text-sx-text sm:text-3xl text-center">
              How Stratxcel Works
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-sx-md border border-sx-border bg-sx-bg p-6">
                <span className="font-sx-mono text-xs font-bold text-sx-accent">01 / UNDERSTAND</span>
                <h3 className="mt-2 font-sx-sans text-lg font-bold text-sx-text">1. Setup Brand Brain</h3>
                <p className="mt-2 text-xs text-sx-text-muted leading-relaxed">
                  Configure your brand identity, product offers, target customers, and communication rules once.
                </p>
              </div>

              <div className="rounded-sx-md border border-sx-border bg-sx-bg p-6">
                <span className="font-sx-mono text-xs font-bold text-sx-accent">02 / OPERATE</span>
                <h3 className="mt-2 font-sx-sans text-lg font-bold text-sx-text">2. Copilot Prepares Work</h3>
                <p className="mt-2 text-xs text-sx-text-muted leading-relaxed">
                  AI drafts content schedules, prepares WhatsApp sequences, and tracks lead pipeline stages.
                </p>
              </div>

              <div className="rounded-sx-md border border-sx-border bg-sx-bg p-6">
                <span className="font-sx-mono text-xs font-bold text-sx-accent">03 / APPROVE</span>
                <h3 className="mt-2 font-sx-sans text-lg font-bold text-sx-text">3. Owner Approves & Reviews</h3>
                <p className="mt-2 text-xs text-sx-text-muted leading-relaxed">
                  Review pending missions in your queue. Approve with one click, or request modifications anytime.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 8: AUDIT ENTRY OFFER */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-sx-lg border border-sx-accent/40 bg-gradient-to-r from-sx-accent/15 via-sx-surface-1 to-purple-950/20 p-8 sm:p-10 text-center shadow-2xl">
            <span className="inline-block rounded-sx-pill border border-sx-accent/40 bg-sx-accent/10 px-3.5 py-1 font-sx-mono text-[11px] font-semibold uppercase tracking-widest text-sx-accent">
              Logical First Step
            </span>
            <h2 className="mt-4 font-sx-sans text-2xl sm:text-3xl font-extrabold text-sx-text">
              Request Your ₹999 Business Growth Audit
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-sx-text-muted max-w-xl mx-auto leading-relaxed">
              Our team reviews your current digital presence, lead response speed, social profiles, and growth potential to build a customized roadmap for your business.
            </p>
            <div className="mt-4 rounded-sx-md bg-sx-bg/80 border border-sx-border p-3 max-w-md mx-auto text-xs font-semibold text-sx-accent">
              💡 100% Fee Adjustment: The ₹999 audit fee is credited against any qualifying subscription purchased within 7 days.
            </div>
            <div className="mt-6">
              <Link
                href="/audit"
                className="inline-block rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-xs font-bold text-sx-accent-on shadow-lg hover:bg-[color:var(--sx-accent-hover)]"
              >
                Complete Audit Questionnaire (₹999) →
              </Link>
            </div>
          </div>
        </section>

        {/* SECTION 10: OBJECTION HANDLING FAQ */}
        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
            <h2 className="font-sx-sans text-2xl font-extrabold text-sx-text sm:text-3xl text-center">
              Frequently Asked Questions
            </h2>
            <div className="mt-10 space-y-4">
              {FAQS.map((faq) => (
                <div key={faq.q} className="rounded-sx-md border border-sx-border bg-sx-bg p-5">
                  <h3 className="font-sx-sans text-sm font-bold text-sx-text">{faq.q}</h3>
                  <p className="mt-2 text-xs text-sx-text-muted leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 11: FINAL CONVERSION BLOCK */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-extrabold text-sx-text sm:text-3xl">
            Transform Your Growth Engine Today
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-sx-text-muted max-w-md mx-auto">
            Start with our ₹999 Growth Audit or create your account to explore the platform.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)] shadow-lg"
            >
              Start with Stratxcel
            </Link>
            <Link
              href="/pricing"
              className="rounded-sx-sm border border-sx-border-strong px-7 py-3.5 font-sx-sans text-xs font-semibold text-sx-text hover:bg-sx-surface-2"
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
