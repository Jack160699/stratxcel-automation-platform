import Link from "next/link";
import { AuditCheckoutCta } from "@/app/audit/AuditCheckoutCta";
export function AuditFunnelCta() {
  return (
    <section id="audit-funnel" className="border-b border-sx-border">
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
        <p className="text-xs font-bold uppercase text-sx-text-subtle">Not sure where to start?</p>
        <h2 className="mt-3 text-2xl font-bold">Business Growth Audit</h2>
        <p className="mt-3 text-sm text-sx-text-muted">Research → diagnosis → opportunities → prioritized action plan. Staff-delivered for ₹999 — not an automated report.</p>
        <div className="mx-auto mt-8 max-w-md rounded-sx-lg border border-sx-accent/30 p-6"><p className="text-4xl font-extrabold">₹999</p><div className="mt-6"><AuditCheckoutCta /></div></div>
        <p className="mt-6 text-sm"><Link href="/signup" className="text-sx-accent font-semibold">Start with Stratxcel</Link> · <Link href="/modules" className="text-sx-accent font-semibold">Explore capabilities</Link></p>
      </div>
    </section>
  );
}
