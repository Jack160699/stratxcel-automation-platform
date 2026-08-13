"use client";

import { useEffect, useState } from "react";
import { useInView } from "@/lib/motion/useInView";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

const STAGES = [
  { id: "business", label: "Business", body: "Define the outcome and constraints in plain language." },
  { id: "brain", label: "Brain", body: "Brand Brain and workspace context shape the plan." },
  { id: "action", label: "Action", body: "Missions and automations prepare work behind approval gates." },
  { id: "results", label: "Results", body: "Review outputs, publish, and measure what changed." },
] as const;

const CAPABILITIES = [
  "Research",
  "Strategy",
  "Social",
  "SEO",
  "CRM",
  "WhatsApp",
  "Creative",
  "Analytics",
] as const;

export function WorkforceFlowVisual() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const reduced = useReducedMotion();
  const [activeStage, setActiveStage] = useState(0);
  const [activeCapability, setActiveCapability] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const stageId = window.setInterval(() => {
      setActiveStage((i) => (i + 1) % STAGES.length);
    }, 3500);
    return () => window.clearInterval(stageId);
  }, [reduced, inView]);

  useEffect(() => {
    if (reduced || !inView) return;
    const capId = window.setInterval(() => {
      setActiveCapability((i) => (i + 1) % CAPABILITIES.length);
    }, 2200);
    return () => window.clearInterval(capId);
  }, [reduced, inView]);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5 sm:p-6"
      aria-hidden
    >
      <p className="font-sx-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sx-text-subtle">
        BUSINESS → BRAIN → ACTION → RESULTS ↻
      </p>

      {/* Flow stages */}
      <div className="relative mt-6">
        <div className="absolute left-4 right-4 top-5 hidden h-px bg-sx-border sm:block" aria-hidden />
        <ol className="relative grid gap-3 sm:grid-cols-4 sm:gap-2">
          {STAGES.map((stage, i) => {
            const active = i === activeStage;
            return (
              <li
                key={stage.id}
                className={`relative rounded-sx-sm border px-3 py-3 transition-all duration-500 motion-reduce:transition-none ${
                  active
                    ? "border-sx-accent/40 bg-sx-accent-muted/40 shadow-[0_0_24px_-8px_rgb(37_99_235/0.3)]"
                    : "border-sx-border bg-sx-bg/30"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-sx-mono text-[10px] font-bold ${
                    active ? "bg-sx-accent text-sx-accent-on" : "bg-sx-surface-3 text-sx-text-subtle"
                  }`}
                >
                  {i + 1}
                </span>
                <p className="mt-2 font-sx-sans text-xs font-bold text-sx-text">{stage.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-sx-text-muted">{stage.body}</p>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Capability orbit */}
      <div className="relative mt-8 flex min-h-[7rem] items-center justify-center sm:min-h-[8rem]">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 320 120"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <ellipse
            cx={160}
            cy={60}
            rx={140}
            ry={48}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-sx-border"
            strokeDasharray="3 6"
          />
          {CAPABILITIES.map((cap, i) => {
            const angle = (i / CAPABILITIES.length) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const x = 160 + Math.cos(rad) * 140;
            const y = 60 + Math.sin(rad) * 48;
            const active = i === activeCapability;
            return (
              <g key={cap}>
                <line
                  x1={160}
                  y1={60}
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth={active ? 1 : 0.5}
                  className={active ? "text-sx-accent/60 motion-safe:sx-dash-animate" : "text-sx-border/50"}
                  strokeDasharray={active ? "3 5" : "2 8"}
                />
              </g>
            );
          })}
        </svg>

        {/* Central brain node */}
        <div
          className={`relative z-10 rounded-sx-md border px-4 py-2.5 text-center transition-all duration-500 motion-reduce:transition-none ${
            inView && !reduced ? "motion-safe:animate-sx-glow-pulse" : ""
          } border-sx-accent/30 bg-sx-accent-muted/50`}
        >
          <p className="font-sx-mono text-[9px] font-bold uppercase tracking-[0.12em] text-sx-accent">
            Brand Brain
          </p>
          <p className="mt-0.5 font-sx-sans text-[10px] text-sx-text-muted">Context · Plan · Route</p>
        </div>

        {/* Capability pills */}
        <div className="pointer-events-none absolute inset-0">
          {CAPABILITIES.map((cap, i) => {
            const angle = (i / CAPABILITIES.length) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const left = 50 + (Math.cos(rad) * 44);
            const top = 50 + (Math.sin(rad) * 38);
            const active = i === activeCapability;
            return (
              <span
                key={cap}
                className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sx-pill border px-2 py-0.5 font-sx-sans text-[9px] font-semibold transition-all duration-300 motion-reduce:transition-none sm:text-[10px] ${
                  active
                    ? "border-sx-accent/40 bg-sx-accent-muted text-sx-accent scale-110"
                    : "border-sx-border bg-sx-surface-1 text-sx-text-muted scale-100 opacity-75"
                }`}
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                {cap}
              </span>
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-center font-sx-mono text-[9px] uppercase tracking-[0.14em] text-sx-text-subtle">
        Objective in → specialized actions → evidence out → smarter next cycle
      </p>
    </div>
  );
}
