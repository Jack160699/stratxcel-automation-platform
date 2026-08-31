import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export const metadata: Metadata = {
  title: "Never Miss a WhatsApp or Website Inquiry — Stratxcel",
  description:
    "Stratxcel makes sure every WhatsApp and website inquiry to your business gets seen and answered — no self-service CRM to manage, just faster response times.",
  alternates: {
    canonical: "https://www.stratxcel.in/ai-crm-agent",
  },
  openGraph: {
    title: "Never Miss a WhatsApp or Website Inquiry — Stratxcel",
    description: "Every WhatsApp and website inquiry captured, organized, and followed up on — so nothing falls through the cracks.",
    url: "https://www.stratxcel.in/ai-crm-agent",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel" }],
    type: "article",
  },
};

export default function AiCrmAgentPage() {
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
          GOOGLE GROWTH · CUSTOMER RESPONSE
        </p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(2.2rem,4.5vw+0.3rem,3.4rem)] font-bold leading-tight tracking-tight text-sx-text">
          Never miss a WhatsApp or website inquiry again.
        </h1>
        <p className="mt-6 max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text-muted sm:text-[18px]">
          Stratxcel keeps track of every WhatsApp and website inquiry to your business, so nothing gets missed while
          you&apos;re busy running your shop. There&apos;s no separate CRM software to learn — it&apos;s part of how Stratxcel
          works for you.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="ai_crm_agent_hero"
            plan="audit"
            className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Check Your Response Speed in a Free Growth Audit
          </TrackedCtaLink>
          <Link
            href="/pricing"
            className="rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            See plans
          </Link>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-1 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
            How Stratxcel keeps your inquiries organized
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">WhatsApp & Web Capture</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Every WhatsApp and website inquiry to your business is captured, so no conversation gets lost.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">One Organized Record</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Repeat inquiries from the same customer are matched automatically, so their history stays together.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Faster Response</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Draft replies are prepared for review, so you can respond quickly without typing every message from scratch.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-bg py-16 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">
            Find where leads are leaking in your sales flow
          </h2>
          <p className="mt-3 font-sx-sans text-sm text-sx-text-muted">
            The Free Business Growth Audit examines your lead response paths and gives you a 30/60/90-day pipeline roadmap.
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="ai_crm_agent_footer"
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
