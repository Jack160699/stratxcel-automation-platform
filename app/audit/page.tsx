import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { ConversionTrustQuestions } from "@/app/components/public/commercial/ConversionTrustQuestions";
import { AuditCheckoutCta } from "./AuditCheckoutCta";
import { AUDIT_INCLUDES, AUDIT_POSITIONING } from "@/lib/commercial/audit-positioning";
import { splitGstInclusive, formatCentsAsRupees } from "@/lib/payments/gst";
const gst = splitGstInclusive(99900);
export const metadata: Metadata = { title: "₹999 Business Growth Audit — Stratxcel", description: "Evidence-based audit for ₹999, GST-inclusive." };
export default function PublicAuditPage() {
  const copy = AUDIT_POSITIONING;
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text"><PublicHeader /><main className="flex-1">
      <section className="mx-auto max-w-3xl px-4 py-10 text-center sm:px-6"><p className="text-sm text-sx-text-muted">New to Stratxcel? <Link href="/solutions" className="font-semibold text-sx-accent hover:underline">See how outcomes connect</Link> before you purchase.</p></section>
      <section className="mx-auto max-w-3xl px-4 pb-16 text-center sm:px-6 sm:pb-24"><span className="font-sx-mono text-xs font-bold uppercase tracking-wider text-sx-accent">{copy.eyebrow}</span><h1 className="mt-3 text-3xl font-extrabold sm:text-5xl">{copy.headline}</h1><p className="mt-4 text-base text-sx-text-muted">{copy.subhead}</p><p className="mt-2 text-sm text-sx-text-subtle">{copy.reassurance}</p>
        <div className="mt-10 rounded-sx-lg border border-sx-accent/40 bg-sx-surface-1 p-8 sm:p-10"><p className="font-sx-mono text-[11px] font-bold uppercase text-sx-accent">{copy.productName}</p><div className="mt-4 flex items-baseline justify-center gap-2"><span className="text-5xl font-extrabold">{copy.price}</span><span className="text-sm text-sx-text-subtle">{copy.priceNote}</span></div>
          <div className="mx-auto mt-4 flex max-w-xs flex-col gap-1 rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3 text-xs"><div className="flex justify-between"><span>Taxable value</span><span>{formatCentsAsRupees(gst.taxableValueCents)}</span></div><div className="flex justify-between"><span>GST ({gst.ratePercent}%)</span><span>{formatCentsAsRupees(gst.gstCents)}</span></div><div className="flex justify-between border-t border-sx-border pt-1 font-semibold"><span>Total payable</span><span>{formatCentsAsRupees(gst.totalCents)}</span></div></div>
          <ul className="mt-6 flex flex-col gap-2.5 text-left text-sm text-sx-text-muted">{AUDIT_INCLUDES.map((line) => (<li key={line} className="flex gap-2"><span className="font-bold text-sx-accent">✓</span><span>{line}</span></li>))}</ul><div className="mt-8"><AuditCheckoutCta /></div></div>
        <p className="mt-8 text-sm text-sx-text-muted">Prefer to talk first? <a href="/contact?intent=consultation" className="font-semibold text-sx-accent hover:underline">Request a consultation</a>.</p></section>
      <ConversionTrustQuestions limit={4} />
    </main><PublicFooter /></div>
  );
}
