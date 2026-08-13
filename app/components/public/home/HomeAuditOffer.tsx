import Link from "next/link";

const AUDIT_INCLUDES = [
  "Positioning and message clarity",
  "Website and discovery signals",
  "Lead path and follow-up gaps",
  "Written 30/60/90-day priority roadmap",
];

export function HomeAuditOffer() {
  return (
    <section
      id="audit-offer"
      data-home-section="audit-offer"
      className="border-b border-sx-border bg-sx-surface-2"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-text-subtle">
            Not sure where to start?
          </p>
          <h2 className="mt-3 font-sx-sans text-2xl font-bold tracking-[-0.02em] text-sx-text sm:text-3xl">
            Start with a Business Growth Audit
          </h2>
          <p className="mt-3 font-sx-sans text-sm leading-relaxed text-sx-text-muted sm:text-base">
            A staff-delivered review that turns your business context into a practical roadmap — a low-friction entry
            point before monthly platform work.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-xl rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 sm:p-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div>
              <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent">
                One-time offer
              </p>
              <p className="mt-2 font-sx-sans text-lg font-semibold text-sx-text">Business Growth Audit</p>
              <p className="mt-1 font-sx-mono text-sm font-bold text-sx-text">₹999, GST included</p>
            </div>
            <Link
              href="/audit"
              className="mt-5 inline-flex min-h-11 shrink-0 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-6 py-3 font-sx-sans text-sm font-semibold text-sx-text transition-colors hover:bg-sx-surface-3 sm:mt-0"
            >
              View the Audit
            </Link>
          </div>

          <ul className="mt-6 space-y-2.5 border-t border-sx-border pt-6 text-left text-sm text-sx-text-muted">
            {AUDIT_INCLUDES.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-sx-accent" aria-hidden>
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-center text-xs text-sx-text-subtle sm:text-left">
            No subscription starts automatically. Monthly platform plans are confirmed separately.
          </p>
        </div>
      </div>
    </section>
  );
}
