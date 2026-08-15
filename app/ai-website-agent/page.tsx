import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export const metadata: Metadata = {
  title: "AI Website Agent — Web Maintenance & High-Converting UX | Stratxcel",
  description:
    "Stratxcel AI Website Agent designs landing page UX, drafts conversion copy, and maintains Core Web Vitals performance under governed release control.",
  alternates: {
    canonical: "https://www.stratxcel.in/ai-website-agent",
  },
  openGraph: {
    title: "AI Website Agent — Stratxcel",
    description: "Governed website UX architecture, landing page copy, and maintenance.",
    url: "https://www.stratxcel.in/ai-website-agent",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI Website Agent" }],
    type: "article",
  },
};

export default function AiWebsiteAgentPage() {
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
          SPECIALIST AGENT · WEB & UX ARCHITECTURE
        </p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(2.2rem,4.5vw+0.3rem,3.4rem)] font-bold leading-tight tracking-tight text-sx-text">
          AI Website Agent for conversion-focused digital storefronts.
        </h1>
        <p className="mt-6 max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text-muted sm:text-[18px]">
          Maintain an active, high-converting website without endless development cycles. The Website Agent structures
          UX journeys, generates page drafts, and maintains speed under release controls.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="ai_website_agent_hero"
            plan="audit"
            className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Audit Your Website in Free Growth Audit
          </TrackedCtaLink>
          <Link
            href="/product-proof"
            className="rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            View product interface
          </Link>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-1 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
            Core Web & Landing Page Operations
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Landing Page Architecture</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Assembles high-conversion page structures with cognitive fluency, clear benefit hierarchy, and prominent CTAs.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Core Web Vitals & Speed</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Continuously audits and maintains fast Largest Contentful Paint (LCP) and zero Cumulative Layout Shift (CLS).
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Governed Release Safety</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Changes are staged in sandboxed previews with approval gates before deploying to live production domains.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-bg py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            See where your website is losing conversions
          </h2>
          <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
            The Business Growth Audit delivers an objective review of your site positioning, speed, and conversion friction.
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="ai_website_agent_footer"
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
