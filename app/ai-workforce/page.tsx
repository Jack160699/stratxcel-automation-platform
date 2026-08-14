import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export const metadata: Metadata = {
  title: "AI Workforce — Multi-Agent Digital Workforce System | Stratxcel",
  description:
    "Explore the Stratxcel AI Workforce architecture: specialist agents operating across Strategy, SEO, Content, Social, CRM, and Analytics under one unified operating core.",
  alternates: {
    canonical: "https://www.stratxcel.in/ai-workforce",
  },
  openGraph: {
    title: "AI Workforce — Stratxcel",
    description: "The complete multi-agent digital workforce operating the digital side of your business.",
    url: "https://www.stratxcel.in/ai-workforce",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI Workforce" }],
    type: "article",
  },
};

const WORKFORCE_ROSTER = [
  { name: "SEO Agent", focus: "Search intent, keyword maps, technical audits", route: "/ai-seo-agent" },
  { name: "Website Agent", focus: "UX journeys, landing page generation, speed", route: "/ai-website-agent" },
  { name: "Content Agent", focus: "Brand Brain copy, articles, conversion copy", route: "/ai-content-agent" },
  { name: "Social Agent", focus: "Multi-platform calendars, scheduling, engagement", route: "/ai-social-media-agent" },
  { name: "CRM Agent", focus: "WhatsApp sync, phone normalization, pipeline hygiene", route: "/ai-crm-agent" },
  { name: "Marketing Agent", focus: "Campaign media plans, ad creative variants, CAC", route: "/ai-marketing-agent" },
  { name: "Automation Agent", focus: "Closed-loop workflow execution & policy gates", route: "/ai-business-automation" },
  { name: "Analytics Agent", focus: "Cross-channel attribution & executive briefings", route: "/ai-business-agent" },
];

export default function AiWorkforcePage() {
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
          ARCHITECTURE · AI WORKFORCE
        </p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(2.2rem,4.5vw+0.3rem,3.4rem)] font-bold leading-tight tracking-tight text-sx-text">
          An AI Workforce operating as one connected digital team.
        </h1>
        <p className="mt-6 max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text-muted sm:text-[18px]">
          Stratxcel deploys specialist AI agents across search, website, copy, social, CRM, and analytics. Each agent has
          distinct responsibilities, shared context, and human-in-the-loop governance.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="ai_workforce_hero"
            plan="audit"
            className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Start Business Growth Audit — ₹999
          </TrackedCtaLink>
          <Link
            href="/how-it-works"
            className="rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            How it works
          </Link>
        </div>
      </section>

      {/* Specialist Agents Grid */}
      <section className="border-t border-sx-border bg-sx-surface-1 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
            Specialist Agents in the Workforce
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {WORKFORCE_ROSTER.map((item) => (
              <div key={item.name} className="flex flex-col justify-between rounded-xl border border-sx-border bg-sx-bg p-5">
                <div>
                  <h3 className="font-sx-sans text-base font-bold text-sx-text">{item.name}</h3>
                  <p className="mt-1.5 font-sx-sans text-xs leading-relaxed text-sx-text-muted">{item.focus}</p>
                </div>
                <div className="mt-4 border-t border-sx-border pt-3">
                  <Link href={item.route} className="font-sx-sans text-xs font-semibold text-sx-accent hover:underline">
                    Explore capabilities →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Conversion CTA */}
      <section className="border-t border-sx-border bg-sx-bg py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            Activate your digital AI workforce with clarity
          </h2>
          <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
            The ₹999 Business Growth Audit identifies exactly where to deploy specialist agents for maximum ROI.
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="ai_workforce_footer"
              plan="audit"
              className="rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
            >
              Start Business Growth Audit — ₹999
            </TrackedCtaLink>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
