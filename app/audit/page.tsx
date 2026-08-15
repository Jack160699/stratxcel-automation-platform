import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { ConversionTrustQuestions } from "@/app/components/public/commercial/ConversionTrustQuestions";
import { AuditCheckoutCta } from "./AuditCheckoutCta";
import { AUDIT_INCLUDES, AUDIT_POSITIONING } from "@/lib/commercial/audit-positioning";

export const metadata: Metadata = {
  title: "Instant Business Audit — Stratxcel",
  description: "Get an evidence-backed audit of your business, website and online presence — completely free.",
};

export default function PublicAuditPage() {
  const copy = AUDIT_POSITIONING;
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-3xl px-4 py-10 text-center sm:px-6">
        <p className="text-sm text-sx-text-muted">
          New to Stratxcel?{" "}
          <Link href="/solutions" className="font-semibold text-sx-accent hover:underline">
            See how outcomes connect
          </Link>{" "}
          or start with your free audit below.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 text-center sm:px-6 sm:pb-24">
        <span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">{copy.eyebrow}</span>
        <h1 className="mt-3 font-sx-sans text-3xl font-extrabold tracking-tight text-sx-text sm:text-5xl">
          {copy.headline}
        </h1>
        <p className="mt-4 font-sx-sans text-base text-sx-text-muted">{copy.subhead}</p>
        <p className="mt-2 text-sm text-sx-text-subtle">{copy.reassurance}</p>

        <div className="mt-10 rounded-sx-lg border border-sx-accent/30 bg-sx-surface-1 p-8 shadow-[var(--sx-public-shadow-md)] sm:p-10">
          <div className="flex items-center justify-between">
            <p className="font-sx-mono text-[11px] font-bold uppercase text-sx-accent">{copy.productName}</p>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-sx-mono text-[10px] font-bold uppercase text-emerald-600">
              100% Free
            </span>
          </div>

          <div className="mt-4 flex items-baseline justify-center gap-2 border-b border-sx-border pb-5">
            <span className="font-sx-sans text-5xl font-extrabold text-sx-text">{copy.price}</span>
            <span className="font-sx-sans text-sm text-sx-text-subtle">{copy.priceNote}</span>
          </div>

          <ul className="mt-6 flex flex-col gap-2.5 text-left text-sm text-sx-text-muted">
            {AUDIT_INCLUDES.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="font-bold text-sx-accent">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <AuditCheckoutCta />
          </div>

          <p className="mt-3 text-center font-sx-sans text-xs text-sx-text-subtle">
            No credit card or upfront payment required · Instant analysis generated for your business
          </p>
        </div>

        <p className="mt-8 text-sm text-sx-text-muted">
          Prefer to talk first?{" "}
          <a href="/contact?intent=consultation" className="font-semibold text-sx-accent hover:underline">
            Request a consultation
          </a>
          .
        </p>
      </section>

      <ConversionTrustQuestions limit={4} />
    </PublicPageShell>
  );
}
