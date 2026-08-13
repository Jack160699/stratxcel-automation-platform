import Link from "next/link";
export function SolutionsHero() {
  return (
    <section id="solutions-hero" className="border-b border-sx-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Solutions</p>
        <h1 className="mt-4 max-w-3xl text-[clamp(1.85rem,4vw,2.75rem)] font-semibold text-sx-text">What you want to accomplish — not another list of software features.</h1>
        <p className="mt-5 max-w-2xl text-sx-text-muted">Stratxcel is organized around business outcomes. Pick the goal that matters now.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/modules" className="rounded-sx-sm bg-sx-accent px-6 py-3 text-sm font-semibold text-sx-accent-on">See what Stratxcel provides</Link>
          <Link href="#growth-lifecycle" className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-sm">View the growth journey</Link>
        </div>
      </div>
    </section>
  );
}
