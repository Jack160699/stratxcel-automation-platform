import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { AuditCheckoutCta } from "./AuditCheckoutCta";
import { splitGstInclusive, formatCentsAsRupees } from "@/lib/payments/gst";

const gst = splitGstInclusive(99900);

export const metadata: Metadata = {
  title: "₹999 Business Growth Audit — Stratxcel",
  description:
    "An evidence-based audit of your brand positioning, website, competitors and lead channels for ₹999, GST-inclusive.",
};

const INCLUDES = [
  "Structured review of your positioning and business context",
  "Website health and discoverability check",
  "Competitor and category landscape",
  "Lead-channel and response-speed review",
  "A 30/60/90-day growth roadmap",
];

/**
 * Public Audit landing — the funnel's actual entry point. Pay first, then
 * three short intake phases fill in the detail the audit is built from
 * (see app/app/audit/AuditIntake.tsx). No signup wall, no Brand Brain, no
 * business-details form sits in front of the ₹999 payment.
 */
export default function PublicAuditPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-10 text-center sm:px-6"><p className="text-sm text-sx-text-muted">New to Stratxcel? <Link href="/solutions" className="font-semibold text-sx-accent hover:underline">See how outcomes connect across the platform</Link> before you purchase.</p></section>
        <section className="mx-auto max-w-3xl px-4 pb-16 text-center sm:px-6 sm:pb-24">
          <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">
            Business Growth Audit
          </span>
          <h1 className="mt-3 font-sx-sans text-3xl font-extrabold tracking-tight text-sx-text sm:text-5xl">
            Find out exactly where your growth is leaking.
          </h1>
          <p className="mt-4 font-sx-sans text-base text-sx-text-muted">
            An evidence-based audit of your business, built from what you tell us and what we can find publicly —
            analyzed automatically and delivered in your workspace, not generated from a generic template.
          </p>

          <div className="mt-10 rounded-sx-lg border border-sx-accent/40 bg-sx-surface-1 p-8 shadow-lg sm:p-10">
            <div className="flex items-baseline justify-center gap-2">
              <span className="font-sx-sans text-5xl font-extrabold text-sx-text">₹999</span>
              <span className="font-sx-sans text-sm text-sx-text-subtle">one-time, GST included</span>
            </div>

            <div className="mx-auto mt-4 flex max-w-xs flex-col gap-1 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-xs text-sx-text-muted">
              <div className="flex justify-between">
                <span>Taxable value</span>
                <span>{formatCentsAsRupees(gst.taxableValueCents)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST ({gst.ratePercent}%)</span>
                <span>{formatCentsAsRupees(gst.gstCents)}</span>
              </div>
              <div className="flex justify-between border-t border-sx-border pt-1 font-semibold text-sx-text">
                <span>Total payable</span>
                <span>{formatCentsAsRupees(gst.totalCents)}</span>
              </div>
            </div>

            <ul className="mt-6 flex flex-col gap-2.5 text-left text-sm text-sx-text-muted">
              {INCLUDES.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="font-bold text-sx-accent">✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <AuditCheckoutCta />
            </div>

            <p className="mt-4 text-xs text-sx-text-subtle">
              After payment you&rsquo;ll answer three short sections about your business — that&rsquo;s what makes
              the audit specific to you, not generic.
            </p>
          </div>

          <p className="mt-8 text-sm text-sx-text-muted">
            Prefer to talk first?{" "}
            <a href="/contact?intent=consultation" className="font-semibold text-sx-accent hover:underline">
              Request a consultation
            </a>{" "}
            instead.
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
