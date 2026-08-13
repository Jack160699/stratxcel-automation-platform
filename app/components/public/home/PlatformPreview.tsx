"use client";

import { useEffect, useState } from "react";
import { useInView } from "@/lib/motion/useInView";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { useTilt } from "@/lib/motion/useTilt";

const SATELLITES = [
  { id: "research", label: "Research", angle: 0 },
  { id: "seo", label: "SEO", angle: 45 },
  { id: "social", label: "Social", angle: 90 },
  { id: "crm", label: "CRM", angle: 135 },
  { id: "whatsapp", label: "WhatsApp", angle: 180 },
  { id: "analytics", label: "Analytics", angle: 225 },
  { id: "content", label: "Content", angle: 270 },
  { id: "website", label: "Website", angle: 315 },
] as const;

const STATE_CARDS = [
  { title: "Content pipeline", status: "Draft ready for review", tone: "accent" as const },
  { title: "Lead inbox", status: "New inquiry assigned", tone: "muted" as const },
  { title: "Search signals", status: "Weekly summary prepared", tone: "muted" as const },
];

const MODULES = [
  { label: "Research", active: false },
  { label: "Content", active: true },
  { label: "Search", active: false },
  { label: "CRM", active: false },
  { label: "WhatsApp", active: false },
];

function satellitePosition(angle: number, radius: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    left: `${50 + Math.sin(rad) * radius}%`,
    top: `${50 - Math.cos(rad) * radius}%`,
  };
}

export function PlatformPreview() {
  const [containerRef, inView] = useInView<HTMLDivElement>({ threshold: 0.15 });
  const reduced = useReducedMotion();
  const { ref: tiltRef, style: tiltStyle, onPointerMove, onPointerLeave } = useTilt(true);
  const [activeSatellite, setActiveSatellite] = useState(0);
  const [activeCard, setActiveCard] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setInterval(() => {
      setActiveSatellite((i) => (i + 1) % SATELLITES.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [reduced, inView]);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setInterval(() => {
      setActiveCard((i) => (i + 1) % STATE_CARDS.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, [reduced, inView]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-[min(100%,44rem)] px-2 sm:px-0"
      aria-hidden
    >
      {/* Ambient depth glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 motion-safe:animate-sx-glow-pulse rounded-[2rem] bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,rgb(37_99_235/0.08),transparent)]"
        aria-hidden
      />

      <div
        ref={tiltRef}
        style={tiltStyle}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="relative aspect-[4/3.2] w-full sm:aspect-[16/12]"
      >
        {/* Signal paths — desktop only */}
        <svg
          className="pointer-events-none absolute inset-0 hidden h-full w-full sm:block"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          {SATELLITES.map((sat, i) => {
            const rad = (sat.angle * Math.PI) / 180;
            const cx = 200 + Math.sin(rad) * 148;
            const cy = 150 - Math.cos(rad) * 108;
            const active = i === activeSatellite;
            return (
              <line
                key={sat.id}
                x1={cx}
                y1={cy}
                x2={200}
                y2={150}
                stroke="currentColor"
                strokeWidth={active ? 1.2 : 0.6}
                className={
                  active
                    ? "text-sx-accent/50 motion-safe:sx-dash-animate"
                    : "text-sx-border-strong/40"
                }
                strokeDasharray={active ? "4 6" : "2 8"}
              />
            );
          })}
        </svg>

        {/* Satellite modules — simplified on small screens */}
        {SATELLITES.map((sat, i) => {
          const pos = satellitePosition(sat.angle, 42);
          const active = i === activeSatellite;
          return (
            <div
              key={sat.id}
              className={`absolute z-10 hidden -translate-x-1/2 -translate-y-1/2 transition-all duration-500 motion-reduce:transition-none sm:block ${
                active ? "scale-105" : "scale-100 opacity-70"
              }`}
              style={pos}
            >
              <span
                className={`block whitespace-nowrap rounded-sx-pill border px-2 py-1 font-sx-sans text-[9px] font-semibold shadow-sm sm:px-2.5 sm:py-1.5 sm:text-[10px] ${
                  active
                    ? "border-sx-accent/40 bg-sx-accent-muted text-sx-accent shadow-[0_0_20px_-4px_rgb(37_99_235/0.35)]"
                    : "border-sx-border bg-sx-surface-1 text-sx-text-muted"
                }`}
              >
                {sat.label}
              </span>
            </div>
          );
        })}

        {/* Central workspace plane */}
        <div
          className={`absolute left-1/2 top-1/2 z-20 w-[min(88%,20rem)] -translate-x-1/2 -translate-y-1/2 motion-safe:animate-sx-float-slow ${
            inView ? "" : "opacity-0"
          }`}
        >
          <div className="overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1 shadow-[0_24px_80px_-32px_rgba(10,16,32,0.28)]">
            <div className="flex items-center gap-2 border-b border-sx-border bg-sx-surface-2 px-3 py-2 sm:px-4">
              <span className="h-2 w-2 rounded-full bg-sx-danger/70" />
              <span className="h-2 w-2 rounded-full bg-sx-warning/80" />
              <span className="h-2 w-2 rounded-full bg-sx-success/80" />
              <span className="ml-2 font-sx-mono text-[9px] uppercase tracking-[0.14em] text-sx-text-subtle sm:text-[10px]">
                Stratxcel workspace
              </span>
            </div>

            <div className="flex min-h-[160px] sm:min-h-[200px]">
              <aside className="hidden w-[32%] shrink-0 border-r border-sx-border bg-sx-surface-2/60 p-2.5 sm:block sm:p-3">
                <p className="font-sx-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-sx-text-subtle">
                  Modules
                </p>
                <ul className="mt-2 space-y-1">
                  {MODULES.map((mod) => (
                    <li
                      key={mod.label}
                      className={`rounded-sx-sm px-2 py-1 font-sx-sans text-[10px] font-medium ${
                        mod.active
                          ? "bg-sx-accent-muted text-sx-accent"
                          : "text-sx-text-muted"
                      }`}
                    >
                      {mod.label}
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
                <div className="flex flex-wrap gap-1.5 sm:hidden">
                  {MODULES.slice(0, 3).map((mod) => (
                    <span
                      key={`m-${mod.label}`}
                      className={`rounded-sx-pill px-2 py-0.5 font-sx-sans text-[9px] font-semibold ${
                        mod.active
                          ? "bg-sx-accent-muted text-sx-accent"
                          : "border border-sx-border text-sx-text-muted"
                      }`}
                    >
                      {mod.label}
                    </span>
                  ))}
                </div>

                <div className="mt-2 space-y-1.5 sm:mt-0">
                  {STATE_CARDS.map((panel, i) => {
                    const highlighted = i === activeCard;
                    return (
                      <div
                        key={panel.title}
                        className={`rounded-sx-sm border px-2.5 py-2 transition-all duration-500 motion-reduce:transition-none ${
                          highlighted
                            ? "border-sx-accent/30 bg-sx-accent-muted/30"
                            : "border-sx-border bg-sx-bg/40 opacity-80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-sx-sans text-[11px] font-semibold text-sx-text sm:text-[12px]">
                            {panel.title}
                          </p>
                          <span
                            className={`shrink-0 rounded-sx-pill px-1.5 py-0.5 font-sx-mono text-[8px] font-semibold uppercase tracking-wide sm:text-[9px] ${
                              panel.tone === "accent"
                                ? "bg-sx-accent-muted text-sx-accent"
                                : "bg-sx-surface-3 text-sx-text-subtle"
                            }`}
                          >
                            {panel.tone === "accent" ? "Review" : "Update"}
                          </span>
                        </div>
                        <p className="mt-0.5 font-sx-sans text-[10px] text-sx-text-muted sm:text-[11px]">
                          {panel.status}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-auto hidden pt-3 sm:block">
                  <div className="h-1 w-full overflow-hidden rounded-sx-pill bg-sx-surface-3">
                    <div
                      className="h-full rounded-sx-pill bg-gradient-to-r from-sx-accent to-sx-royal motion-safe:animate-sx-progress"
                      style={{ width: "62%" }}
                    />
                  </div>
                  <p className="mt-1.5 font-sx-mono text-[8px] uppercase tracking-[0.14em] text-sx-text-subtle">
                    Growth workflow in progress
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center font-sx-mono text-[9px] uppercase tracking-[0.16em] text-sx-text-subtle sm:mt-4">
        One business · One brain · Connected actions
      </p>
    </div>
  );
}
