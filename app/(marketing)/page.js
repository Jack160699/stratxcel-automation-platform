import Link from "next/link";
import { ChatDemo } from "@/app/components/ChatDemo";
import { Reveal } from "@/app/components/Reveal";
import {
  COLORS,
  STRATXCEL_APP_URL,
  whatsappHref,
} from "@/lib/constants";
import {
  PrimaryButton,
  GhostButton,
  SectionRule,
  CTARow,
  CTAMicrocopy,
  TrustChips,
} from "@/app/components/marketing-ui";

export const metadata = {
  title: "Stratxcel — AI operating system for businesses",
  description:
    "Run your business on a next-generation AI system: modules, agents, and automation in one operating environment — tiered by system complexity, not per-user pricing.",
};
import { PipelineRail } from "@/app/components/visuals/PipelineRail";

const { ink, brand, accent, surface, white } = COLORS;

function IconBriefcase({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M4 9h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M4 9V8a2 2 0 012-2h12a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconBolt({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 21h2l1-6h6.5l-8-11L9 15h4l-2 6z" />
    </svg>
  );
}

function IconTrend({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 16l6-6 4 4 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 8h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundColor: surface }} />
      <div
        className="absolute -top-52 left-1/2 h-[min(760px,92vw)] w-[min(760px,92vw)] -translate-x-1/2 rounded-full opacity-[0.88] blur-3xl"
        style={{
          background: `radial-gradient(circle at 38% 38%, ${accent}34 0%, transparent 58%)`,
        }}
      />
      <div
        className="absolute -right-28 top-24 h-[440px] w-[440px] rounded-full opacity-[0.78] blur-3xl"
        style={{
          background: `radial-gradient(circle, ${brand}28 0%, transparent 68%)`,
        }}
      />
      <div
        className="absolute -bottom-36 -left-28 h-[400px] w-[400px] rounded-full opacity-[0.68] blur-3xl"
        style={{
          background: `radial-gradient(circle, ${accent}22 0%, transparent 62%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.3]"
        style={{
          backgroundImage: `linear-gradient(to right, ${ink}05 1px, transparent 1px), linear-gradient(${ink}05 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(ellipse 85% 72% at 50% -5%, black 18%, transparent 72%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-300/55 to-transparent"
        aria-hidden
      />
    </div>
  );
}

function Sparkline() {
  const h = [38, 62, 46, 76, 52, 86, 58, 92, 68, 100];
  return (
    <div className="flex h-14 items-end gap-[3px] px-0.5">
      {h.map((pct, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-gradient-to-t from-slate-200/90 to-blue-500/85 transition-colors duration-200 ease-out group-hover:to-blue-500"
          style={{ height: `${pct}%`, opacity: 0.32 + (i / h.length) * 0.58 }}
        />
      ))}
    </div>
  );
}

function ProductMock() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none lg:justify-self-end">
      <div
        className="animate-sx-float pointer-events-none absolute -inset-10 rounded-[2rem] opacity-[0.52] blur-3xl"
        style={{
          background: `linear-gradient(115deg, ${accent}24, transparent 42%, ${brand}18)`,
        }}
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-2xl border border-white/55 bg-white/48 shadow-[0_24px_72px_-36px_rgba(11,18,32,0.22),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200/55 bg-gradient-to-r from-white/95 to-slate-50/90 px-4 py-3.5 sm:px-5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]/95" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]/95" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]/95" />
          </div>
          <div className="mx-auto flex max-w-[min(100%,15rem)] flex-1 items-center gap-2 rounded-lg border border-slate-200/70 bg-white/95 px-3 py-2 text-[11px] text-slate-400 shadow-sm">
            <span className="font-mono text-slate-300">⌘</span>
            <span className="truncate">Signals · pipelines · agents</span>
          </div>
        </div>

        <div className="flex min-h-[300px] sm:min-h-[340px] lg:min-h-[380px]">
          <aside className="hidden w-[3.25rem] shrink-0 flex-col items-center gap-2.5 border-r border-slate-200/45 bg-slate-50/35 py-4 sm:flex">
            {["◉", "◇", "▤", "◎"].map((g, i) => (
              <span
                key={i}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] text-slate-400 transition duration-200 hover:bg-white hover:text-slate-700 hover:shadow-md"
              >
                {g}
              </span>
            ))}
          </aside>

          <div className="min-w-0 flex-1 p-4 sm:p-6">
            <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { k: "Live pipelines", v: "12", sub: "prod" },
                { k: "System health", v: "99.2%", sub: "SLO" },
                { k: "Cycles / mo", v: "48k", sub: "auto" },
              ].map((stat) => (
                <div
                  key={stat.k}
                  className="group rounded-xl border border-slate-200/65 bg-white/90 px-2.5 py-3 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out motion-safe:hover:-translate-y-px hover:border-slate-200 hover:shadow-md"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {stat.k}
                  </p>
                  <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#0B1220]">
                    {stat.v}
                  </p>
                  <p className="text-[10px] text-slate-400">{stat.sub}</p>
                </div>
              ))}
            </div>

            <div className="group mb-5 flex items-end justify-between gap-3 rounded-xl border border-slate-200/55 bg-gradient-to-br from-white to-slate-50/95 p-3.5 shadow-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Throughput
                </p>
                <p className="mt-0.5 text-sm font-semibold tracking-tight text-[#0B1220]">
                  Lead → qualify → route
                </p>
              </div>
              <Sparkline />
            </div>

            <div className="space-y-2.5 rounded-xl border border-slate-200/55 bg-white/75 p-3.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/45" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]" />
                  </span>
                  <span className="text-xs font-semibold text-slate-800">System console</span>
                </div>
                <span className="rounded-md bg-emerald-500/[0.12] px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Nominal
                </span>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[92%] rounded-2xl rounded-br-md border border-slate-200/80 bg-slate-50/95 px-3.5 py-2.5 text-[13px] leading-snug text-slate-700 shadow-sm">
                  Show me where our handoffs break across CRM and ops.
                </div>
              </div>
              <div className="flex justify-start">
                <div
                  className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/25 px-3.5 py-2.5 text-[13px] leading-snug text-white shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${brand} 0%, ${accent} 100%)`,
                  }}
                >
                  Three modules diverge after qualification. I can normalize the schema and reopen
                  the pipeline in one pass.
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[70%] rounded-2xl rounded-br-md border border-slate-200/80 bg-slate-50/95 px-3.5 py-2.5 text-[13px] text-slate-700">
                  Apply it to staging first.
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5">
                <span className="flex-1 text-[12px] text-slate-400">Route a signal…</span>
                <span
                  className="rounded-lg px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-110"
                  style={{ backgroundColor: brand }}
                >
                  Run
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const exploreLinks = [
  {
    href: "/system",
    title: "System",
    body: "How the AI OS ingests signals, orchestrates modules, and keeps execution observable.",
  },
  {
    href: "/modules",
    title: "Modules",
    body: "Lead intelligence, workflow engine, agents, and automation — composed, not bolted on.",
  },
  {
    href: "/agents",
    title: "Agents",
    body: "Specialized operators that reason over your graph and call the right module APIs.",
  },
  {
    href: "/use-cases",
    title: "Use cases",
    body: "Founders, agencies, and local operators running production-grade systems.",
  },
  {
    href: "/pricing",
    title: "Pricing",
    body: "Tiered by system complexity and pipeline depth — never priced per seat.",
  },
];

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col" style={{ backgroundColor: surface }}>
      <HeroBackdrop />

      <main className="relative flex-1">
        <section className="relative overflow-hidden pt-7 pb-0 sm:pt-11 lg:pt-14 lg:pb-0">
          <div className="mx-auto grid max-w-6xl items-start gap-6 px-4 sm:gap-10 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-x-14 lg:gap-y-0 lg:px-8 xl:gap-x-[4.25rem]">
            <Reveal className="max-w-xl min-w-0 pt-0.5 lg:max-w-[36rem]">
              <p className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200/90 bg-white/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 shadow-sm backdrop-blur-md sm:mb-5 sm:px-3.5 sm:text-[11px] sm:tracking-[0.14em]">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: accent,
                    boxShadow: `0 0 12px ${accent}`,
                  }}
                />
                AI operating system
              </p>
              <h1 className="text-pretty text-[2rem] font-semibold leading-[1.06] tracking-[-0.045em] text-[#0B1220] sm:text-5xl sm:leading-[1.05] lg:text-[3.05rem] xl:text-[3.65rem] xl:leading-[1.03]">
                Run your business on a next-generation AI system
              </h1>
              <p className="mt-5 max-w-[32rem] text-[15px] leading-[1.64] tracking-[-0.012em] text-slate-600 sm:mt-6 sm:text-lg sm:leading-[1.72]">
                Stratxcel is not a single-purpose tool. It is an operating environment where modules,
                agents, and automation share context — so work moves as a system, not a ticket
                queue.
              </p>
              <p className="mt-4 max-w-[32rem] text-[14px] leading-[1.62] text-slate-500 sm:mt-5 sm:text-[16px] sm:leading-[1.65]">
                We help businesses capture leads, automate workflows, save time, and grow using AI
                systems.
              </p>
              <CTARow className="mt-8 sm:mt-9">
                <PrimaryButton href={whatsappHref} external>
                  Get started
                </PrimaryButton>
                <GhostButton href="/system">View system</GhostButton>
              </CTARow>
              <CTAMicrocopy className="max-w-[20rem] text-left sm:max-w-none sm:text-center">
                Opens WhatsApp · no obligation scoping — we reply with next steps, not spam
              </CTAMicrocopy>
              <p className="mt-6 text-[12px] font-medium tracking-wide text-slate-400 sm:mt-8 sm:text-[13px]">
                Systems, not seats. Modules, not feature checklists.
              </p>
            </Reveal>
            <Reveal className="-mt-1 self-start lg:-mt-2 lg:justify-self-end xl:-mt-3" delay={120}>
              <ProductMock />
            </Reveal>
          </div>

          <div className="mt-10 w-full border-t border-slate-200/55 bg-white sm:mt-14">
            <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
              <Reveal delay={200}>
                <div>
                  <p className="text-center text-[12px] font-medium leading-snug tracking-wide text-slate-500 sm:text-[13px] md:text-sm">
                    Built for teams who ship operating software, not slide decks
                  </p>
                  <div className="mt-6 sm:mt-7">
                    <TrustChips
                      items={[
                        "Custom-built systems",
                        "Fast rollout",
                        "Founder-led execution",
                        "Built for modern businesses",
                      ]}
                    />
                  </div>
                  <dl className="mt-7 grid grid-cols-1 gap-5 border-t border-slate-100 pt-7 sm:mt-9 sm:grid-cols-3 sm:gap-6 sm:pt-9 md:gap-8">
                    {[
                      { value: "∞", label: "Systems designed" },
                      { value: "24/7", label: "Pipeline observability" },
                      { value: "0", label: "Per-seat tax" },
                    ].map((m) => (
                      <div key={m.label} className="text-center">
                        <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                          {m.label}
                        </dt>
                        <dd className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-[#0B1220] sm:text-[1.6rem]">
                          {m.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-10">
                    <PipelineRail
                      stages={[
                        "Signal capture",
                        "Normalize & score",
                        "Module routing",
                        "Human checkpoint",
                        "Execution & log",
                      ]}
                    />
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200/35 py-12 sm:py-16 lg:py-20" style={{ backgroundColor: surface }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.22em]">
                  Map the OS
                </p>
                <h2 className="mt-2.5 text-pretty text-[1.5rem] font-semibold leading-[1.12] tracking-[-0.035em] text-[#0B1220] sm:mt-3 sm:text-3xl lg:text-[2.05rem]">
                  Explore the system surface
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-slate-600 sm:mt-4 sm:text-base">
                  Each page is a slice of the same architecture — read in any order, deploy in
                  sequence.
                </p>
              </div>
            </Reveal>
            <ul className="mt-9 grid gap-2.5 sm:mt-11 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 lg:gap-4">
              {exploreLinks.map((item, i) => (
                <Reveal key={item.href} delay={40 + i * 50}>
                  <li>
                    <Link
                      href={item.href}
                      className="group flex h-full flex-col rounded-2xl border border-slate-200/65 bg-white/80 p-5 shadow-[0_12px_40px_-28px_rgba(11,18,32,0.1)] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out motion-safe:hover:-translate-y-px hover:border-slate-200/90 hover:bg-white hover:shadow-[0_18px_48px_-26px_rgba(30,58,138,0.12)] sm:p-7"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="mt-3 text-lg font-semibold tracking-[-0.02em] text-[#0B1220] group-hover:text-blue-900">
                        {item.title}
                      </span>
                      <span className="mt-2 text-[14px] leading-relaxed text-slate-600">{item.body}</span>
                      <span className="mt-5 text-[13px] font-semibold text-blue-700 transition group-hover:translate-x-0.5">
                        Open →
                      </span>
                    </Link>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-slate-200/35 py-12 sm:py-16 lg:py-20" style={{ backgroundColor: white }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.22em]">
                  Business impact
                </p>
                <h2 className="mt-2.5 text-pretty text-[1.5rem] font-semibold leading-[1.12] tracking-[-0.035em] text-[#0B1220] sm:mt-3 sm:text-3xl lg:text-[2.05rem]">
                  Before vs after Stratxcel
                </h2>
              </div>
            </Reveal>
            <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-4">
              <Reveal delay={60}>
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-6 shadow-[0_14px_44px_-30px_rgba(11,18,32,0.12)] sm:p-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Before</p>
                  <ul className="mt-4 space-y-3 text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                    {[
                      "Missed leads",
                      "Manual repetitive work",
                      "Slow responses",
                      "Operational chaos",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span className="mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_18px_50px_-28px_rgba(30,58,138,0.16)] sm:p-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">After</p>
                  <ul className="mt-4 space-y-3 text-[14px] leading-relaxed text-slate-700 sm:text-[15px]">
                    {[
                      "Automated lead capture",
                      "Faster workflows",
                      "Instant responses",
                      "Structured growth systems",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <span
                          className="mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: accent }}
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200/35 py-12 sm:py-16 lg:py-20" style={{ backgroundColor: surface }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.22em]">
                  Mini use cases
                </p>
                <h2 className="mt-2.5 text-pretty text-[1.5rem] font-semibold leading-[1.12] tracking-[-0.035em] text-[#0B1220] sm:mt-3 sm:text-3xl lg:text-[2.05rem]">
                  Where teams see fast wins
                </h2>
              </div>
            </Reveal>
            <ul className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4">
              {[
                {
                  title: "Agency",
                  body: "Automated lead qualification + follow-ups",
                },
                {
                  title: "Local business",
                  body: "WhatsApp bookings + customer response automation",
                },
                {
                  title: "Founder",
                  body: "Lead capture + CRM + workflow systems",
                },
              ].map((item, i) => (
                <Reveal key={item.title} delay={60 + i * 70}>
                  <li className="rounded-2xl border border-slate-200/65 bg-white p-5 shadow-[0_14px_42px_-30px_rgba(11,18,32,0.12)] sm:p-6">
                    <p className="text-[14px] font-semibold tracking-[-0.02em] text-[#0B1220]">{item.title}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-600 sm:text-[14px]">{item.body}</p>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section id="chat-demo" className="border-t border-slate-200/35 py-12 sm:py-16 lg:py-20" style={{ backgroundColor: surface }}>
          <Reveal>
            <ChatDemo />
          </Reveal>
        </section>

        <SectionRule />

        <section
          id="insights"
          className="border-y border-slate-200/40 py-16 sm:py-20 lg:py-28"
          style={{ backgroundColor: surface }}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-[#F8FAFC] via-white to-slate-50/90 p-6 shadow-[0_24px_70px_-40px_rgba(11,18,32,0.15)] sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:p-10">
                <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-blue-500/[0.06] blur-3xl" aria-hidden />
                <div className="relative max-w-xl min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.2em]">
                    Stratxcel AI
                  </p>
                  <h2 className="mt-2.5 text-pretty text-xl font-semibold tracking-[-0.035em] text-[#0B1220] sm:mt-3 sm:text-2xl lg:text-[1.85rem]">
                    Probe your workflows from the control plane
                  </h2>
                  <p className="mt-3 text-[14px] leading-relaxed text-slate-600 sm:mt-4 sm:text-base">
                    The hosted surface for quick experiments — not a replacement for a dedicated
                    system, but a fast way to stress-test ideas before they go production.
                  </p>
                  <p className="mt-3 text-[12px] leading-snug text-slate-500 sm:text-[13px]">
                    Same product team behind the OS — your experiments stay compatible with how we
                    ship in production.
                  </p>
                </div>
                <div className="relative mt-6 w-full shrink-0 sm:mt-7 lg:mt-0 lg:w-auto">
                  <PrimaryButton href={STRATXCEL_APP_URL} external className="w-full sm:w-auto">
                    Get started
                  </PrimaryButton>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <div className="bg-gradient-to-b from-transparent via-slate-100/30 to-transparent py-px">
          <SectionRule />
        </div>

        <section id="modules-teaser" className="py-16 sm:py-20 lg:py-28" style={{ backgroundColor: white }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.22em]">
                  Modules
                </p>
                <h2 className="mt-3 text-pretty text-[1.65rem] font-semibold leading-tight tracking-[-0.035em] text-[#0B1220] sm:text-4xl lg:text-[2.4rem]">
                  Compose capability, not features
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-600 sm:mt-5 sm:text-base">
                  Each module exposes contracts to the rest of the OS — data in, decisions out,
                  telemetry everywhere.
                </p>
              </div>
            </Reveal>
            <div className="mt-11 grid gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-5 lg:mt-16 lg:grid-cols-3 lg:gap-6">
              {[
                {
                  title: "Lead intelligence",
                  body: "Scoring, enrichment, and routing that respects your graph — not a black-box CRM bolt-on.",
                  Icon: IconTrend,
                  href: "/modules#lead",
                },
                {
                  title: "Workflow engine",
                  body: "Deterministic steps where you need compliance; flexible branches where you need speed.",
                  Icon: IconBriefcase,
                  href: "/modules#workflow",
                },
                {
                  title: "Agents & automation",
                  body: "Operators that call tools, file PRs into your systems, and escalate with full context.",
                  Icon: IconBolt,
                  href: "/modules#automation",
                },
              ].map((card, i) => (
                <Reveal key={card.title} delay={80 + i * 90}>
                  <Link
                    href={card.href}
                    className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/65 bg-[#F8FAFC]/50 p-6 shadow-[0_16px_48px_-28px_rgba(11,18,32,0.12)] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out motion-safe:hover:-translate-y-px hover:border-slate-200/80 hover:bg-white hover:shadow-[0_22px_56px_-24px_rgba(30,58,138,0.14)] sm:p-8"
                  >
                    <div
                      className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-300 ease-out group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(circle, ${accent}32 0%, transparent 70%)`,
                      }}
                      aria-hidden
                    />
                    <div
                      className="relative mb-7 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md ring-1 ring-white/25 transition-transform duration-200 ease-out motion-safe:group-hover:scale-[1.02]"
                      style={{
                        background: `linear-gradient(145deg, ${accent}, ${brand})`,
                      }}
                    >
                      <card.Icon className="h-5 w-5" />
                    </div>
                    <h3 className="relative text-lg font-semibold tracking-[-0.02em] text-[#0B1220]">
                      {card.title}
                    </h3>
                    <p className="relative mt-3 text-[15px] leading-relaxed text-slate-600">
                      {card.body}
                    </p>
                    <span className="relative mt-6 text-[13px] font-semibold text-blue-700">
                      Module detail →
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <SectionRule />

        <section id="use-cases" className="border-y border-slate-200/40 py-16 sm:py-20 lg:py-28" style={{ backgroundColor: surface }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.22em]">
                  Solutions
                </p>
                <h2 className="mt-3 text-pretty text-[1.65rem] font-semibold leading-tight tracking-[-0.035em] text-[#0B1220] sm:text-4xl lg:text-[2.4rem]">
                  Who runs the OS
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-600 sm:mt-5 sm:text-base">
                  Same substrate — different topologies. See how we tune the graph for your
                  operating model.
                </p>
              </div>
            </Reveal>
            <ul className="mx-auto mt-10 grid max-w-4xl gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-4">
              {[
                { label: "Founders", href: "/use-cases#founders", sub: "Capital-efficient systems" },
                { label: "Agencies", href: "/use-cases#agencies", sub: "Multi-client isolation" },
                { label: "Local businesses", href: "/use-cases#local", sub: "High-touch, low drag" },
              ].map((row, i) => (
                <Reveal key={row.label} delay={50 + i * 70}>
                  <li>
                    <Link
                      href={row.href}
                      className="flex h-full flex-col rounded-2xl border border-slate-200/60 bg-white px-4 py-7 text-center shadow-[0_12px_40px_-28px_rgba(11,18,32,0.1)] transition-[transform,box-shadow,border-color] duration-200 ease-out motion-safe:hover:-translate-y-px hover:border-slate-200/80 hover:shadow-[0_18px_48px_-26px_rgba(30,58,138,0.11)] sm:px-5 sm:py-8"
                    >
                      <span className="text-[15px] font-semibold tracking-[-0.02em] text-[#0B1220]">
                        {row.label}
                      </span>
                      <span className="mt-2 text-[13px] text-slate-500">{row.sub}</span>
                    </Link>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section id="whatsapp" className="border-t border-slate-200/35 py-16 sm:py-20 lg:py-28" style={{ backgroundColor: white }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-[1px] shadow-[0_28px_80px_-36px_rgba(11,18,32,0.2)]">
                <div
                  className="absolute inset-0 rounded-2xl opacity-[0.45]"
                  style={{
                    background: `linear-gradient(135deg, ${accent}18, transparent 50%, ${brand}12)`,
                  }}
                  aria-hidden
                />
                <div className="relative rounded-[1.05rem] bg-gradient-to-br from-white via-[#F8FAFC] to-slate-50/90 px-5 py-10 text-center sm:px-10 sm:py-12">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px] sm:tracking-[0.22em]">
                    Connect
                  </p>
                  <h2 className="mt-3 text-pretty text-[1.5rem] font-semibold leading-tight tracking-[-0.035em] text-[#0B1220] sm:mt-4 sm:text-3xl lg:text-[2.1rem]">
                    Talk with a systems architect
                  </h2>
                  <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-600 sm:mt-5 sm:text-base">
                    WhatsApp is the fastest path to scope a system — we respond with concrete next
                    steps, not a form letter.
                  </p>
                  <div className="mx-auto mt-7 flex max-w-xs flex-col items-stretch sm:mt-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4">
                    <PrimaryButton href={whatsappHref} external className="!w-full sm:!w-auto">
                      Get started
                    </PrimaryButton>
                  </div>
                  <CTAMicrocopy className="mt-2 sm:mt-3">
                    Direct line to builders — not a call center queue
                  </CTAMicrocopy>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section id="cta-final" className="border-t border-slate-200/35 bg-[#F8FAFC] pb-16 pt-16 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="relative">
                <div
                  className="sx-cta-glow pointer-events-none absolute -inset-1 rounded-[2.1rem] opacity-65 blur-xl"
                  style={{
                    background: `linear-gradient(135deg, ${accent}45, ${brand}38, transparent 55%)`,
                  }}
                  aria-hidden
                />
                <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0B1220] via-[#0c1628] to-[#1E3A8A] p-[1px] shadow-[0_40px_100px_-36px_rgba(11,18,32,0.55)]">
                  <div className="relative rounded-[1.97rem] bg-gradient-to-br from-white/[0.08] via-transparent to-blue-600/10 px-5 py-11 text-center backdrop-blur-xl sm:px-12 sm:py-14 md:px-14 md:py-16">
                    <div
                      className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full opacity-45 blur-3xl"
                      style={{ background: accent }}
                      aria-hidden
                    />
                    <div
                      className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full opacity-32 blur-3xl"
                      style={{ background: brand }}
                      aria-hidden
                    />
                    <h2 className="relative text-pretty text-[1.55rem] font-semibold leading-[1.14] tracking-[-0.035em] text-white sm:text-3xl md:text-4xl lg:text-[2.45rem]">
                      Commission your next production system
                    </h2>
                    <p className="relative mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-slate-300 sm:mt-6 sm:text-[17px]">
                      From discovery to live pipelines — we stay until the OS is measurable.
                    </p>
                    <p className="relative mx-auto mt-3 max-w-md text-[12px] leading-snug text-slate-500 sm:text-[13px]">
                      NDA-friendly scoping · milestones tied to working software, not decks
                    </p>
                    <CTARow className="relative mt-9 sm:mt-10">
                      <PrimaryButton href={whatsappHref} external>
                        Get started
                      </PrimaryButton>
                      <GhostButton href="/pricing" tone="dark">
                        View pricing
                      </GhostButton>
                    </CTARow>
                    <CTAMicrocopy dark={true} className="relative mt-2 max-w-sm sm:mx-auto">
                      Opens WhatsApp · we reply when we can add signal, not noise
                    </CTAMicrocopy>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
    </div>
  );
}
