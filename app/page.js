import Link from "next/link";
import { ChatDemo } from "./components/ChatDemo";
import { Navbar } from "./components/Navbar";
import { Reveal } from "./components/Reveal";
import { Logo } from "./components/Logo";
import {
  COLORS,
  CONTACT_EMAIL,
  STRATXCEL_APP_URL,
  whatsappHref,
} from "@/lib/constants";

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
          className="w-[3px] rounded-full bg-gradient-to-t from-slate-200/90 to-blue-500/85 transition duration-500 group-hover:to-blue-500"
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
            <span className="truncate">Ops, finance, CX…</span>
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
                { k: "Margin", v: "+12%", sub: "QoQ" },
                { k: "Run rate", v: "94%", sub: "auto" },
                { k: "Hours saved", v: "240", sub: "mo" },
              ].map((stat) => (
                <div
                  key={stat.k}
                  className="group rounded-xl border border-slate-200/65 bg-white/90 px-2.5 py-3 shadow-sm transition duration-300 hover:border-slate-200 hover:shadow-md"
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
                  Pipeline health
                </p>
                <p className="mt-0.5 text-sm font-semibold tracking-tight text-[#0B1220]">
                  Strategy → automation
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
                  <span className="text-xs font-semibold text-slate-800">Stratxcel AI</span>
                </div>
                <span className="rounded-md bg-emerald-500/[0.12] px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Live
                </span>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[92%] rounded-2xl rounded-br-md border border-slate-200/80 bg-slate-50/95 px-3.5 py-2.5 text-[13px] leading-snug text-slate-700 shadow-sm">
                  Map our quote-to-cash process and show where we lose time.
                </div>
              </div>
              <div className="flex justify-start">
                <div
                  className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/25 px-3.5 py-2.5 text-[13px] leading-snug text-white shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${brand} 0%, ${accent} 100%)`,
                  }}
                >
                  Found 6 bottlenecks. I can automate three this week and route approvals by
                  rule.
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[70%] rounded-2xl rounded-br-md border border-slate-200/80 bg-slate-50/95 px-3.5 py-2.5 text-[13px] text-slate-700">
                  Let&apos;s ship it.
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5">
                <span className="flex-1 text-[12px] text-slate-400">Ask anything…</span>
                <span
                  className="rounded-lg px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-110"
                  style={{ backgroundColor: brand }}
                >
                  Send
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionRule() {
  return (
    <div className="mx-auto max-w-5xl px-6">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-300/55 to-transparent" />
    </div>
  );
}

function PrimaryButton({ href, children, external }) {
  const cls =
    "inline-flex h-11 min-h-[44px] w-full items-center justify-center rounded-full px-7 text-[14px] font-semibold tracking-tight text-white shadow-[0_8px_28px_-10px_rgba(30,58,138,0.42)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_14px_38px_-12px_rgba(59,130,246,0.38)] active:translate-y-0 sm:w-auto";
  const style = {
    background: `linear-gradient(135deg, ${accent} 0%, ${brand} 58%, ${brand} 100%)`,
  };
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  );
}

function GhostButton({ href, children, external }) {
  const cls =
    "inline-flex h-11 min-h-[44px] w-full items-center justify-center rounded-full border border-slate-200/90 bg-white px-7 text-[14px] font-semibold tracking-tight text-[#0B1220] shadow-[0_3px_20px_-8px_rgba(11,18,32,0.08)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-slate-300/90 hover:bg-slate-50/90 hover:shadow-[0_10px_32px_-10px_rgba(11,18,32,0.12)] active:translate-y-0 sm:w-auto";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return <Link href={href} className={cls}>{children}</Link>;
}

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col" style={{ backgroundColor: surface }}>
      <HeroBackdrop />
      <Navbar />

      <main className="relative flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden pt-10 pb-0 sm:pt-14 lg:pt-16 lg:pb-0">
          <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 sm:gap-12 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-x-14 lg:gap-y-0 lg:px-8 xl:gap-x-[4.25rem]">
            <Reveal className="max-w-xl pt-1 lg:max-w-[36rem]">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 shadow-sm backdrop-blur-md">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: accent,
                    boxShadow: `0 0 12px ${accent}`,
                  }}
                />
                Consulting + AI automation
              </p>
              <h1 className="text-[2.45rem] font-semibold leading-[1.07] tracking-[-0.045em] text-[#0B1220] sm:text-5xl sm:leading-[1.05] lg:text-[3.2rem] xl:text-[3.85rem] xl:leading-[1.03]">
                Build smarter businesses with AI
              </h1>
              <p className="mt-7 max-w-[32rem] text-[17px] leading-[1.68] tracking-[-0.015em] text-slate-600 sm:text-lg sm:leading-[1.72]">
                We combine business consulting with AI automation to help you scale faster, reduce
                costs, and operate efficiently.
              </p>
              <p className="mt-5 max-w-[32rem] text-[15px] leading-[1.65] text-slate-500 sm:text-[16px]">
                From strategy to execution — Stratxcel designs and automates your business systems.
              </p>
              <div className="mt-10 flex flex-col gap-3.5 sm:flex-row sm:items-stretch sm:gap-4">
                <PrimaryButton href={whatsappHref} external>
                  Get Started
                </PrimaryButton>
                <GhostButton href={whatsappHref} external>
                  Chat on WhatsApp
                </GhostButton>
              </div>
              <p className="mt-10 text-[13px] font-medium tracking-wide text-slate-400">
                Not just automation. Real business systems.
              </p>
            </Reveal>
            <Reveal
              className="-mt-1 self-start lg:-mt-2 lg:justify-self-end xl:-mt-3"
              delay={120}
            >
              <ProductMock />
            </Reveal>
          </div>

          {/* Trust strip */}
          <div className="mt-16 w-full border-t border-slate-200/55 bg-white sm:mt-20">
            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
              <Reveal delay={200}>
                <div>
                  <p className="text-center text-[13px] font-medium leading-snug tracking-wide text-slate-500 sm:text-sm">
                    Helping founders and growing teams scale smarter
                  </p>
                  <dl className="mt-10 grid grid-cols-1 gap-8 border-t border-slate-100 pt-10 sm:mt-12 sm:grid-cols-3 sm:gap-10 sm:pt-12">
                    {[
                      { value: "150+", label: "Workflows mapped" },
                      { value: "40%", label: "Avg. efficiency lift" },
                      { value: "24/7", label: "Systems monitored" },
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
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Interactive chat preview */}
        <section
          id="chat-demo"
          className="border-t border-slate-200/35 py-20 sm:py-24 lg:py-28"
          style={{ backgroundColor: surface }}
        >
          <Reveal>
            <ChatDemo />
          </Reveal>
        </section>

        <SectionRule />

        {/* Free insights — Stratxcel AI */}
        <section
          id="insights"
          className="border-y border-slate-200/40 py-28 sm:py-32 lg:py-40"
          style={{ backgroundColor: surface }}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-[#F8FAFC] via-white to-slate-50/90 p-8 shadow-[0_24px_70px_-40px_rgba(11,18,32,0.15)] sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:p-12">
                <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-blue-500/[0.06] blur-3xl" aria-hidden />
                <div className="relative max-w-xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Stratxcel AI
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-[#0B1220] sm:text-3xl lg:text-[2rem]">
                    Get free business insights instantly
                  </h2>
                  <p className="mt-4 text-[15px] leading-relaxed text-slate-600 sm:text-base">
                    Use Stratxcel AI to analyze your workflows, identify inefficiencies, and
                    discover automation opportunities.
                  </p>
                </div>
                <div className="relative mt-8 flex shrink-0 lg:mt-0">
                  <a
                    href={STRATXCEL_APP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 min-h-[44px] w-full items-center justify-center rounded-full px-7 text-[14px] font-semibold text-white shadow-[0_8px_28px_-10px_rgba(30,58,138,0.4)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_12px_34px_-10px_rgba(59,130,246,0.34)] sm:w-auto"
                    style={{
                      background: `linear-gradient(135deg, ${accent} 0%, ${brand} 100%)`,
                    }}
                  >
                    Try it free
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <div className="bg-gradient-to-b from-transparent via-slate-100/30 to-transparent py-px">
          <SectionRule />
        </div>

        {/* Features */}
        <section
          id="features"
          className="py-28 sm:py-32 lg:py-40"
          style={{ backgroundColor: white }}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  How we work
                </p>
                <h2 className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-[#0B1220] sm:text-4xl lg:text-[2.5rem]">
                  Business first. Then intelligent systems.
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-slate-600">
                  We help you design, optimize, and automate — so technology serves your strategy,
                  not the other way around.
                </p>
              </div>
            </Reveal>
            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:mt-24 lg:grid-cols-3 lg:gap-8">
              {[
                {
                  title: "Business Consulting",
                  body: "We analyze your workflows and identify opportunities to improve efficiency and growth.",
                  Icon: IconBriefcase,
                },
                {
                  title: "AI Automation",
                  body: "We build intelligent systems that automate your operations end-to-end.",
                  Icon: IconBolt,
                },
                {
                  title: "Growth Systems",
                  body: "We optimize your processes to scale faster with less manual effort.",
                  Icon: IconTrend,
                },
              ].map((card, i) => (
                <Reveal key={card.title} delay={80 + i * 90}>
                  <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/65 bg-[#F8FAFC]/50 p-8 shadow-[0_16px_48px_-28px_rgba(11,18,32,0.12)] transition duration-500 ease-out hover:-translate-y-1 hover:border-slate-200/80 hover:bg-white hover:shadow-[0_22px_56px_-24px_rgba(30,58,138,0.14)]">
                    <div
                      className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition duration-500 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(circle, ${accent}32 0%, transparent 70%)`,
                      }}
                      aria-hidden
                    />
                    <div
                      className="absolute inset-x-0 top-0 h-px opacity-0 transition duration-500 group-hover:opacity-100"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${accent}80, transparent)`,
                      }}
                    />
                    <div
                      className="relative mb-7 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md ring-1 ring-white/25 transition duration-300 group-hover:scale-[1.03]"
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
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <SectionRule />

        {/* Use cases */}
        <section
          id="use-cases"
          className="border-y border-slate-200/40 py-28 sm:py-32 lg:py-40"
          style={{ backgroundColor: surface }}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Where we help
                </p>
                <h2 className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-[#0B1220] sm:text-4xl lg:text-[2.5rem]">
                  Practical outcomes
                </h2>
                <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-slate-600">
                  Real work, not slide decks — systems your team uses every day.
                </p>
              </div>
            </Reveal>
            <ul className="mx-auto mt-16 grid max-w-5xl gap-4 sm:mt-20 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
              {[
                "Automate customer support responses",
                "Qualify leads automatically",
                "Streamline internal workflows",
                "Build AI assistants for teams",
              ].map((item, i) => (
                <Reveal key={item} delay={50 + i * 60}>
                  <li className="group flex h-full flex-col rounded-2xl border border-slate-200/60 bg-white px-5 py-8 text-center shadow-[0_12px_40px_-28px_rgba(11,18,32,0.1)] transition duration-300 hover:-translate-y-0.5 hover:border-slate-200/80 hover:shadow-[0_18px_48px_-26px_rgba(30,58,138,0.11)]">
                    <span className="mb-4 text-[11px] font-semibold tabular-nums tracking-widest text-slate-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[14px] font-semibold leading-snug tracking-[-0.02em] text-[#0B1220]">
                      {item}
                    </span>
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* WhatsApp */}
        <section
          id="whatsapp"
          className="border-t border-slate-200/35 py-28 sm:py-32 lg:py-40"
          style={{ backgroundColor: white }}
        >
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
                <div className="relative rounded-[1.05rem] bg-gradient-to-br from-white via-[#F8FAFC] to-slate-50/90 px-6 py-14 text-center sm:px-12 sm:py-16">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    WhatsApp
                  </p>
                  <h2 className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-[-0.035em] text-[#0B1220] sm:text-3xl lg:text-[2.25rem]">
                    Talk to a business AI consultant
                  </h2>
                  <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-slate-600">
                    Get instant advice on automation, growth, and business systems.
                  </p>
                  <div className="mt-10">
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 min-h-[44px] items-center justify-center rounded-full border border-slate-200/80 bg-[#0B1220] px-8 text-[14px] font-semibold tracking-tight text-white shadow-[0_10px_32px_-10px_rgba(11,18,32,0.3)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#152036] hover:shadow-[0_16px_40px_-10px_rgba(30,58,138,0.28)]"
                    >
                      Open WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section
          id="cta-final"
          className="border-t border-slate-200/35 bg-[#F8FAFC] pb-28 pt-28 sm:pb-36 sm:pt-32 lg:pb-44 lg:pt-40"
        >
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
                  <div className="relative rounded-[1.97rem] bg-gradient-to-br from-white/[0.08] via-transparent to-blue-600/10 px-6 py-16 text-center backdrop-blur-xl sm:px-14 sm:py-20">
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
                    <h2 className="relative text-[1.85rem] font-semibold leading-[1.15] tracking-[-0.035em] text-white sm:text-4xl lg:text-[2.65rem]">
                      Start building smarter systems today
                    </h2>
                    <p className="relative mx-auto mt-6 max-w-md text-base leading-relaxed text-slate-300 sm:text-[17px]">
                      Transform your business with consulting + AI automation
                    </p>
                    <div className="relative mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                      <PrimaryButton href={STRATXCEL_APP_URL} external>
                        Try Stratxcel AI
                      </PrimaryButton>
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-11 min-h-[44px] w-full items-center justify-center rounded-full border border-white/25 bg-white/10 px-7 text-[14px] font-semibold tracking-tight text-white backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/18 hover:shadow-[0_12px_36px_-12px_rgba(59,130,246,0.25)] sm:w-auto"
                      >
                        Chat on WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/10 bg-[#0B1220] text-slate-300">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent"
          aria-hidden
        />
        <div className="mx-auto grid max-w-6xl gap-14 px-4 py-16 sm:grid-cols-2 sm:gap-12 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:py-20">
          <div className="lg:col-span-5">
            <Logo variant="dark" />
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-slate-400">
              Business systems, powered by AI
            </p>
          </div>
          <div className="flex flex-wrap gap-12 sm:gap-16 lg:col-span-4 lg:justify-end">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Product
              </p>
              <ul className="mt-5 space-y-3 text-[15px] text-slate-400">
                <li>
                  <a href="#features" className="transition hover:text-white">
                    What we do
                  </a>
                </li>
                <li>
                  <a href="#insights" className="transition hover:text-white">
                    Insights
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Contact
              </p>
              <ul className="mt-5 space-y-3 text-[15px] text-slate-400">
                <li>
                  <a href="#whatsapp" className="transition hover:text-white">
                    WhatsApp
                  </a>
                </li>
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="transition hover:text-white">
                    {CONTACT_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-6xl border-t border-white/[0.08] px-4 py-8 text-center text-[13px] text-slate-500 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Stratxcel. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
