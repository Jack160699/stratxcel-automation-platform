import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export const metadata: Metadata = {
  title: "AI Social Media Agent — Multi-Channel Autopilot & Distribution | Stratxcel",
  description:
    "Stratxcel AI Social Media Agent plans platform-native calendars, formats captions, and schedules distribution across LinkedIn, Instagram, Facebook, and X.",
  alternates: {
    canonical: "https://www.stratxcel.in/ai-social-media-agent",
  },
  openGraph: {
    title: "AI Social Media Agent — Stratxcel",
    description: "Multi-channel social media autopilot with human review and platform compliance.",
    url: "https://www.stratxcel.in/ai-social-media-agent",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI Social Media Agent" }],
    type: "article",
  },
};

export default function AiSocialMediaAgentPage() {
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
          SPECIALIST AGENT · SOCIAL DISTRIBUTION
        </p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(2.2rem,4.5vw+0.3rem,3.4rem)] font-bold leading-tight tracking-tight text-sx-text">
          AI Social Media Agent for consistent, high-impact reach.
        </h1>
        <p className="mt-6 max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text-muted sm:text-[18px]">
          Turn your brand expertise into weekly social presence across LinkedIn, Instagram, Facebook, and X.
          Everything is staged in advance for your single-click sign-off.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <TrackedCtaLink
            href="/social-autopilot"
            event="explore_product"
            surface="ai_social_agent_hero"
            className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Explore Social Autopilot
          </TrackedCtaLink>
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="ai_social_agent_hero"
            plan="audit"
            className="rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            Get Free Business Growth Audit
          </TrackedCtaLink>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-1 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
            Multi-Channel Social Operations
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Platform-Native Formats</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Adapts long-form insights into punchy LinkedIn posts, Instagram carousels, threads, and short video concepts.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Batch Human Approvals</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Review your entire weekly content schedule in a unified visual calendar. Reject or edit any draft with one click.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Engagement Telemetry</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Measures reach and interaction rates to continuously feed proven themes back into the next planning cycle.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-bg py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            Audit your social reach and competitor footprint
          </h2>
          <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
            The Free Business Growth Audit analyzes your digital footprint across channels and delivers immediate actionable recommendations.
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="ai_social_agent_footer"
              plan="audit"
              className="rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
            >
              Start Free Business Growth Audit
            </TrackedCtaLink>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
