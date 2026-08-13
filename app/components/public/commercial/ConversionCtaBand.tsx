import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";
export function ConversionCtaBand({ id, title = "See what Stratxcel can do for your business", subtitle = "Explore real software, understand the journey, then choose how to start.", surface, showAudit = true, showDemo = false, className = "" }: { id?: string; title?: string; subtitle?: string; surface: string; showAudit?: boolean; showDemo?: boolean; className?: string }) {
  return (
    <section id={id} className={`border-t border-sx-border bg-sx-surface-2 py-14 ${className}`.trim()}>
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2><p className="mt-3 text-sm text-sx-text-muted">{subtitle}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
          <TrackedCtaLink href={PUBLIC_CTAS.productDemo.href} event={PUBLIC_CTAS.productDemo.event} surface={`${surface}_product_demo`} className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-7 py-3 text-sm font-bold text-sx-accent-on">{PUBLIC_CTAS.productDemo.label}</TrackedCtaLink>
          <TrackedCtaLink href={PUBLIC_CTAS.exploreProducts.href} event={PUBLIC_CTAS.exploreProducts.event} surface={`${surface}_explore`} className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong px-7 py-3 text-sm font-semibold">{PUBLIC_CTAS.exploreProducts.label}</TrackedCtaLink>
          <TrackedCtaLink href={PUBLIC_CTAS.secondary.href} event={PUBLIC_CTAS.secondary.event} surface={`${surface}_how_it_works`} className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong px-7 py-3 text-sm font-semibold">{PUBLIC_CTAS.secondary.label}</TrackedCtaLink>
        </div>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <TrackedCtaLink href={PUBLIC_CTAS.primary.href} event={PUBLIC_CTAS.primary.event} surface={`${surface}_signup`} className="text-sm font-semibold text-sx-accent hover:underline">{PUBLIC_CTAS.primary.label} →</TrackedCtaLink>
          {showAudit ? <TrackedCtaLink href="/audit" event={PUBLIC_CTAS.audit.event} surface={`${surface}_audit`} plan="audit" className="text-sm font-semibold text-sx-text-muted hover:text-sx-accent hover:underline">{PUBLIC_CTAS.audit.label}</TrackedCtaLink> : null}
          {showDemo ? <a href="/contact?intent=demo" className="text-sm font-semibold text-sx-text-muted hover:text-sx-accent hover:underline">Book a demo</a> : null}
        </div>
      </div>
    </section>
  );
}
