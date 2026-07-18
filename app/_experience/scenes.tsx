"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { ContactForm } from "@/app/components/ContactForm";
import { CONTACT_EMAIL, whatsappHref } from "@/lib/constants";
import {
  AGENT_STEPS,
  CAPABILITIES,
  CASE_STUDIES,
  CHAOS_FRAGMENTS,
  ECOSYSTEM_NODES,
  EXPLORE_LINKS,
  type Capability,
} from "./content";

export { Mark } from "@/app/components/Mark";
import { Mark } from "@/app/components/Mark";

const layer =
  "pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-6";

/* ————————————————— Scene 1 · Identity ————————————————— */

export function SceneIdentity() {
  return (
    <section data-scene="identity" className={layer} aria-label="Stratxcel identity">
      <div className="max-w-4xl text-center">
        <p data-reveal className="sx-kicker">
          initializing · stratxcel os
        </p>
        <h1
          data-reveal
          className="sx-display sx-glow-text mt-6 text-[clamp(3rem,9vw,7.5rem)] text-white"
        >
          Stratxcel
        </h1>
        <p
          data-reveal
          className="mx-auto mt-6 max-w-xl text-balance text-[clamp(1rem,2vw,1.35rem)] font-light text-slate-300"
        >
          Not an agency. An <span className="text-white">operating system</span>{" "}
          for modern business — everything grows from a single intelligent core.
        </p>
      </div>
    </section>
  );
}

/* ————————————————— Scene 2 · Chaos ————————————————— */

const FRAG_POSITIONS = [
  { x: "-34vw", y: "-26vh", r: -7 },
  { x: "26vw", y: "-30vh", r: 5 },
  { x: "-38vw", y: "10vh", r: 4 },
  { x: "34vw", y: "6vh", r: -4 },
  { x: "-16vw", y: "30vh", r: 6 },
  { x: "20vw", y: "28vh", r: -6 },
  { x: "-6vw", y: "-34vh", r: 3 },
  { x: "8vw", y: "16vh", r: -3 },
];

export function SceneChaos() {
  return (
    <section data-scene="chaos" className={layer} aria-label="The problem">
      <div className="relative flex h-full w-full max-w-6xl items-center justify-center">
        {CHAOS_FRAGMENTS.map((frag, i) => {
          const p = FRAG_POSITIONS[i % FRAG_POSITIONS.length];
          return (
            <span
              key={frag}
              data-frag
              className="sx-glass absolute rounded-lg px-4 py-2 font-mono text-[clamp(10px,1.4vw,13px)] tracking-wide text-slate-300/90"
              style={{
                transform: `translate(${p.x}, ${p.y}) rotate(${p.r}deg)`,
              }}
            >
              {frag}
            </span>
          );
        })}
        <div className="text-center">
          <p data-chaos-head className="sx-kicker">
            the way most businesses run
          </p>
          <h2
            data-chaos-head
            className="sx-display mt-5 text-[clamp(2.2rem,6vw,4.6rem)] text-white"
          >
            Chaos, everywhere.
          </h2>
          <h2
            data-chaos-order
            className="sx-display mt-8 text-[clamp(1.6rem,4vw,3rem)] text-transparent [background:linear-gradient(90deg,#45c4ff,#8b5cf6)] [background-clip:text] [-webkit-background-clip:text]"
          >
            Until it collapses into one system.
          </h2>
        </div>
      </div>
    </section>
  );
}

/* ————————————————— Scene 3 · Capabilities ————————————————— */

function WebVisual() {
  return (
    <div className="sx-glass relative w-full max-w-md overflow-hidden rounded-2xl p-4">
      <div className="flex gap-1.5 pb-3">
        <span className="h-2 w-2 rounded-full bg-white/25" />
        <span className="h-2 w-2 rounded-full bg-white/25" />
        <span className="h-2 w-2 rounded-full bg-[#45c4ff]/70" />
      </div>
      <svg viewBox="0 0 320 190" fill="none" className="w-full">
        <g stroke="#45c4ff" strokeWidth="2" strokeLinecap="round">
          <path data-draw pathLength={1} d="M14 22 H120" />
          <path data-draw pathLength={1} d="M232 22 H306" />
          <path data-draw pathLength={1} d="M14 62 H210" strokeWidth="6" opacity="0.9" />
          <path data-draw pathLength={1} d="M14 84 H160" strokeWidth="6" opacity="0.5" />
          <path data-draw pathLength={1} d="M14 122 H92 V150 H14 Z" opacity="0.8" />
          <path data-draw pathLength={1} d="M116 122 H194 V150 H116 Z" opacity="0.55" />
          <path data-draw pathLength={1} d="M218 122 H306 V150 H218 Z" opacity="0.35" />
          <path data-draw pathLength={1} d="M14 174 H74 V178 H14 Z" stroke="#8b5cf6" />
        </g>
      </svg>
      <span
        data-reveal
        className="absolute right-4 top-4 rounded-full bg-emerald-400/15 px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] text-emerald-300"
      >
        LIVE
      </span>
    </div>
  );
}

function AutomationVisual() {
  const nodes = [
    { x: 34, y: 40, label: "CRM" },
    { x: 160, y: 20, label: "MAIL" },
    { x: 286, y: 44, label: "WA" },
    { x: 80, y: 150, label: "SHEET" },
    { x: 236, y: 150, label: "PAY" },
  ];
  return (
    <div className="sx-glass w-full max-w-md rounded-2xl p-6">
      <svg viewBox="0 0 320 190" fill="none" className="w-full">
        <g stroke="#38bdf8" strokeWidth="1.6" opacity="0.85">
          <path data-draw pathLength={1} d="M34 40 C 90 8, 120 8, 160 20" />
          <path data-draw pathLength={1} d="M160 20 C 210 8, 250 16, 286 44" />
          <path data-draw pathLength={1} d="M34 40 C 30 110, 40 130, 80 150" />
          <path data-draw pathLength={1} d="M286 44 C 290 110, 276 130, 236 150" />
          <path data-draw pathLength={1} d="M80 150 C 140 178, 180 178, 236 150" />
          <path data-draw pathLength={1} d="M160 20 C 150 90, 130 110, 80 150" strokeDasharray="0 0" opacity="0.5" />
        </g>
        {nodes.map((n) => (
          <g key={n.label}>
            <circle cx={n.x} cy={n.y} r="14" fill="rgba(69,196,255,0.08)" stroke="#45c4ff" strokeWidth="1.4" />
            <text x={n.x} y={n.y + 3} textAnchor="middle" fontSize="8" fontFamily="monospace" fill="#bfe7ff" letterSpacing="1">
              {n.label}
            </text>
          </g>
        ))}
      </svg>
      <p data-reveal className="mt-3 text-center font-mono text-[11px] tracking-[0.25em] text-sky-300/80">
        EVERY TOOL · ONE NERVOUS SYSTEM
      </p>
    </div>
  );
}

function AiVisual() {
  return (
    <div className="relative flex w-full max-w-md items-center justify-center py-6">
      <svg viewBox="0 0 320 220" fill="none" className="w-full">
        <circle cx="160" cy="110" r="26" fill="rgba(139,92,246,0.25)" stroke="#a78bfa" strokeWidth="1.6" />
        <circle data-draw pathLength={1} cx="160" cy="110" r="52" stroke="rgba(167,139,250,0.5)" strokeWidth="1.2" />
        <circle data-draw pathLength={1} cx="160" cy="110" r="82" stroke="rgba(69,196,255,0.35)" strokeWidth="1" />
        <g stroke="#45c4ff" strokeWidth="1.4" strokeLinecap="round">
          <path data-draw pathLength={1} d="M160 58 V 24" />
          <path data-draw pathLength={1} d="M212 110 H 260" />
          <path data-draw pathLength={1} d="M108 110 H 60" />
          <path data-draw pathLength={1} d="M196 74 L 232 42" />
          <path data-draw pathLength={1} d="M124 146 L 88 178" />
        </g>
        <text x="160" y="114" textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#e9d5ff" letterSpacing="2">
          THINK
        </text>
      </svg>
      <span
        data-reveal
        className="sx-glass absolute bottom-2 rounded-full px-4 py-1.5 font-mono text-[11px] tracking-[0.2em] text-violet-200"
      >
        REASON → PLAN → ACT
      </span>
    </div>
  );
}

function BrandVisual() {
  return (
    <div className="relative flex w-full max-w-md items-center justify-center py-4">
      <span
        className="sx-display select-none text-[7rem] text-transparent"
        style={{ WebkitTextStroke: "1px rgba(148,163,184,0.5)" }}
      >
        S
      </span>
      <span
        data-reveal
        className="sx-display absolute select-none bg-gradient-to-br from-[#45c4ff] via-[#8b5cf6] to-[#1e3a8a] bg-clip-text text-[7rem] text-transparent drop-shadow-[0_0_30px_rgba(139,92,246,0.45)]"
      >
        S
      </span>
      <span
        data-reveal
        className="absolute -bottom-2 font-mono text-[11px] tracking-[0.3em] text-slate-400"
      >
        EMPTY → ICONIC
      </span>
    </div>
  );
}

function AppsVisual() {
  return (
    <div className="relative w-full max-w-md py-2">
      <div className="rounded-2xl border-2 border-dashed border-slate-500/50 p-5">
        <div className="h-3 w-2/5 rounded border border-dashed border-slate-500/50" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-14 rounded border border-dashed border-slate-500/40" />
          <div className="h-14 rounded border border-dashed border-slate-500/40" />
          <div className="h-14 rounded border border-dashed border-slate-500/40" />
        </div>
        <div className="mt-3 h-16 rounded border border-dashed border-slate-500/40" />
      </div>
      <div data-reveal className="sx-glass absolute inset-0 rounded-2xl p-5">
        <div className="h-3 w-2/5 rounded bg-gradient-to-r from-[#45c4ff] to-[#3b82f6]" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[38, 62, 84].map((h) => (
            <div key={h} className="flex h-14 items-end rounded bg-white/[0.05] p-1.5">
              <div
                className="w-full rounded-sm bg-gradient-to-t from-[#1e3a8a] to-[#45c4ff]"
                style={{ height: `${h}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex h-16 items-center justify-between rounded bg-white/[0.05] px-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-sky-200">SHIPPED v1.0</span>
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        </div>
      </div>
    </div>
  );
}

const CAP_VISUALS: Record<Capability["visual"], () => ReactElement> = {
  web: WebVisual,
  automation: AutomationVisual,
  ai: AiVisual,
  brand: BrandVisual,
  apps: AppsVisual,
};

export function SceneCapabilities() {
  return (
    <section data-scene="capabilities" className="pointer-events-none fixed inset-0 z-10" aria-label="Capabilities">
      {CAPABILITIES.map((cap, i) => {
        const Visual = CAP_VISUALS[cap.visual];
        return (
          <div
            key={cap.key}
            data-cap
            className="absolute inset-0 flex items-center justify-center px-6"
          >
            <div className="grid w-full max-w-5xl items-center gap-10 md:grid-cols-2">
              <div>
                <p className="sx-kicker">
                  capability {String(i + 1).padStart(2, "0")} / 05
                </p>
                <h2 className="sx-display mt-5 text-[clamp(1.9rem,4.5vw,3.6rem)] text-white">
                  {cap.title}
                </h2>
                <p className="mt-5 max-w-md text-[clamp(0.95rem,1.6vw,1.15rem)] font-light leading-relaxed text-slate-400">
                  {cap.line}
                </p>
              </div>
              <div className="flex justify-center">
                <Visual />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ————————————————— Scene 4 · Agent demo ————————————————— */

export function SceneAgent() {
  return (
    <section data-scene="agent" className={layer} aria-label="AI agent demonstration">
      <div className="w-full max-w-2xl">
        <p data-reveal className="sx-kicker">
          live demonstration · stratxcel agent
        </p>
        <div data-reveal className="sx-glass mt-5 rounded-xl px-5 py-4 font-mono text-[clamp(12px,1.6vw,15px)] text-sky-100">
          <span className="text-slate-500">$ </span>
          <span data-type className="[clip-path:inset(0_100%_0_0)]">
            follow up with every lead from yesterday
          </span>
          <span className="sx-blink text-[#45c4ff]">▌</span>
        </div>

        <ol className="mt-8 space-y-0">
          {AGENT_STEPS.map((step, i) => (
            <li key={step.label} data-step className="relative flex gap-4 pb-5 opacity-30">
              {i < AGENT_STEPS.length - 1 && (
                <span className="absolute left-[7px] top-5 h-full w-px bg-gradient-to-b from-[#45c4ff]/50 to-transparent" />
              )}
              <span
                data-step-dot
                className="relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border border-[#45c4ff]/50 bg-[#0b1220]"
              >
                <span className="absolute inset-[3px] rounded-full bg-[#45c4ff] opacity-0 transition-opacity" data-step-core />
              </span>
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-4">
                <span className="font-mono text-[clamp(11px,1.4vw,13px)] uppercase tracking-[0.22em] text-slate-200">
                  {step.label}
                </span>
                <span className="truncate text-right text-[clamp(11px,1.5vw,13.5px)] font-light text-slate-400">
                  {step.detail}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ————————————————— Scene 5 · Case studies ————————————————— */

export function SceneCases() {
  return (
    <section data-scene="cases" className="pointer-events-none fixed inset-0 z-10" aria-label="Case studies">
      {CASE_STUDIES.map((cs) => (
        <div key={cs.client} data-case className="absolute inset-0 flex items-center justify-center px-6">
          <div className="w-full max-w-3xl text-center">
            <p className="sx-kicker">{cs.client}</p>
            <h2 className="sx-display mt-6 text-[clamp(1.7rem,4vw,3.2rem)] text-slate-300">
              {cs.problem}
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[clamp(1rem,1.8vw,1.2rem)] font-light text-slate-400">
              {cs.transformation}
            </p>
            <div className="mt-10 flex items-baseline justify-center gap-3">
              <span
                data-count
                data-count-to={cs.metric.value}
                className="sx-display sx-glow-text text-[clamp(3.4rem,9vw,6.5rem)] text-white"
              >
                0
              </span>
              <span className="sx-display text-[clamp(2rem,5vw,3.6rem)] text-[#45c4ff]">
                {cs.metric.suffix}
              </span>
            </div>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-slate-500">
              {cs.metric.label}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ————————————————— Scene 6 · Ecosystem ————————————————— */

export function SceneEcosystem() {
  const n = ECOSYSTEM_NODES.length;
  return (
    <section data-scene="ecosystem" className={layer} aria-label="One ecosystem">
      <div className="relative flex flex-col items-center">
        <div
          className="relative h-[min(64vw,420px)] w-[min(64vw,420px)]"
          style={{ animation: "sx-orbit 60s linear infinite" }}
        >
          {ECOSYSTEM_NODES.map((node, i) => {
            const a = (i / n) * 360;
            return (
              <span
                key={node}
                data-reveal
                className="sx-glass absolute left-1/2 top-1/2 -ml-12 -mt-4 w-24 rounded-full py-1.5 text-center font-mono text-[10px] tracking-[0.18em] text-sky-100"
                style={{
                  transform: `rotate(${a}deg) translateY(calc(min(32vw, 210px) * -1)) rotate(${-a}deg)`,
                }}
              >
                {node.toUpperCase()}
              </span>
            );
          })}
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Mark className="h-14 w-14" />
          </span>
        </div>
        <h2 data-reveal className="sx-display mt-10 text-center text-[clamp(1.8rem,4.5vw,3.4rem)] text-white">
          One intelligent business ecosystem.
        </h2>
        <p data-reveal className="mt-4 max-w-lg text-center text-[clamp(0.95rem,1.6vw,1.15rem)] font-light text-slate-400">
          Every module speaks to every other. Nothing is an island anymore.
        </p>
      </div>
    </section>
  );
}

/* ————————————————— Scene 7 · Explore (main menu) ————————————————— */

export function SceneExplore({ onReplay }: { onReplay: () => void }) {
  return (
    <section
      data-scene="explore"
      className="pointer-events-none fixed inset-0 z-10 overflow-y-auto"
      aria-label="Explore Stratxcel"
    >
      <div className="flex min-h-full items-center justify-center px-6 py-24">
        <div className="pointer-events-auto grid w-full max-w-5xl gap-12 lg:grid-cols-[1.15fr_1fr]">
          <nav aria-label="Main menu">
            <p data-reveal className="sx-kicker">
              introduction complete · main menu
            </p>
            <h2 data-reveal className="sx-display mt-4 text-[clamp(2.4rem,6vw,4.5rem)] text-white">
              Explore
            </h2>
            <ul className="mt-8 space-y-1">
              {EXPLORE_LINKS.map((link, i) => {
                const inner = (
                  <span className="group flex items-baseline gap-4 rounded-lg px-3 py-3 transition-colors duration-300 hover:bg-white/[0.04]">
                    <span className="font-mono text-[11px] text-slate-600 transition-colors group-hover:text-[#45c4ff]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="sx-display text-[clamp(1.4rem,3vw,2.2rem)] text-slate-200 transition-all duration-300 group-hover:translate-x-1.5 group-hover:text-white">
                      {link.label}
                    </span>
                    <span className="ml-auto hidden font-mono text-[10px] tracking-[0.14em] text-slate-500 transition-colors group-hover:text-slate-300 sm:block">
                      {link.hint}
                    </span>
                  </span>
                );
                return (
                  <li key={link.href} data-reveal>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noreferrer">
                        {inner}
                      </a>
                    ) : (
                      <Link href={link.href}>{inner}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              data-reveal
              type="button"
              onClick={onReplay}
              className="mt-8 px-3 font-mono text-[11px] tracking-[0.25em] text-slate-500 transition-colors hover:text-slate-200"
            >
              ↻ REPLAY INTRO
            </button>
          </nav>

          <div data-reveal className="sx-glass self-start rounded-2xl p-6 sm:p-7">
            <p className="sx-kicker">open a channel</p>
            <h3 className="sx-display mt-3 text-2xl text-white">
              Engineer your business.
            </h3>
            <div className="mt-5">
              <ContactForm source="experience" />
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/10 pt-4 font-mono text-[11px] text-slate-500">
              <a className="transition-colors hover:text-slate-200" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              <a className="transition-colors hover:text-slate-200" href={whatsappHref} target="_blank" rel="noreferrer">
                WhatsApp ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
