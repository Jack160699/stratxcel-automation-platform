import { ScrollReveal } from "@/app/components/public/motion/ScrollReveal";

const BUSINESS_JOBS = [
  { label: "Social media", detail: "Posts, reels, and replies" },
  { label: "Google", detail: "Search and local discovery" },
  { label: "Customer enquiries", detail: "Forms, calls, and DMs" },
  { label: "WhatsApp", detail: "Quick follow-ups that close" },
  { label: "Website", detail: "Pages that bring people in" },
  { label: "Content", detail: "Ideas turned into publish-ready work" },
  { label: "Follow-ups", detail: "Leads that don't go cold" },
  { label: "Results", detail: "Knowing what is working" },
] as const;

export function HomeBusinessWorkSection() {
  return (
    <section
      id="business-work"
      data-home-section="business-work"
      className="relative -mt-8 bg-sx-bg pb-4 pt-2 sm:-mt-10 sm:pb-6"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-3xl text-center">
          <h2 className="font-sx-sans text-[clamp(1.65rem,3.2vw+0.5rem,2.75rem)] font-bold leading-[1.12] tracking-[-0.03em] text-sx-text">
            Running a business already takes enough work.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-sx-sans text-base leading-relaxed text-sx-text-muted sm:text-lg">
            Marketing, enquiries, content, follow-ups — it adds up fast. Stratxcel brings the work together.
          </p>
        </ScrollReveal>

        <div className="relative mx-auto mt-12 max-w-5xl sm:mt-14">
          <div
            className="pointer-events-none absolute left-1/2 top-8 hidden h-[calc(100%-4rem)] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-sx-border-strong to-transparent lg:block"
            aria-hidden
          />

          <ul className="grid gap-x-10 gap-y-0 sm:grid-cols-2">
            {BUSINESS_JOBS.map((job, i) => (
              <ScrollReveal key={job.label} as="li" delay={i * 50} className="group relative">
                <div className="flex gap-4 border-b border-sx-border py-5 sm:py-6 lg:py-7">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sx-border bg-sx-surface-1 font-sx-mono text-[10px] font-bold text-sx-accent transition-colors group-hover:border-sx-accent/30 group-hover:bg-sx-accent-muted motion-reduce:transition-none"
                    aria-hidden
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 text-left">
                    <h3 className="font-sx-sans text-base font-semibold text-sx-text sm:text-lg">{job.label}</h3>
                    <p className="mt-1 font-sx-sans text-sm leading-relaxed text-sx-text-muted">{job.detail}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </ul>

          <ScrollReveal className="mt-10 text-center sm:mt-12" delay={120}>
            <p className="font-sx-sans text-lg font-semibold text-sx-text sm:text-xl">
              Stratxcel brings the work together.
            </p>
            <p className="mx-auto mt-2 max-w-xl font-sx-sans text-sm text-sx-text-muted sm:text-base">
              One connected workspace for the jobs that keep your business moving — with you in control.
            </p>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
