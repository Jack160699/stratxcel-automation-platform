"use client";

import type { HeroSceneKey } from "./hero-phrases";
import { WORKSPACE_AREAS, WORKSPACE_AREA_INDEX, type WorkspaceArea } from "./hero-workspace-areas";

const PANEL_WIDTH = 252;
const PANEL_GAP = 44;
const BOARD_WIDTH = WORKSPACE_AREAS.length * PANEL_WIDTH + (WORKSPACE_AREAS.length - 1) * PANEL_GAP;
const PULLED_BACK_SCALE = 0.48;

function panelCenter(index: number) {
  return index * (PANEL_WIDTH + PANEL_GAP) + PANEL_WIDTH / 2;
}

type Focus = { scale: number; center: number; activeIndex: number | null };

function resolveFocus(scene: HeroSceneKey): Focus {
  if (scene === "unified") {
    return { scale: PULLED_BACK_SCALE, center: BOARD_WIDTH / 2, activeIndex: null };
  }
  const activeIndex = (WORKSPACE_AREA_INDEX as Record<string, number>)[scene] ?? 0;
  return { scale: 1, center: panelCenter(activeIndex), activeIndex };
}

function AreaPanel({
  area,
  distance,
  pulledBack,
}: {
  area: WorkspaceArea;
  /** Steps away from the focused area; -1 when the whole board is pulled back. */
  distance: number;
  pulledBack: boolean;
}) {
  const focused = !pulledBack && distance === 0;
  const opacity = pulledBack ? 0.8 : distance === 0 ? 1 : distance === 1 ? 0.46 : 0.2;
  const blur = pulledBack ? 0 : distance === 0 ? 0 : distance === 1 ? 0.6 : 1.6;

  return (
    <div
      className="shrink-0 transition-[opacity,filter,transform] duration-[900ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{
        width: PANEL_WIDTH,
        opacity,
        filter: blur ? `blur(${blur}px)` : undefined,
        transform: focused ? "translateY(-6px)" : "translateY(0)",
      }}
    >
      <div
        className={`overflow-hidden rounded-[10px] border bg-[#0b0f16]/85 backdrop-blur-[2px] transition-colors duration-[900ms] motion-reduce:transition-none ${
          focused
            ? "border-sx-accent/45 shadow-[0_0_0_1px_rgb(37_99_235/0.18),0_28px_60px_-28px_rgb(37_99_235/0.55)]"
            : "border-white/10 shadow-[0_18px_44px_-24px_rgb(0_0_0/0.8)]"
        }`}
      >
        <div className="flex items-center gap-1.5 border-b border-white/8 bg-white/[0.03] px-2.5 py-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-[900ms] motion-reduce:transition-none ${
              focused ? "bg-sx-accent" : "bg-white/20"
            }`}
            aria-hidden
          />
          <span className="truncate font-sx-mono text-[8.5px] uppercase tracking-[0.14em] text-white/45">
            {area.label}
          </span>
        </div>
        <div className="h-[124px] px-2.5 py-2.5">{area.body}</div>
        <div className="border-t border-white/8 px-2.5 py-1.5">
          <span
            className={`font-sx-mono text-[8.5px] uppercase tracking-[0.12em] transition-colors duration-[900ms] motion-reduce:transition-none ${
              focused ? "text-sx-accent" : "text-white/28"
            }`}
          >
            {area.state}
          </span>
        </div>
      </div>
    </div>
  );
}

function Connector({ lit }: { lit: boolean }) {
  return (
    <div className="flex shrink-0 items-center justify-center" style={{ width: PANEL_GAP }} aria-hidden>
      <span
        className={`h-px w-full transition-colors duration-[900ms] motion-reduce:transition-none ${
          lit ? "bg-sx-accent/40" : "bg-white/12"
        }`}
      />
    </div>
  );
}

/**
 * One Stratxcel workspace, seen as a single connected board. The headline
 * outcome moves the camera along the board rather than swapping in a new
 * scene, so peripheral areas stay visible and the visitor reads it as one
 * product doing many business jobs.
 */
export function HeroWorkspaceBoard({ scene }: { scene: HeroSceneKey }) {
  const { scale, center, activeIndex } = resolveFocus(scene);
  const pulledBack = activeIndex === null;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute left-1/2 top-1/2 flex -translate-y-1/2 items-center transition-transform duration-[1100ms] ease-[cubic-bezier(0.22,0.72,0.16,1)] motion-reduce:transition-none"
        style={{
          width: BOARD_WIDTH,
          transformOrigin: "0 50%",
          transform: `translateX(${-scale * center}px) scale(${scale})`,
        }}
      >
        {WORKSPACE_AREAS.map((area, i) => (
          <div key={area.key} className="flex items-center">
            {i > 0 ? (
              <Connector lit={pulledBack || (activeIndex !== null && Math.abs(activeIndex - i) <= 1)} />
            ) : null}
            <div style={{ transform: `translateY(${i % 2 === 0 ? -12 : 12}px)` }}>
              <AreaPanel
                area={area}
                distance={activeIndex === null ? -1 : Math.abs(activeIndex - i)}
                pulledBack={pulledBack}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Edge falloff keeps the board reading as an environment that continues past the frame. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[18%] bg-gradient-to-r from-[#06080c] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[18%] bg-gradient-to-l from-[#06080c] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[12%] bg-gradient-to-b from-[#06080c] to-transparent" />
    </div>
  );
}

/**
 * Mobile keeps one legible area at a time instead of a scaled-down desktop
 * composition. No pan, no peripheral overflow, no wide transform.
 */
export function HeroWorkspaceCard({ scene }: { scene: HeroSceneKey }) {
  const activeIndex =
    (scene === "unified"
      ? (WORKSPACE_AREA_INDEX as Record<string, number>).workflow
      : (WORKSPACE_AREA_INDEX as Record<string, number>)[scene]) ?? 0;
  const area = WORKSPACE_AREAS[activeIndex] || WORKSPACE_AREAS[0];

  return (
    <div className="mx-auto w-full max-w-[19rem]" aria-hidden>
      <div className="overflow-hidden rounded-[10px] border border-white/12 bg-[#0b0f16]/85 shadow-[0_24px_60px_-28px_rgb(0_0_0/0.9)]">
        <div className="flex items-center gap-1.5 border-b border-white/8 bg-white/[0.03] px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-sx-accent" />
          <span className="font-sx-mono text-[9px] uppercase tracking-[0.14em] text-white/50">{area.label}</span>
        </div>
        <div key={area.key} className="min-h-[128px] px-3 py-3 motion-safe:sx-hero-card-resolve">
          {area.body}
        </div>
        <div className="border-t border-white/8 px-3 py-2">
          <span className="font-sx-mono text-[9px] uppercase tracking-[0.12em] text-sx-accent">{area.state}</span>
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-1.5">
        {WORKSPACE_AREAS.map((a, i) => (
          <span
            key={a.key}
            className={`h-1 rounded-full transition-all duration-500 motion-reduce:transition-none ${
              i === activeIndex ? "w-4 bg-sx-accent" : "w-1 bg-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
