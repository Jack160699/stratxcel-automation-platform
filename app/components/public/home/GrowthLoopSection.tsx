const LOOP_STEPS = [
  { title: "Understand", body: "Research market, competitors, and positioning inside your workspace." },
  { title: "Create", body: "Plan content, campaigns, and site updates with approval before publish." },
  { title: "Capture", body: "Route leads from forms, search, and WhatsApp into one CRM view." },
  { title: "Improve", body: "Review performance signals and decide what to run next." },
];

export function GrowthLoopSection() {
  return (
    <section
      id="growth-loop"
      data-home-section="growth-loop"
      className="border-b border-sx-border bg-sx-surface-2"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
            One platform
          </p>
          <h2 className="mt-3 font-sx-sans text-2xl font-bold tracking-[-0.02em] text-sx-text sm:text-3xl">
            The growth loop, connected end to end
          </h2>
          <p className="mt-3 font-sx-sans text-sm leading-relaxed text-sx-text-muted sm:text-base">
            Stratxcel is built around a single operating model — not a stack of disconnected tools.
          </p>
        </div>

        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP_STEPS.map((step, i) => (
            <li
              key={step.title}
              className="relative rounded-sx-md border border-sx-border bg-sx-surface-1 p-5"
            >
              <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 font-sx-sans text-base font-semibold text-sx-text">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-sx-text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
