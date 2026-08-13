import { ScrollReveal } from "@/app/components/public/motion/ScrollReveal";

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
        <ScrollReveal className="mx-auto max-w-2xl text-center">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
            One platform
          </p>
          <h2 className="mt-3 font-sx-sans text-2xl font-bold tracking-[-0.02em] text-sx-text sm:text-3xl">
            The growth loop, connected end to end
          </h2>
          <p className="mt-3 font-sx-sans text-sm leading-relaxed text-sx-text-muted sm:text-base">
            Stratxcel is built around a single operating model — not a stack of disconnected tools.
          </p>
        </ScrollReveal>

        <ol className="relative mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Connecting flow line — desktop */}
          <div
            className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-8 hidden h-px bg-gradient-to-r from-transparent via-sx-border-strong to-transparent lg:block"
            aria-hidden
          />

          {LOOP_STEPS.map((step, i) => (
            <ScrollReveal key={step.title} as="li" delay={i * 80}>
              <div className="group relative h-full rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 transition-shadow duration-300 hover:shadow-[0_8px_32px_-16px_rgba(10,16,32,0.12)] motion-reduce:transition-none">
                <p className="font-sx-mono text-[11px] font-bold uppercase tracking-wider text-sx-accent">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 font-sx-sans text-base font-semibold text-sx-text">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sx-text-muted">{step.body}</p>
                {i < LOOP_STEPS.length - 1 && (
                  <span
                    className="absolute -right-3 top-1/2 hidden -translate-y-1/2 font-sx-mono text-sx-text-subtle lg:inline"
                    aria-hidden
                  >
                    →
                  </span>
                )}
              </div>
            </ScrollReveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
