import Link from "next/link";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { AUDIT_INCLUDES, AUDIT_POSITIONING } from "@/lib/commercial/audit-positioning";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";

export function HomeAuditOffer() {
  const copy = AUDIT_POSITIONING;

  return (
    <section
      id="start-with-clarity"
      data-home-section="audit"
      className="scroll-mt-20 border-t border-sx-border bg-sx-surface-1"
    >
      <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,8vw,6rem)] sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-start lg:gap-16">
          <div>
            <h2 className="font-sx-sans text-[clamp(1.5rem,3vw+0.4rem,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-sx-text">
              Not sure where to start?
              <br />
              Start with clarity.
            </h2>
            <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[16px]">
              {copy.subhead}
            </p>
            <p className="mt-3 font-sx-sans text-[14px] leading-relaxed text-sx-text-subtle">{copy.reassurance}</p>
            <Link
              href={copy.secondaryHref}
              className="mt-6 inline-flex items-center gap-1.5 font-sx-sans text-[14.5px] font-semibold text-sx-accent hover:underline"
            >
              {copy.secondaryCta} <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="rounded-sx-lg border border-sx-border bg-sx-bg p-6 shadow-[var(--sx-public-shadow-md)] sm:p-8">
            <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.18em] text-sx-accent">{copy.productName}</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-sx-sans text-4xl font-semibold tracking-tight text-sx-text">{copy.price}</span>
              <span className="font-sx-sans text-[13px] text-sx-text-subtle">{copy.priceNote}</span>
            </p>

            <ul className="mt-6 space-y-2.5 border-t border-sx-border pt-6">
              {AUDIT_INCLUDES.map((item) => (
                <li key={item} className="flex gap-2.5 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
                  <span className="text-sx-accent" aria-hidden>
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <TrackedCtaLink
              href="/audit"
              event="start_audit"
              surface="home_audit"
              plan="audit"
              className="mt-7 flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-6 py-3 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)] motion-reduce:transition-none"
            >
              {PUBLIC_CTAS.audit.label}
            </TrackedCtaLink>
            <p className="mt-3 text-center font-sx-sans text-[12px] text-sx-text-subtle">
              No subscription starts automatically.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
