import type { ReactNode } from "react";

/**
 * One example workflow across a single day. Deliberately framed as an
 * illustration — no named customer, no claimed result, no metric.
 */

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-sx-md border border-sx-border bg-sx-bg shadow-[var(--sx-public-shadow-sm)]">
      <div className="flex items-center gap-2 border-b border-sx-border bg-sx-surface-2 px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-sx-accent" aria-hidden />
        <span className="font-sx-mono text-[9.5px] uppercase tracking-[0.16em] text-sx-text-subtle">{label}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const MOMENTS = [
  {
    time: "Morning",
    title: "Someone searches for a place nearby.",
    body: "Your listing, hours, and menu are accurate, so you show up as an option instead of being skipped.",
    frame: (
      <Frame label="Search & discovery">
        <div className="flex items-center gap-2 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3 py-2">
          <span className="text-sx-text-subtle" aria-hidden>
            ⌕
          </span>
          <span className="font-sx-sans text-[13px] text-sx-text-muted">coffee near me</span>
        </div>
        <div className="mt-3 rounded-sx-sm border border-sx-accent/30 bg-sx-accent-muted p-3">
          <p className="font-sx-sans text-[13.5px] font-semibold text-sx-text">Your business profile</p>
          <p className="mt-1 font-sx-sans text-[12px] text-sx-text-muted">Open now · Directions · Menu</p>
        </div>
        <p className="mt-3 font-sx-mono text-[9.5px] uppercase tracking-[0.14em] text-sx-accent">Opportunity found</p>
      </Frame>
    ),
  },
  {
    time: "Afternoon",
    title: "A post is ready for you to look at.",
    body: "The draft is written in your business's voice. You read it, change what you want, and approve it.",
    frame: (
      <Frame label="Content studio">
        <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
          <div className="h-1.5 w-3/5 rounded-full bg-sx-border-strong" />
          <div className="mt-2.5 space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-sx-border" />
            <div className="h-1.5 w-11/12 rounded-full bg-sx-border" />
            <div className="h-1.5 w-2/3 rounded-full bg-sx-border" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-sx-sm bg-sx-accent px-3 py-1.5 font-sx-sans text-[12px] font-semibold text-sx-accent-on">
            Approve
          </span>
          <span className="rounded-sx-sm border border-sx-border-strong px-3 py-1.5 font-sx-sans text-[12px] font-medium text-sx-text">
            Edit
          </span>
        </div>
        <p className="mt-3 font-sx-mono text-[9.5px] uppercase tracking-[0.14em] text-sx-accent">Approval required</p>
      </Frame>
    ),
  },
  {
    time: "Evening",
    title: "An enquiry gets answered before it goes cold.",
    body: "The message lands in the same place as everything else, with a reply ready for you to send or rewrite.",
    frame: (
      <Frame label="WhatsApp">
        <div className="max-w-[85%] rounded-sx-sm rounded-tl-[3px] border border-sx-border bg-sx-surface-2 px-3 py-2">
          <p className="font-sx-sans text-[12.5px] text-sx-text">Do you take bookings for six people?</p>
        </div>
        <div className="ml-auto mt-2 max-w-[85%] rounded-sx-sm rounded-tr-[3px] border border-sx-accent/30 bg-sx-accent-muted px-3 py-2">
          <p className="font-sx-sans text-[12.5px] text-sx-text">
            Yes — we can hold a table. What time works for you?
          </p>
        </div>
        <p className="mt-3 font-sx-mono text-[9.5px] uppercase tracking-[0.14em] text-sx-accent">Suggested reply</p>
      </Frame>
    ),
  },
];

export function HomeExampleDay() {
  return (
    <section data-home-section="example-day" className="border-t border-sx-border bg-[#faf9f7]">
      <div className="mx-auto max-w-6xl px-4 py-[clamp(3.5rem,8vw,6rem)] sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.2em] text-sx-text-subtle">Example workflow</p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.5rem,3vw+0.4rem,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-sx-text">
            Imagine a busy restaurant.
          </h2>
          <p className="mt-3 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Nobody sits down to &ldquo;do marketing&rdquo;. The work shows up in the middle of a normal day. Here is
            what that day looks like when it is all in one place.
          </p>
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6 lg:gap-10">
          {MOMENTS.map((moment) => (
            <li key={moment.time} className="flex flex-col">
              <p className="font-sx-mono text-[10.5px] uppercase tracking-[0.2em] text-sx-accent">{moment.time}</p>
              <h3 className="mt-2.5 font-sx-sans text-[18px] font-semibold leading-snug tracking-[-0.015em] text-sx-text">
                {moment.title}
              </h3>
              <p className="mt-2 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">{moment.body}</p>
              <div className="mt-5">{moment.frame}</div>
            </li>
          ))}
        </ol>

        <p className="mt-10 font-sx-sans text-[12px] text-sx-text-subtle">
          An illustration of how the workflow fits together, not a customer story or a claim about results. Interfaces
          shown use sample data.
        </p>
      </div>
    </section>
  );
}
