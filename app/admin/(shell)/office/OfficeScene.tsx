"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import Image from "next/image";
import type { LiveWorker, LiveWorkflowEdge } from "./office-types";
import { AgentDesk } from "./AgentDesk";
import { DataTrack } from "./DataTrack";
import { Sparkles, Shield, Cpu, Zap } from "lucide-react";

interface OfficeSceneProps {
  workers: LiveWorker[];
  workflows: LiveWorkflowEdge[];
  selectedWorker: LiveWorker | null;
  hoveredWorker: LiveWorker | null;
  onSelectWorker: (worker: LiveWorker) => void;
  onHoverWorker: (worker: LiveWorker | null, event?: React.MouseEvent) => void;
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

  // Group workers by logical pods
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
    const timer = setTimeout(updateCoords, 500);
    return () => {
      window.removeEventListener("resize", updateCoords);
      clearTimeout(timer);
    };
  }, [workers]);

  return (
    <div
      ref={containerRef}
      className={`relative min-h-[640px] w-full flex-1 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl transition-all duration-700 ${
        isAmbientMode ? "office-ambient-active" : ""
      }`}
      style={{
        backgroundImage: `radial-gradient(circle at 50% 10%, rgba(99, 102, 241, 0.12) 0%, transparent 60%),
                          linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px)`,
        backgroundSize: "100% 100%, 48px 48px, 48px 48px",
      }}
    >
      {/* ======================================================== */}
      {/* 1. STRATXCEL BACK WALL PLAQUE (Canonical Brand Asset)   */}
      {/* ======================================================== */}
      <div className="relative z-10 mx-auto mb-8 flex max-w-xl flex-col items-center justify-center text-center">
        <div className="relative flex items-center gap-4 rounded-2xl border border-white/15 bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-slate-900/90 px-8 py-3.5 backdrop-blur-xl shadow-2xl">
          {/* Subtle Backlit Glow */}
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500/20 via-cyan-500/20 to-emerald-500/20 opacity-50 blur-lg" />

          {/* Official Logo */}
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950/80 p-1.5 border border-white/20 shadow-inner">
            <Image
              src="/logo-v2.png"
              alt="StratXcel Mark"
              width={32}
              height={32}
              className="object-contain"
              priority
            />
          </div>

          {/* Wall Signage Typography */}
          <div className="relative flex flex-col text-left">
            <span className="font-extrabold tracking-[0.25em] text-sm text-white drop-shadow-md">
              STRATXCEL
            </span>
            <span className="font-mono text-[10px] font-semibold tracking-[0.3em] text-cyan-300 uppercase">
              AI OPERATIONS COMMAND
            </span>
          </div>

          <div className="relative ml-4 pl-4 border-l border-white/10 hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            LIVE FLEET
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. REAL DATA CONDUITS (Active Workflows & File Movement) */}
      {/* ======================================================== */}
      <DataTrack workflows={workflows} workerPositions={deskCoords} />

      {/* ======================================================== */}
      {/* 3. 2.5D OFFICE FLOOR LAYOUT                              */}
      {/* ======================================================== */}
      <div className="relative z-10 flex flex-col items-center gap-10">
        {/* TOP ROW: HERMES CEO SUITE (Center Stage) */}
        {hermesWorker && (
          <div className="flex flex-col items-center">
            <div className="relative" data-worker-id={hermesWorker.id}>
              {/* Elevated Executive Hub Ring */}
              <div className="absolute -inset-6 rounded-full border border-cyan-400/20 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none" />
              <div className="absolute -inset-1 rounded-full border border-dashed border-cyan-400/30 office-beacon pointer-events-none" />

              <AgentDesk
                worker={hermesWorker}
                isSelected={selectedWorker?.id === hermesWorker.id}
                isHovered={hoveredWorker?.id === hermesWorker.id}
                onSelect={onSelectWorker}
                onHover={onHoverWorker}
              />
            </div>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-400 font-bold">
              ORCHESTRATOR HUB
            </span>
          </div>
        )}

        {/* MIDDLE SECTION: SPECIALIST PODS (Growth vs Build) */}
        <div className="grid w-full max-w-6xl grid-cols-1 md:grid-cols-2 gap-8 px-4">
          {/* LEFT WING: GROWTH & DISCOVERY (SEO, Content, Research) */}
          <div className="flex flex-col rounded-3xl border border-white/10 bg-slate-950/40 p-5 backdrop-blur-md shadow-lg">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                Growth & Intelligence Wing
              </span>
              <span className="text-[10px] text-slate-400">SEO · Content · Market</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {growthWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id}>
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

          {/* RIGHT WING: PRODUCT & INFRASTRUCTURE (Website, Creative, Ops) */}
          <div className="flex flex-col rounded-3xl border border-white/10 bg-slate-950/40 p-5 backdrop-blur-md shadow-lg">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                Build & Operations Wing
              </span>
              <span className="text-[10px] text-slate-400">Web · Creative · Cloud Fleet</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {buildWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id}>
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

        {/* BOTTOM ROW: COMMUNICATIONS & CONVERSATIONAL (WhatsApp & Dynamic) */}
        {commsWorkers.length > 0 && (
          <div className="flex flex-col items-center max-w-4xl w-full rounded-3xl border border-white/10 bg-slate-950/40 p-5 backdrop-blur-md shadow-lg">
            <div className="mb-4 w-full flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                Customer Communications & Dynamic Fleet
              </span>
              <span className="text-[10px] text-slate-400">WhatsApp · CRM · Factory Agents</span>
            </div>

            <div className="flex flex-wrap justify-center gap-6">
              {commsWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id}>
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

      {/* Decorative Floor Ambient Lighting Accents */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
    </div>
  );
}
