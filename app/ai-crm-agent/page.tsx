import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";

export const metadata: Metadata = {
  title: "AI CRM Agent — Inbound Lead Routing & Pipeline Hygiene | Stratxcel",
  description:
    "Stratxcel AI CRM Agent normalizes customer contacts, syncs WhatsApp inquiries, updates deal stages, and prevents leads from dropping out of pipeline views.",
  alternates: {
    canonical: "https://www.stratxcel.in/ai-crm-agent",
  },
  openGraph: {
    title: "AI CRM Agent — Stratxcel",
    description: "Inbound inquiry capture, phone normalization, and pipeline hygiene for growing businesses.",
    url: "https://www.stratxcel.in/ai-crm-agent",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel AI CRM Agent" }],
    type: "article",
  },
};

export default function AiCrmAgentPage() {
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
          SPECIALIST AGENT · PIPELINE & LEAD MANAGEMENT
        </p>
        <h1 className="mt-4 max-w-3xl font-sx-sans text-[clamp(2.2rem,4.5vw+0.3rem,3.4rem)] font-bold leading-tight tracking-tight text-sx-text">
          AI CRM Agent that stops lead leaks across inquiries.
        </h1>
        <p className="mt-6 max-w-2xl font-sx-sans text-[16px] leading-relaxed text-sx-text-muted sm:text-[18px]">
          Centralize WhatsApp chats, website enquiries, and outreach into one clean pipeline. The CRM Agent normalizes
          contacts, assigns ownership, and stages follow-up responses.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3.5">
          <TrackedCtaLink
            href="/audit"
            event="audit_cta_click"
            surface="ai_crm_agent_hero"
            plan="audit"
            className="rounded-sx-sm bg-sx-accent px-7 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)]"
          >
            Audit Your Lead Flow in ₹999 Growth Audit
          </TrackedCtaLink>
          <Link
            href="/solutions"
            className="rounded-sx-sm border border-sx-border-strong bg-sx-bg px-6 py-3.5 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-2"
          >
            View CRM solutions
          </Link>
        </div>
      </section>

      <section className="border-t border-sx-border bg-sx-surface-1 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
            Lead Capture & Pipeline Operations
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">WhatsApp & Web Sync</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Captures incoming inquiries from WhatsApp Business and web forms, ensuring no conversation is lost.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Phone Normalization & Hygiene</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Cleans and normalizes E.164 phone formats, deduplicating contacts and linking inquiry history automatically.
              </p>
            </div>
            <div className="rounded-xl border border-sx-border bg-sx-bg p-6">
              <h3 className="font-sx-sans text-base font-bold text-sx-text">Automated SLA Tracking</h3>
              <p className="mt-2 font-sx-sans text-sm leading-relaxed text-sx-text-muted">
                Monitors response speed, alerts owners when deals stall, and prepares draft follow-ups for approval.
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
            The ₹999 Business Growth Audit examines your lead response paths and gives you a 30/60/90-day pipeline roadmap.
          </p>
          <div className="mt-8 flex justify-center">
            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="ai_crm_agent_footer"
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
