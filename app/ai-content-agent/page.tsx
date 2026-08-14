import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export const metadata: Metadata = {
  title: "AI Content Agent — Brand-Grounded Copywriting | Stratxcel",
  description:
    "Stratxcel AI Content Agent drafts conversion copy, long-form articles, and video scripts grounded strictly in your Brand Brain rules.",
  alternates: {
    canonical: "https://www.stratxcel.in/ai-content-agent",
  },
  openGraph: {
    title: "AI Content Agent — Stratxcel",
    description: "Brand-grounded copywriting and articles without generic AI fluff or hallucinations.",
    url: "https://www.stratxcel.in/ai-content-agent",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI Content Agent" }],
    type: "article",
  },
};

export default function AiContentAgentPage() {
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
          SPECIALIST AGENT · BRAND VOICE & COPY
        </p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(2.2rem,4.5vw+0.3rem,3.4rem)] font-bold leading-tight tracking-tight text-sx-text">
          AI Content Agent grounded in your brand identity.
        </h1>
        <p className="mt-6 max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text-muted sm:text-[18px]">
          Eliminate generic AI copy. The Content Agent enforces your Brand Brain positioning, tone guidelines, and factual
          guardrails across every piece of copy.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="ai_content_agent_hero"
            plan="audit"
            className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Audit Your Messaging in ₹999 Growth Audit
          </TrackedCtaLink>
          <Link
            href="/solutions"
            className="rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            View solutions
          </Link>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-1 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
            Brand-Grounded Content Workflows
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Brand Brain Grounding</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Every draft inherits your company positioning, forbidden phrases, and audience value propositions.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Long-Form Thought Leadership</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Produces comprehensive industry guides and comparison articles with factual citations and internal links.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Conversion Copy & Scripts</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Writes high-converting landing page headlines, video scripts, and sales email sequences.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-bg py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            Get clear feedback on your current positioning
          </h2>
          <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
            The ₹999 Business Growth Audit identifies positioning gaps and delivers clear recommendations for your message clarity.
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="ai_content_agent_footer"
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
