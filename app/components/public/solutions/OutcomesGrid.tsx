import { SOLUTION_OUTCOMES } from "@/lib/solutions/outcomes";
import { Card } from "@/components/ui/Card";
export function OutcomesGrid() {
  return (
    <section id="outcomes" className="border-b border-sx-border bg-sx-surface-2">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold text-sx-text">Start with the result you need</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTION_OUTCOMES.map((o) => (
            <li key={o.id}><Card variant="panel" id={o.id} className="scroll-mt-24 p-5"><h3 className="font-semibold">{o.title}</h3><p className="mt-1 text-sm text-sx-accent">{o.tagline}</p><p className="mt-2 text-sm text-sx-text-muted">{o.description}</p></Card></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
