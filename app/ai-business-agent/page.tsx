import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export const metadata: Metadata = {
  title: "AI Business Agent — Autonomous Operations & Growth | Stratxcel",
  description:
    "Stratxcel AI Business Agent operates your business workflows across website maintenance, SEO, content, social media, CRM, and analytics with human-in-the-loop governance.",
  alternates: {
    canonical: "https://www.stratxcel.in/ai-business-agent",
  },
  openGraph: {
    title: "AI Business Agent — Stratxcel",
    description:
      "Connect your business systems. Your Stratxcel AI Business Agent operates digital workflows that drive business growth.",
    url: "https://www.stratxcel.in/ai-business-agent",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI Business Agent" }],
    type: "article",
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Stratxcel AI Business Agent",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Cloud / Web",
  description:
    "An AI Business Agent and operating workforce coordinating SEO, website maintenance, content, social media, CRM, and analytics.",
  offers: {
    "@type": "Offer",
    price: "999",
    priceCurrency: "INR",
    name: "Business Growth Audit",
  },
};

export default function AiBusinessAgentPage() {
  return (
    <PublicPageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
          CATEGORY OVERVIEW · AI BUSINESS AGENT
        </p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(2.2rem,4.5vw+0.3rem,3.4rem)] font-bold leading-tight tracking-tight text-sx-text">
          The AI Business Agent that operates your digital company.
        </h1>
        <p className="mt-6 max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text-muted sm:text-[18px]">
          Stratxcel connects your business platforms and operates daily digital work across search, social, CRM, and web
          with connected intelligence, explicit boundaries, and human sign-off.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="ai_business_agent_hero"
            plan="audit"
            className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Get Business Growth Audit — ₹999
          </TrackedCtaLink>
          <Link
            href="/how-it-works"
            className="rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            How it works
          </Link>
        </div>
      </section>

      {/* Core Capabilities */}
      <section className="border-t border-sx-border bg-sx-surface-1 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
            What the AI Business Agent operates for you
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Technical SEO & Search</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Monitors search intent, analyzes competitors, and produces keyword-optimized content to build organic traffic.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Website & Landing Pages</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Architects high-converting landing pages, optimizes copy, and maintains Core Web Vitals performance.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Content & Copywriting</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Generates articles, guides, and conversion copy grounded strictly in verified Brand Brain rules.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Social Media Autopilot</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Prepares weekly multi-channel calendars, formats native captions, and stages posts for review.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">CRM & Lead Follow-Up</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Ingests inbound inquiries from WhatsApp and web forms, normalizes phone data, and stages timely follow-ups.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Analytics & Intelligence</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Synthesizes cross-channel attribution data into clear, actionable weekly executive briefings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Box */}
      <section className="border-t border-sx-border bg-sx-bg py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            Start with the ₹999 Business Growth Audit
          </h2>
          <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
            Find the opportunities, gaps, and immediate next moves across your digital business before activating monthly workflows.
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="ai_business_agent_footer"
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
