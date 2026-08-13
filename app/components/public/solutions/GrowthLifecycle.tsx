import { GROWTH_LIFECYCLE } from "@/lib/solutions/lifecycle";
export function GrowthLifecycle() {
  return (
    <section id="growth-lifecycle" className="border-b border-sx-border">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <h2 className="text-center text-2xl font-bold text-sx-text">One journey from invisible to unstoppable</h2>
        <ol className="mx-auto mt-10 max-w-3xl space-y-6">
          {GROWTH_LIFECYCLE.map((s, i) => (
            <li key={s.id} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
              <p className="font-mono text-xs text-sx-accent">{String(i+1).padStart(2,"0")} · {s.subtitle}</p>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-sx-text-muted">{s.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
