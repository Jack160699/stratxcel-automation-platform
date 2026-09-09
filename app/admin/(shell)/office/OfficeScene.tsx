"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import type { LiveWorker, LiveWorkflowEdge } from "./office-types";
import { AgentDesk } from "./AgentDesk";
import { DataTrack } from "./DataTrack";
import { Sparkles, Shield, Cpu, Zap, Activity } from "lucide-react";

interface OfficeSceneProps {
  workers: LiveWorker[];
  workflows: LiveWorkflowEdge[];
  selectedWorker: LiveWorker | null;
  hoveredWorker: LiveWorker | null;
  onSelectWorker: (worker: LiveWorker) => void;
  onHoverWorker: (worker: LiveWorker | null, event?: { clientX: number; clientY: number }) => void;
  isAmbientMode: boolean;
}

export function OfficeScene({
  workers,
  workflows,
  selectedWorker,
  hoveredWorker,
  onSelectWorker,
  onHoverWorker,
  isAmbientMode,
}: OfficeSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [deskCoords, setDeskCoords] = useState<Record<string, { x: number; y: number }>>({});

  // Group workers by department pods from real telemetry
  const hermesWorker = workers.find((w) => w.key === "hermes") || workers[0];
  const growthWorkers = workers.filter((w) => ["seo_agent", "content_agent", "research_agent"].includes(w.key));
  const buildWorkers = workers.filter((w) => ["website_agent", "design_agent", "operations_agent"].includes(w.key));
  const commsWorkers = workers.filter((w) => w.key === "whatsapp_agent" || w.id.startsWith("dynamic-"));

  // Track DOM coordinates for DataTrack conduits
  useEffect(() => {
    function updateCoords() {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const coords: Record<string, { x: number; y: number }> = {};

      const deskElements = containerRef.current.querySelectorAll("[data-worker-id]");
      deskElements.forEach((el) => {
        const id = el.getAttribute("data-worker-id");
        if (id) {
          const elRect = el.getBoundingClientRect();
          coords[id] = {
            x: elRect.left - rect.left + elRect.width / 2,
            y: elRect.top - rect.top + elRect.height / 2,
          };
        }
      });
      setDeskCoords(coords);
    }

    updateCoords();
    window.addEventListener("resize", updateCoords);
    const timer = setTimeout(updateCoords, 400);
    return () => {
      window.removeEventListener("resize", updateCoords);
      clearTimeout(timer);
    };
  }, [workers]);

  return (
    <div
      ref={containerRef}
      className={`relative flex min-h-screen w-full flex-col justify-between overflow-x-hidden overflow-y-auto px-4 py-6 md:px-10 md:py-8 transition-transform duration-1000 ${
        isAmbientMode ? "office-camera-drift" : ""
      }`}
      style={{
        // Deep polished slate & dark wood flooring with isometric perspective lines
        background: `
          radial-gradient(ellipse at 50% 15%, rgba(99, 102, 241, 0.14) 0%, transparent 65%),
          radial-gradient(ellipse at 20% 60%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 60%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
          linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
          linear-gradient(180deg, #07090e 0%, #0a0d14 40%, #05070a 100%)
        `,
        backgroundSize: "100% 100%, 100% 100%, 100% 100%, 64px 64px, 64px 64px, 100% 100%",
      }}
    >
      {/* ---------------------------------------------------- */}
      {/* 1. ARCHITECTURAL BACK WALL & STRATXCEL EMBEDDED SIGN */}
      {/* ---------------------------------------------------- */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center">
        {/* Acoustic Walnut Wood Slat Backing & Warm Downlight Cones */}
        <div className="relative flex w-full flex-col items-center justify-center pt-2 pb-6">
          {/* Subtle architectural vertical wall slats */}
          <div
            className="absolute top-0 h-28 w-full opacity-20 pointer-events-none"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, #475569, #475569 2px, transparent 2px, transparent 28px)`,
            }}
          />

          {/* Wall Downlight Glow Cones */}
          <div className="pointer-events-none absolute -top-8 h-36 w-96 rounded-full bg-gradient-to-b from-indigo-500/20 via-cyan-500/10 to-transparent blur-2xl" />

          {/* PHYSICAL ILLUMINATED STRATXCEL WALL SIGN */}
          <div className="relative flex items-center gap-4 rounded-2xl border border-white/15 bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-slate-900/90 px-8 py-3.5 shadow-2xl backdrop-blur-xl">
            {/* Halo backlight aura */}
            <div className="office-sign-backlight pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-r from-indigo-500/30 via-cyan-500/30 to-emerald-500/30 blur-xl" />

            {/* Official High-Res StratXcel Logo Medallion */}
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-slate-950/90 p-1.5 shadow-inner">
              <Image
                src="/logo-v2.png"
                alt="StratXcel Mark"
                width={36}
                height={36}
                className="object-contain"
                priority
              />
            </div>

            {/* Dimensional Laser-Cut Typography */}
            <div className="relative flex flex-col text-left">
              <span className="font-extrabold tracking-[0.28em] text-sm text-white drop-shadow-lg">
                STRATXCEL
              </span>
              <span className="font-mono text-[9px] font-bold tracking-[0.35em] text-cyan-300 uppercase">
                AI OPERATIONS HEADQUARTERS
              </span>
            </div>

            <div className="relative ml-4 pl-4 border-l border-white/10 hidden sm:flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>HQ SYNCHRONIZED</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 2. REALTIME DATA CONDUITS BETWEEN WORKERS           */}
      {/* ---------------------------------------------------- */}
      <DataTrack workflows={workflows} workerPositions={deskCoords} />

      {/* ---------------------------------------------------- */}
      {/* 3. 2.5D DIGITAL OFFICE WORKSPACE WORLD              */}
      {/* ---------------------------------------------------- */}
      <div className="relative z-10 mx-auto my-auto flex w-full max-w-7xl flex-col items-center gap-12">
        {/* ================================================== */}
        {/* LEVEL 1: HERMES CEO / ORCHESTRATOR HUB             */}
        {/* ================================================== */}
        {hermesWorker && (
          <div className="relative flex flex-col items-center">
            {/* Architectural green planters flanking CEO Platform */}
            <div className="pointer-events-none absolute -left-20 top-2 hidden lg:flex flex-col items-center office-plant-swaying">
              <div className="h-14 w-8 rounded-full bg-emerald-800/40 blur-[1px] border border-emerald-500/20" />
              <div className="h-6 w-7 rounded-b-lg bg-zinc-900 border border-zinc-700 shadow-lg" />
            </div>
            <div className="pointer-events-none absolute -right-20 top-2 hidden lg:flex flex-col items-center office-plant-swaying">
              <div className="h-14 w-8 rounded-full bg-emerald-800/40 blur-[1px] border border-emerald-500/20" />
              <div className="h-6 w-7 rounded-b-lg bg-zinc-900 border border-zinc-700 shadow-lg" />
            </div>

            {/* Elevated CEO Platform Ring with Inset Lighting */}
            <div className="relative" data-worker-id={hermesWorker.id}>
              {/* Concentric floor rings */}
              <div className="pointer-events-none absolute -inset-8 rounded-full border border-cyan-400/20 bg-gradient-to-b from-indigo-500/10 via-cyan-500/5 to-transparent shadow-2xl" />
              <div className="pointer-events-none absolute -inset-2 rounded-full border border-dashed border-cyan-400/35 office-radar-sweep" />

              <AgentDesk
                worker={hermesWorker}
                isSelected={selectedWorker?.id === hermesWorker.id}
                isHovered={hoveredWorker?.id === hermesWorker.id}
                onSelect={onSelectWorker}
                onHover={onHoverWorker}
              />
            </div>

            <div className="mt-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-cyan-400 font-bold">
              <span className="h-1 w-1 rounded-full bg-cyan-400 animate-ping" />
              <span>ORCHESTRATOR SUITE</span>
            </div>
          </div>
        )}

        {/* ================================================== */}
        {/* LEVEL 2: SPECIALIST OPERATIONAL WINGS               */}
        {/* ================================================== */}
        <div className="grid w-full grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-16 px-2 md:px-6">
          {/* ------------------------------------------------ */}
          {/* WING A: GROWTH & INTELLIGENCE (SEO, Content, Research) */}
          {/* ------------------------------------------------ */}
          <div className="relative flex flex-col items-center">
            {/* Subtle glass partition line at top */}
            <div className="mb-4 flex w-full items-center justify-between border-b border-white/10 pb-2 px-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Growth & Intelligence Wing
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                SEO · Editorial · Market Intel
              </span>
            </div>

            {/* Workstations Grid (No flat grey boxes) */}
            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 w-full py-2">
              {growthWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id} className="relative">
                  <AgentDesk
                    worker={worker}
                    isSelected={selectedWorker?.id === worker.id}
                    isHovered={hoveredWorker?.id === worker.id}
                    onSelect={onSelectWorker}
                    onHover={onHoverWorker}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ------------------------------------------------ */}
          {/* WING B: BUILD & OPERATIONS (Website, Creative, Ops) */}
          {/* ------------------------------------------------ */}
          <div className="relative flex flex-col items-center">
            {/* Subtle glass partition line at top */}
            <div className="mb-4 flex w-full items-center justify-between border-b border-white/10 pb-2 px-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400 shadow-sm shadow-sky-400" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-sky-400">
                  Build & Operations Wing
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                Web & Vercel · Visual · Fleet Infra
              </span>
            </div>

            {/* Workstations Grid (No flat grey boxes) */}
            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 w-full py-2">
              {buildWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id} className="relative">
                  <AgentDesk
                    worker={worker}
                    isSelected={selectedWorker?.id === worker.id}
                    isHovered={hoveredWorker?.id === worker.id}
                    onSelect={onSelectWorker}
                    onHover={onHoverWorker}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ================================================== */}
        {/* LEVEL 3: COMMUNICATIONS & DYNAMIC FLEET            */}
        {/* ================================================== */}
        {commsWorkers.length > 0 && (
          <div className="relative flex flex-col items-center max-w-4xl w-full">
            <div className="mb-4 flex w-full items-center justify-between border-b border-white/10 pb-2 px-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400 shadow-sm shadow-rose-400" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-rose-400">
                  Communications & Autonomous Fleet
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                WhatsApp · Live Conversational CRM
              </span>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-8 py-2">
              {commsWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id} className="relative">
                  <AgentDesk
                    worker={worker}
                    isSelected={selectedWorker?.id === worker.id}
                    isHovered={hoveredWorker?.id === worker.id}
                    onSelect={onSelectWorker}
                    onHover={onHoverWorker}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Decorative Floor Fog & Depth Occlusion */}
      <div className="pointer-events-none relative h-16 w-full bg-gradient-to-t from-[#05070a] to-transparent" />
    </div>
  );
}
