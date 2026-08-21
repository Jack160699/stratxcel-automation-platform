import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { ConversionTrustQuestions } from "@/app/components/public/commercial/ConversionTrustQuestions";
import { ConversionCtaBand } from "@/app/components/public/commercial/ConversionCtaBand";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { AuditStartCta } from "./AuditStartCta";

export const metadata: Metadata = {
  title: "Business Growth Audit — Free — Stratxcel",
  description:
    "See how easily customers can find your business online and get your most important growth opportunities — free, in minutes, no card required.",
};

const CHECK_CARDS: { icon: string; title: string; body: string }[] = [
  { icon: "🔍", title: "Google visibility", body: "Can customers find your business on Google Search and Maps when they look for what you sell?" },
  { icon: "🌐", title: "Website", body: "Does your website load fast, look trustworthy, and make it easy for someone to contact you?" },
  { icon: "📱", title: "Social presence", body: "Are your Instagram, Facebook, and YouTube active and easy for customers to find?" },
  { icon: "⭐", title: "Digital credibility", body: "Do your reviews, ratings, and business details build trust at first glance?" },
  { icon: "🧭", title: "Customer discovery", body: "How easily can a new customer go from searching online to actually contacting you?" },
  { icon: "🎯", title: "Competitive opportunities", body: "Where are similar businesses nearby winning attention that you could capture too?" },
];

const RECEIVE_ITEMS = [
  "Your Business Growth Score",
  "Biggest opportunities",
  "Priority improvements",
  "Digital presence findings",
  "Search & discovery insights",
  "Competitor opportunities",
  "Practical next steps",
];

const WHY_FREE: { title: string; body: string }[] = [
  { title: "Free to start", body: "No cost to run your audit — today or later." },
  { title: "No card required", body: "Nothing to enter, nothing to cancel." },
  { title: "Real business data", body: "Built from your actual online presence, not estimates." },
  { title: "Actionable report", body: "Clear priorities you can act on, not a wall of numbers." },
];

const CONNECTORS: { key: PlatformIconKey; label: string }[] = [
  { key: "google_business", label: "Google Business Profile" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "youtube", label: "YouTube" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "google_analytics", label: "Google Analytics" },
  { key: "google_search_console", label: "Search Console" },
];

const HOW_IT_WORKS = [
  { title: "Tell us about your business", body: "A few basics — name, website, or Google listing." },
  { title: "Connect what you already use", body: "Optional. Link Google, social, or WhatsApp to sharpen results." },
  { title: "Stratxcel checks your digital presence", body: "We look at what a real customer would see today." },
  { title: "Get your growth roadmap", body: "Your score, biggest opportunities, and next steps." },
];

const AFTER_AUDIT = [
  "Free Audit",
  "See what's holding the business back",
  "Try relevant Stratxcel tools",
  "Use free & credit-supported capabilities",
  "Activate the plan when ready",
];

const TRY_CAPABILITIES: { title: string; body: string }[] = [
  { title: "Growth Assistant", body: "Ask what to do next, in plain language." },
  { title: "Content creation", body: "Posters, captions, and campaigns drafted for your approval." },
  { title: "Business improvements", body: "Priority fixes for your listings and website." },
  { title: "Website tools", body: "Improve or launch a site your customers can trust." },
  { title: "Connected-account intelligence", body: "See what your connected accounts reveal once linked." },
];

export default function PublicAuditPage() {
  return (
    <PublicPageShell>
      {/* Hero — everything a mobile visitor needs to decide is here, above the fold. */}
      <section className="mx-auto max-w-3xl px-4 pb-14 pt-10 text-center sm:px-6 sm:pb-20 sm:pt-14">
        <span className="inline-flex items-center gap-1.5 rounded-sx-pill bg-emerald-500/10 px-3 py-1 font-sx-mono text-[11px] font-bold uppercase tracking-wider text-emerald-600">
          100% Free · No Card Required
        </span>

        <h1 className="mt-5 font-sx-sans text-[clamp(1.9rem,6vw,3.25rem)] font-extrabold leading-tight tracking-tight text-sx-text">
          Business Growth Audit
        </h1>

        <p className="mx-auto mt-4 max-w-xl font-sx-sans text-base leading-relaxed text-sx-text-muted">
          Stratxcel checks how easily customers can find your business online and shows you the growth opportunities
          that matter most — in minutes.
        </p>

        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
          <AuditStartCta />
          <TrackedCtaLink
            href="#how-it-works"
            event="explore_product"
            surface="public_audit_hero_how_it_works"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-sx-sm border border-sx-border-strong px-6 py-3 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            See How It Works
          </TrackedCtaLink>
        </div>

        <p className="mt-4 font-sx-sans text-xs text-sx-text-subtle">
          Free to start · No credit card · Real business data · Ready in minutes
        </p>
      </section>

      {/* What the audit checks */}
      <section className="border-t border-sx-border bg-sx-surface-2 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
              What we check
            </p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Everything a customer sees before they choose you</h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHECK_CARDS.map((card) => (
              <div
                key={card.title}
                className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5 shadow-[var(--sx-public-shadow-sm)] sm:p-6"
              >
                <span className="text-2xl" aria-hidden="true">
                  {card.icon}
                </span>
                <h3 className="mt-3 font-sx-sans text-base font-bold text-sx-text">{card.title}</h3>
                <p className="mt-1.5 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What they receive */}
      <section className="border-t border-sx-border bg-sx-surface-1 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
              What you receive
            </p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">A clear, honest picture of your growth potential</h2>
          </div>

          <ul className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            {RECEIVE_ITEMS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 rounded-sx-md border border-sx-border bg-sx-surface-2 px-4 py-3 text-left"
              >
                <span className="mt-0.5 font-bold text-sx-accent" aria-hidden="true">
                  ✓
                </span>
                <span className="font-sx-sans text-sm font-medium text-sx-text">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Why it's free */}
      <section className="border-t border-sx-border bg-sx-surface-2 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
              Why it&rsquo;s free
            </p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">A real starting point, at no cost to you</h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_FREE.map((item) => (
              <div key={item.title} className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5 text-center">
                <h3 className="font-sx-sans text-sm font-bold text-sx-text">{item.title}</h3>
                <p className="mt-1.5 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Connectors */}
      <section className="border-t border-sx-border bg-sx-surface-1 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
            Make it stronger
          </p>
          <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Connect what your business already uses</h2>
          <p className="mx-auto mt-3 max-w-xl font-sx-sans text-sm text-sx-text-muted">
            Every connection is optional and stays under your control. Connecting more of the platforms below gives
            Stratxcel more to check — and makes your audit sharper.
          </p>

          <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-3">
            {CONNECTORS.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-2 rounded-sx-pill border border-sx-border bg-sx-surface-2 px-3.5 py-2 font-sx-sans text-[13px] font-semibold text-sx-text"
              >
                <PlatformIcon name={c.key} />
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-sx-border bg-sx-surface-2 py-14 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
              How it works
            </p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Four simple steps</h2>
          </div>

          <ol className="mt-10 flex flex-col">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sx-accent font-sx-mono text-sm font-bold text-sx-accent-on">
                    {i + 1}
                  </span>
                  {i < HOW_IT_WORKS.length - 1 && <span className="mt-1 w-px flex-1 bg-sx-border-strong" aria-hidden="true" />}
                </div>
                <div className="pb-8">
                  <p className="pt-1 font-sx-sans text-base font-bold text-sx-text">{step.title}</p>
                  <p className="mt-1 font-sx-sans text-sm leading-relaxed text-sx-text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What happens after the audit */}
      <section className="border-t border-sx-border bg-sx-surface-1 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
            After your audit
          </p>
          <h2 className="mt-3 text-2xl font-bold sm:text-3xl">Your journey, at your pace</h2>
          <p className="mx-auto mt-3 max-w-xl font-sx-sans text-sm text-sx-text-muted">
            The audit is a starting point, not a sales trap. Nothing is charged automatically.
          </p>

          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-3">
            {AFTER_AUDIT.map((stage, i) => (
              <span key={stage} className="flex items-center gap-2">
                <span className="rounded-sx-pill border border-sx-border bg-sx-surface-2 px-4 py-2 font-sx-sans text-[13px] font-semibold text-sx-text">
                  {stage}
                </span>
                {i < AFTER_AUDIT.length - 1 && (
                  <span className="text-sx-text-subtle" aria-hidden="true">
                    →
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Try / demonstration flow */}
      <section className="border-t border-sx-border bg-sx-surface-2 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
              See it for yourself
            </p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">See what Stratxcel can do for my business</h2>
            <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
              After your audit, explore the real tools built to act on what it finds.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRY_CAPABILITIES.map((cap) => (
              <div key={cap.title} className="rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5">
                <h3 className="font-sx-sans text-sm font-bold text-sx-text">{cap.title}</h3>
                <p className="mt-1.5 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">{cap.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ConversionTrustQuestions />

      <ConversionCtaBand
        title="See what Stratxcel can do for my business"
        subtitle="Explore the Growth Assistant, content creation, and website tools — then choose how to start."
        surface="public_audit_footer"
        showAudit={false}
      />
    </PublicPageShell>
  );
}
