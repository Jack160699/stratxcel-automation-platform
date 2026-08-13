import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { ConversionCtaBand } from "@/app/components/public/commercial/ConversionCtaBand";
import { ConversionFaqSection } from "@/app/components/public/commercial/ConversionFaqSection";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";
import { PRICING_OBJECTIONS } from "@/lib/commercial/objections";
import { WorkflowRail } from "@/components/ui/WorkflowRail";
export const metadata: Metadata = { title: "How it works — Stratxcel", description: "How the ₹999 staff-delivered audit moves from checkout to a written roadmap." };
const STAGES = [
  { label: "Checkout", title: "Purchase the one-time Audit", body: "Pay ₹999, GST included. No subscription starts." },
  { label: "Intake", title: "Share business context", body: "Complete three guided sections in your workspace." },
  { label: "Review", title: "Team reviews evidence", body: "A staff member reviews your context and lead path." },
  { label: "Delivery", title: "Roadmap delivered", body: "Written 30/60/90-day action plan in your workspace." },
  { label: "Next step", title: "Decide what to act on", body: "Use the report independently or scope monthly help separately." },
];
const AUDIT_FAQ = PRICING_OBJECTIONS.filter((i) => ["audit_flow", "audit_subscription", "staff_activation"].includes(i.id));
export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg"><PublicHeader /><main className="flex-1">
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"><p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">How it works</p><h1 className="mt-4 max-w-2xl text-[clamp(1.8rem,4vw,2.6rem)] font-semibold">One clear path from purchase to a useful written roadmap.</h1><div className="mt-10 max-w-md"><WorkflowRail stages={STAGES.map((s, i) => ({ label: s.label, status: i === 0 ? "active" : "future" }))} /></div><ol className="mt-14 space-y-10">{STAGES.map((s, i) => (<li key={s.label} className="flex gap-5 border-t border-sx-border pt-8 first:border-t-0 first:pt-0"><span className="font-mono text-[13px] text-sx-text-subtle">{String(i + 1).padStart(2, "0")}</span><div><p className="font-semibold">{s.title}</p><p className="mt-2 text-sm text-sx-text-muted">{s.body}</p></div></li>))}</ol></section>
      <ConversionFaqSection title="Common questions" items={AUDIT_FAQ} className="border-t border-sx-border bg-sx-surface-1 py-14" />
      <section className="mx-auto max-w-6xl px-4 py-16 text-center"><TrackedCtaLink href={PUBLIC_CTAS.audit.href} event="start_audit" surface="how_it_works_audit" plan="audit" className="rounded-sx-sm bg-sx-accent px-6 py-3 text-sm font-semibold text-sx-accent-on">{PUBLIC_CTAS.audit.label}</TrackedCtaLink> <Link href="/security" className="ml-3 rounded-sx-sm border border-sx-border-strong px-6 py-3 text-sm">Read security overview</Link></section>
      <ConversionCtaBand surface="how_it_works_footer" />
    </main><PublicFooter /></div>
  );
}
