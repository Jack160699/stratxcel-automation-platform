import Link from "next/link";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { AUDIT_INCLUDES, AUDIT_POSITIONING } from "@/lib/commercial/audit-positioning";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";

export function AuditEntrySection({ surface = "audit_entry", variant = "card", className = "" }: { surface?: string; variant?: "card" | "compact"; className?: string }) {
  const copy = AUDIT_POSITIONING;
  if (variant === "compact") {
    return (
      <section className={`border-b border-sx-border ${className}`.trim()}>
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">{copy.eyebrow}</p>
          <h2 className="mt-3 text-2xl font-bold">{copy.headline}</h2>
          <p className="mt-3 text-sm text-sx-text-muted">{copy.subhead}</p>
          <p className="mt-2 text-xs text-sx-text-subtle">{copy.reassurance}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <TrackedCtaLink href="/audit" event="start_audit" surface={surface} plan="audit" className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-6 py-3 text-sm font-bold text-sx-accent-on">{PUBLIC_CTAS.audit.label}</TrackedCtaLink>
            <Link href={copy.secondaryHref} className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong px-6 py-3 text-sm font-semibold hover:bg-sx-surface-2">{copy.secondaryCta}</Link>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="audit-entry" className={`border-b border-sx-border bg-sx-surface-2 ${className}`.trim()}>
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-text-subtle">{copy.eyebrow}</p>
          <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{copy.headline}</h2>
          <p className="mt-3 text-sm text-sx-text-muted sm:text-base">{copy.subhead}</p>
          <p className="mt-2 text-xs text-sx-text-subtle">{copy.reassurance}</p>
        </div>
        <div className="mx-auto mt-10 max-w-xl rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 sm:p-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div><p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent">{copy.productName}</p><p className="mt-2 font-mono text-sm font-bold">{copy.price}, {copy.priceNote}</p></div>
            <TrackedCtaLink href="/audit" event="start_audit" surface={surface} plan="audit" className="mt-5 inline-flex min-h-11 shrink-0 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-6 py-3 text-sm font-semibold hover:bg-sx-surface-3 sm:mt-0">{PUBLIC_CTAS.audit.label}</TrackedCtaLink>
          </div>
          <ul className="mt-6 space-y-2.5 border-t border-sx-border pt-6 text-left text-sm text-sx-text-muted">{AUDIT_INCLUDES.map((item) => (<li key={item} className="flex gap-2"><span className="text-sx-accent">✓</span><span>{item}</span></li>))}</ul>
          <p className="mt-5 text-center text-xs text-sx-text-subtle sm:text-left">No subscription starts automatically.</p>
        </div>
      </div>
    </section>
  );
}
