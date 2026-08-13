import Link from "next/link";

export function HomeFinalCta() {
  return (
    <section id="final-cta" data-home-section="final-cta" className="border-t border-sx-border bg-sx-surface-2">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <h2 className="font-sx-sans text-2xl font-extrabold tracking-[-0.02em] text-sx-text sm:text-3xl">
          Ready to run growth from one platform?
        </h2>
        <p className="mt-3 font-sx-sans text-sm text-sx-text-muted sm:text-base">
          Explore what Stratxcel can do today, or talk with the team about your priorities.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-8 py-3.5 font-sx-sans text-sm font-bold text-sx-accent-on shadow-md hover:bg-[color:var(--sx-accent-hover)]"
          >
            Start Growing
          </Link>
          <Link
            href="/contact?intent=demo"
            className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-8 py-3.5 font-sx-sans text-sm font-semibold text-sx-text hover:bg-sx-surface-2"
          >
            Book a demo
          </Link>
        </div>
        <p className="mt-6 text-sm text-sx-text-muted">
          Prefer a guided starting point?{" "}
          <Link href="/audit" className="font-semibold text-sx-accent hover:underline">
            Start with the ₹999 Business Growth Audit
          </Link>
        </p>
      </div>
    </section>
  );
}
