import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export const metadata: Metadata = {
  title: "AI SEO Agent — Search Intelligence & Content Optimization | Stratxcel",
  description:
    "Stratxcel AI SEO Agent conducts SERP research, audits keyword gaps, and drafts evidence-grounded articles through a governed 14-stage workflow.",
  alternates: {
    canonical: "https://www.stratxcel.in/ai-seo-agent",
  },
  openGraph: {
    title: "AI SEO Agent — Stratxcel",
    description:
      "Governed search intent research, technical SEO audits, and content creation with Brand Brain validation and human sign-off.",
    url: "https://www.stratxcel.in/ai-seo-agent",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI SEO Agent" }],
    type: "article",
  },
};

const SEO_PIPELINE = [
  "1. Research & Market Context",
  "2. Search Intent Mapping",
  "3. SERP Competitor Analysis",
  "4. Keyword Opportunity Sizing",
  "5. Content Brief Construction",
  "6. Evidence & Source Collection",
  "7. Draft Article Production",
  "8. On-Page SEO Optimization",
  "9. Internal Linking Architecture",
  "10. Metadata & Schema Tagging",
  "11. Brand Brain Rule Validation",
  "12. Human Checkpoint / Sign-off",
  "13. CMS Staging & Publish",
  "14. Performance Measurement & Refresh",
];

export default function AiSeoAgentPage() {
  return (
    <PublicPageShell>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
          SPECIALIST AGENT · SEO & SEARCH INTELLIGENCE
        </p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(2.2rem,4.5vw+0.3rem,3.4rem)] font-bold leading-tight tracking-tight text-sx-text">
          AI SEO Agent for evidence-based search growth.
        </h1>
        <p className="mt-6 max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text-muted sm:text-[18px]">
          Turn search demand into compounding organic traffic. The SEO Agent executes search intent research, SERP
          analysis, and evidence-grounded articles with zero fabricated sources.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="ai_seo_agent_hero"
            plan="audit"
            className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Audit Your SEO in the Free Growth Audit
          </TrackedCtaLink>
          <Link
            href="/products"
            className="rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            Explore all products
          </Link>
        </div>
      </section>

      {/* 14-Stage Governed SEO Workflow */}
      <section className="border-t border-sx-border bg-sx-surface-1 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-wider text-sx-accent">
              Governed Pipeline (Level 3)
            </p>
            <h2 className="mt-2 font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
              14-Stage SEO Blog & Article Engine
            </h2>
            <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
              Every search article passes rigorous validation gates before reaching human review or publishing.
            </p>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SEO_PIPELINE.map((stage) => (
              <div
                key={stage}
                className="flex items-center gap-3 rounded-xl border border-sx-border bg-sx-bg p-4 shadow-xs"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sx-accent/10 font-sx-mono text-[11px] font-bold text-sx-accent">
                  ✓
                </span>
                <span className="font-sx-sans text-xs font-semibold text-sx-text">
                  {stage}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-sx-border bg-sx-bg p-6 sm:p-8">
            <h3 className="font-sx-sans text-base font-bold text-sx-text">
              The Truth-in-Content Standard
            </h3>
            <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
              The SEO Agent does not invent citations, fabricate case studies, or generate filler text. All claims are
              derived from verified source evidence, validated against Brand Brain facts, and staged for your explicit review.
            </p>
          </div>
        </div>
      </section>

      {/* Conversion CTA */}
      <section className="border-t border-sx-border bg-sx-bg py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            Uncover your highest-value search opportunities
          </h2>
          <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
            The Free Business Growth Audit analyzes your site discoverability, competitor ranking positions, and immediate keyword wins.
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="ai_seo_agent_footer"
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
