import { PLATFORM_LOOP, PLATFORM_WORK_STAGES } from "@/lib/solutions/how-it-works";
export function HowStratxcelWorks() {
  return (
    <section id="how-stratxcel-works" className="border-b border-sx-border bg-sx-surface-2">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold">Understand → Diagnose → Execute → Improve</h2>
        <p className="mt-4 text-center text-sm text-sx-text-muted">{PLATFORM_LOOP.join(" → ")} ↻</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {PLATFORM_WORK_STAGES.map((s) => (
            <li key={s.label} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5">
              <p className="text-xs font-bold uppercase text-sx-accent">{s.label}</p>
              <h3 className="mt-1 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-sx-text-muted">{s.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
