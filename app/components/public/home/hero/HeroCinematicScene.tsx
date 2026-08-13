"use client";

import type { HeroSceneKey } from "./hero-phrases";
import { DEMO_BUSINESS } from "@/app/components/public/showcase/fixtures/showcase-data";

type HeroCinematicSceneProps = {
  scene: HeroSceneKey;
  compact?: boolean;
};

function SceneLayer({
  active,
  children,
  className = "",
}: {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`absolute inset-0 transition-opacity duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      } ${className}`}
      aria-hidden
    >
      {children}
    </div>
  );
}

function WorkspaceChrome({ children }: { children?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-sx-lg border border-white/10 bg-[#0c1018]/90 shadow-[0_32px_80px_-24px_rgb(0_0_0/0.75)] backdrop-blur-md">
      <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.03] px-3 py-2 sm:px-4">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57]/80" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e]/80" />
        <span className="h-2 w-2 rounded-full bg-[#28c840]/80" />
        <span className="ml-2 truncate font-sx-mono text-[9px] uppercase tracking-[0.14em] text-white/45 sm:text-[10px]">
          {DEMO_BUSINESS.name} · Stratxcel
        </span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

export function HeroCinematicScene({ scene, compact = false }: HeroCinematicSceneProps) {
  const isUnified = scene === "unified";

  return (
    <div
      className={`relative mx-auto w-full ${compact ? "max-w-[min(100%,20rem)]" : "max-w-[min(100%,36rem)] lg:max-w-[42rem]"}`}
    >
      {/* Ambient connection paths */}
      <svg
        className="pointer-events-none absolute -inset-[12%] h-[124%] w-[124%] text-white/10 motion-safe:sx-hero-orbit-slow"
        viewBox="0 0 400 320"
        aria-hidden
      >
        <ellipse cx="200" cy="160" rx="170" ry="120" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="3 8" />
        <ellipse cx="200" cy="160" rx="120" ry="85" fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 10" opacity="0.6" />
      </svg>

      <div className="relative">
        <WorkspaceChrome>
          <div className="relative min-h-[9.5rem] sm:min-h-[11rem]">
            <SceneLayer active={scene === "search" || isUnified}>
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-sx-sm border border-white/10 bg-white/[0.04] px-3 py-2">
                  <span className="text-white/35">🔍</span>
                  <span className="font-sx-sans text-[11px] text-white/75 sm:text-xs">
                    {DEMO_BUSINESS.name} near {DEMO_BUSINESS.location}
                  </span>
                </div>
                <div className="rounded-sx-sm border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2">
                  <p className="font-sx-sans text-[11px] font-medium text-emerald-200/90 sm:text-xs">
                    Showing on Google Maps · 4.8 rating
                  </p>
                  <p className="mt-0.5 font-sx-sans text-[10px] text-white/45">Local search visibility improving</p>
                </div>
              </div>
            </SceneLayer>

            <SceneLayer active={scene === "social" || isUnified}>
              <div className="grid grid-cols-2 gap-2">
                {["Morning pour-over reel", "Weekend promo carousel"].map((title, i) => (
                  <div
                    key={title}
                    className={`rounded-sx-sm border border-white/10 bg-gradient-to-br from-pink-500/10 to-violet-500/10 p-2 ${i === 1 ? "mt-3" : ""}`}
                  >
                    <div className="mb-2 aspect-[4/3] rounded-[4px] bg-white/[0.06]" />
                    <p className="font-sx-sans text-[10px] font-medium text-white/80 sm:text-[11px]">{title}</p>
                    <p className="mt-0.5 font-sx-mono text-[8px] uppercase tracking-wide text-white/35">Draft ready</p>
                  </div>
                ))}
              </div>
            </SceneLayer>

            <SceneLayer active={scene === "content" || isUnified}>
              <div className="space-y-2">
                <p className="font-sx-mono text-[9px] uppercase tracking-[0.16em] text-white/40">Content studio</p>
                <div className="rounded-sx-sm border border-white/10 bg-white/[0.03] p-2.5">
                  <p className="font-sx-sans text-[11px] font-medium text-white/85 sm:text-xs">
                    Why we cup every batch before it hits the bar
                  </p>
                  <p className="mt-1 font-sx-sans text-[10px] leading-relaxed text-white/45">
                    Hook: Most cafés never taste-test the roast you&apos;re drinking…
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {["Mon", "Wed", "Fri"].map((d) => (
                    <span key={d} className="rounded-sx-pill border border-sx-accent/30 bg-sx-accent/10 px-2 py-0.5 font-sx-mono text-[8px] text-sx-accent">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </SceneLayer>

            <SceneLayer active={scene === "leads" || isUnified}>
              <div className="space-y-2">
                <p className="font-sx-mono text-[9px] uppercase tracking-[0.16em] text-white/40">New enquiries</p>
                {[
                  { name: "Priya S.", note: "Office subscription — 12 cups/day" },
                  { name: "Rahul M.", note: "Catering for team offsite" },
                ].map((lead, i) => (
                  <div
                    key={lead.name}
                    className={`flex items-start justify-between gap-2 rounded-sx-sm border px-2.5 py-2 ${
                      i === 0 ? "border-sx-accent/35 bg-sx-accent/10" : "border-white/8 bg-white/[0.03]"
                    }`}
                  >
                    <div>
                      <p className="font-sx-sans text-[11px] font-medium text-white/85">{lead.name}</p>
                      <p className="font-sx-sans text-[10px] text-white/45">{lead.note}</p>
                    </div>
                    {i === 0 && (
                      <span className="shrink-0 rounded-sx-pill bg-sx-accent/20 px-1.5 py-0.5 font-sx-mono text-[8px] text-sx-accent">
                        New
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </SceneLayer>

            <SceneLayer active={scene === "whatsapp" || isUnified}>
              <div className="space-y-2">
                <p className="font-sx-mono text-[9px] uppercase tracking-[0.16em] text-emerald-300/60">WhatsApp</p>
                <div className="max-w-[85%] rounded-sx-md rounded-tl-sm border border-emerald-400/15 bg-emerald-950/40 px-3 py-2">
                  <p className="font-sx-sans text-[11px] text-white/85">Hi — do you deliver to Koramangala offices?</p>
                </div>
                <div className="ml-auto max-w-[85%] rounded-sx-md rounded-tr-sm border border-white/10 bg-white/[0.06] px-3 py-2">
                  <p className="font-sx-sans text-[11px] text-white/75">
                    Yes! We deliver weekday mornings. Shall I send options?
                  </p>
                  <p className="mt-1 font-sx-mono text-[8px] text-emerald-300/70">Suggested reply · ready to send</p>
                </div>
              </div>
            </SceneLayer>

            <SceneLayer active={scene === "website" || isUnified}>
              <div className="overflow-hidden rounded-sx-sm border border-white/10">
                <div className="border-b border-white/8 bg-white/[0.04] px-2 py-1.5 font-sx-mono text-[8px] text-white/40">
                  {DEMO_BUSINESS.website}
                </div>
                <div className="bg-gradient-to-b from-white/[0.06] to-transparent p-3">
                  <p className="font-sx-sans text-sm font-semibold text-white/90">{DEMO_BUSINESS.name}</p>
                  <p className="mt-1 font-sx-sans text-[10px] text-white/45">Fresh roasts · Quiet workspace · Indiranagar</p>
                  <span className="mt-2 inline-block rounded-sx-pill bg-sx-accent/20 px-2.5 py-1 font-sx-sans text-[10px] font-medium text-sx-accent">
                    Order ahead
                  </span>
                </div>
              </div>
            </SceneLayer>

            <SceneLayer active={scene === "workflow" || isUnified}>
              <div className="flex flex-wrap items-center gap-2">
                {["New lead", "Draft post", "Send follow-up", "Publish"].map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <span
                      className={`rounded-sx-sm border px-2 py-1 font-sx-sans text-[10px] ${
                        i <= 2
                          ? "border-sx-accent/35 bg-sx-accent/10 text-sx-accent"
                          : "border-white/10 bg-white/[0.03] text-white/50"
                      }`}
                    >
                      {step}
                    </span>
                    {i < 3 && <span className="text-white/25">→</span>}
                  </div>
                ))}
              </div>
              <p className="mt-3 font-sx-sans text-[10px] text-white/45">Connected actions run with your approval</p>
            </SceneLayer>

            <SceneLayer active={scene === "analytics" || isUnified}>
              <div>
                <p className="font-sx-mono text-[9px] uppercase tracking-[0.16em] text-white/40">This week</p>
                <div className="mt-2 flex items-end gap-1.5 pt-2">
                  {[38, 52, 44, 68, 61, 74, 58].map((h, i) => (
                    <div
                      key={i}
                      className="w-full rounded-t-[3px] bg-gradient-to-t from-sx-accent/20 to-sx-accent/70"
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
                <p className="mt-2 font-sx-sans text-[10px] text-white/50">Walk-ins up · 3 posts published · 5 leads replied</p>
              </div>
            </SceneLayer>
          </div>
        </WorkspaceChrome>

        {/* Floating signal chips — hidden on compact mobile */}
        {!compact && (
          <div className="pointer-events-none absolute -right-2 top-1/4 hidden translate-x-1/4 sm:block">
            <span className="rounded-sx-pill border border-white/10 bg-white/[0.06] px-2.5 py-1 font-sx-mono text-[9px] text-white/50 backdrop-blur-sm motion-safe:sx-hero-float-chip">
              Google
            </span>
          </div>
        )}
        {!compact && (
          <div className="pointer-events-none absolute -left-3 bottom-1/4 hidden -translate-x-1/4 sm:block">
            <span className="rounded-sx-pill border border-white/10 bg-white/[0.06] px-2.5 py-1 font-sx-mono text-[9px] text-white/50 backdrop-blur-sm motion-safe:sx-hero-float-chip-delayed">
              WhatsApp
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
