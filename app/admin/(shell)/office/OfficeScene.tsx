"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import Image from "next/image";
import type {
  LiveWorker,
  LiveWorkflowEdge,
  PhysicalArtifact,
  OfficeMission,
  OfficeEvent,
} from "./office-types";
import {
  SimulationWorkerState,
  initializeSimulationWorkers,
  dispatchSimulationEvent,
  triggerAmbientLifeEvent,
  getDeskCoords,
  OFFICE_WAYPOINTS,
} from "./office-simulation";
import { detectOfficeEvents } from "./office-events";
import { AgentDesk } from "./AgentDesk";
import { AgentCharacter } from "./AgentCharacter";
import { PhysicalMissionBoard } from "./PhysicalMissionBoard";
import { OfficeEnvironment } from "./OfficeEnvironment";
import { DataTrack } from "./DataTrack";
import { Cpu, Zap, Activity } from "lucide-react";

interface OfficeSceneProps {
  workers: LiveWorker[];
  workflows: LiveWorkflowEdge[];
  artifacts?: PhysicalArtifact[];
  activeMissions?: OfficeMission[];
  selectedWorker: LiveWorker | null;
  hoveredWorker: LiveWorker | null;
  onSelectWorker: (worker: LiveWorker) => void;
  onHoverWorker: (worker: LiveWorker | null, event?: { clientX: number; clientY: number }) => void;
  isAmbientMode: boolean;
}

export function OfficeScene({
  workers,
  workflows,
  artifacts = [],
  activeMissions = [],
  selectedWorker,
  hoveredWorker,
  onSelectWorker,
  onHoverWorker,
  isAmbientMode,
}: OfficeSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [deskCoords, setDeskCoords] = useState<Record<string, { x: number; y: number }>>({});
  const [simWorkers, setSimWorkers] = useState<SimulationWorkerState[]>(() =>
    initializeSimulationWorkers(workers)
  );

  const prevTelemetryRef = useRef<{
    workers: LiveWorker[];
    activeMissions: OfficeMission[];
    artifacts: PhysicalArtifact[];
  } | null>(null);

  // Group workers by department pods
  const hermesWorker = workers.find((w) => w.key === "hermes") || workers[0];
  const growthWorkers = workers.filter((w) =>
    ["seo_agent", "content_agent", "research_agent"].includes(w.key)
  );
  const buildWorkers = workers.filter((w) =>
    ["website_agent", "design_agent", "operations_agent"].includes(w.key)
  );
  const commsWorkers = workers.filter(
    (w) => w.key === "whatsapp_agent" || w.id.startsWith("dynamic-")
  );

  // 1. Detect Real Telemetry Events & Dispatch into Simulation
  useEffect(() => {
    const currentSnapshot = { workers, activeMissions, artifacts };
    const detectedEvents = detectOfficeEvents(prevTelemetryRef.current, currentSnapshot);
    prevTelemetryRef.current = currentSnapshot;

    if (detectedEvents.length > 0) {
      setSimWorkers((prev) => {
        let updated = [...prev];
        for (const ev of detectedEvents) {
          updated = dispatchSimulationEvent(ev, updated, activeMissions, artifacts);
        }
        return updated;
      });
    }
  }, [workers, activeMissions, artifacts]);

  // 2. Simulation Step Loop: Advances moving characters along waypoints
  useEffect(() => {
    const stepInterval = setInterval(() => {
      setSimWorkers((prev) =>
        prev.map((worker) => {
          if (worker.waypoints.length === 0) return worker;

          const [nextPoint, ...remaining] = worker.waypoints;
          const isAtDestination = remaining.length === 0;
          const desk = getDeskCoords(worker.key);
          const isReturningToDesk =
            isAtDestination &&
            Math.abs(nextPoint.x - desk.x) < 2 &&
            Math.abs(nextPoint.y - desk.y) < 2;

          return {
            ...worker,
            x: nextPoint.x,
            y: nextPoint.y,
            waypoints: remaining,
            isMoving: !isAtDestination,
            posture: isReturningToDesk
              ? "SEATED"
              : isAtDestination
              ? worker.holdingArtifact
                ? "CARRYING"
                : "STANDING"
              : worker.holdingArtifact
              ? "CARRYING"
              : "WALKING",
            activity:
              isAtDestination && worker.holdingArtifact
                ? "HANDOFF_GESTURE"
                : isReturningToDesk
                ? worker.assignedMission
                  ? "TYPING"
                  : "STANDBY_IDLE"
                : worker.activity,
            facing: nextPoint.x >= worker.x ? "right" : "left",
          };
        })
      );
    }, 900);

    return () => clearInterval(stepInterval);
  }, []);

  // 3. Ambient Environmental Life Scheduler (Coffee break / board inspection for idle agents)
  useEffect(() => {
    const ambientTimer = setInterval(() => {
      setSimWorkers((prev) => {
        // Pick an idle, stationary worker without active missions
        const candidates = prev.filter(
          (w) => !w.isMoving && !w.assignedMission && w.key !== "hermes"
        );
        if (candidates.length === 0) return prev;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        return triggerAmbientLifeEvent(prev, chosen.key);
      });
    }, 28_000); // Trigger an ambient event every 28 seconds

    return () => clearInterval(ambientTimer);
  }, []);

  // 4. Track DOM coordinates for DataTrack bezier conduits
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

  // Check if a worker is currently present at their grounded desk
  const isWorkerAtDesk = (workerKey: string) => {
    const sim = simWorkers.find((w) => w.key === workerKey);
    if (!sim) return true;
    const desk = getDeskCoords(workerKey);
    return (
      !sim.isMoving &&
      Math.abs(sim.x - desk.x) < 3 &&
      Math.abs(sim.y - desk.y) < 3 &&
      sim.posture === "SEATED"
    );
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex min-h-screen w-full flex-col justify-between overflow-x-hidden overflow-y-auto px-4 py-4 md:px-8 md:py-6 transition-transform duration-1000 select-none ${
        isAmbientMode ? "office-camera-drift" : ""
      }`}
      style={{
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
      {/* 1. ARCHITECTURAL BACK WALL & BRAND SIGN + BOARD     */}
      {/* ---------------------------------------------------- */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 pt-1 pb-4">
        {/* PHYSICAL ILLUMINATED STRATXCEL WALL SIGN */}
        <div className="relative flex items-center gap-3.5 rounded-2xl border border-white/15 bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-slate-900/90 px-6 py-3 shadow-2xl backdrop-blur-xl">
          <div className="office-sign-backlight pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-r from-indigo-500/25 via-cyan-500/25 to-emerald-500/25 blur-xl" />
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-slate-950/90 p-1.5 shadow-inner">
            <Image
              src="/logo-v2.png"
              alt="StratXcel Mark"
              width={32}
              height={32}
              className="object-contain"
              priority
            />
          </div>
          <div className="relative flex flex-col text-left">
            <span className="font-extrabold tracking-[0.26em] text-xs text-white drop-shadow-lg">
              STRATXCEL
            </span>
            <span className="font-mono text-[8px] font-bold tracking-[0.3em] text-cyan-300 uppercase">
              AI OPERATIONS HEADQUARTERS
            </span>
          </div>
          <div className="relative ml-2 pl-3 border-l border-white/10 hidden sm:flex items-center gap-1.5 font-mono text-[9px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>HQ LIVE</span>
          </div>
        </div>

        {/* IN-ENVIRONMENT PHYSICAL MISSION BOARD */}
        <div className="hidden md:block">
          <PhysicalMissionBoard missions={activeMissions} />
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 2. OFFICE ENVIRONMENT AMENITIES (Table, Lounge, Walkways) */}
      {/* ---------------------------------------------------- */}
      <OfficeEnvironment />

      {/* ---------------------------------------------------- */}
      {/* 3. REALTIME DATA CONDUITS (Active Packet Movement)   */}
      {/* ---------------------------------------------------- */}
      <DataTrack workflows={workflows} workerPositions={deskCoords} />

      {/* ---------------------------------------------------- */}
      {/* 4. WORKSPACE WORLD: STATIONS & GROUNDED DESKS        */}
      {/* ---------------------------------------------------- */}
      <div className="relative z-10 mx-auto my-auto flex w-full max-w-7xl flex-col items-center gap-10">
        {/* LEVEL 1: HERMES CEO ORCHESTRATOR HUB */}
        {hermesWorker && (
          <div className="relative flex flex-col items-center">
            <div className="relative" data-worker-id={hermesWorker.id}>
              <div className="pointer-events-none absolute -inset-8 rounded-full border border-cyan-400/20 bg-gradient-to-b from-indigo-500/10 via-cyan-500/5 to-transparent shadow-2xl" />
              <div className="pointer-events-none absolute -inset-2 rounded-full border border-dashed border-cyan-400/35 office-radar-sweep" />

              <AgentDesk
                worker={hermesWorker}
                isWorkerPresent={isWorkerAtDesk("hermes")}
                isSelected={selectedWorker?.id === hermesWorker.id}
                isHovered={hoveredWorker?.id === hermesWorker.id}
                onSelect={onSelectWorker}
                onHover={onHoverWorker}
              />
            </div>

            <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-cyan-400 font-bold">
              <span className="h-1 w-1 rounded-full bg-cyan-400 animate-ping" />
              <span>ORCHESTRATOR SUITE</span>
            </div>
          </div>
        )}

        {/* LEVEL 2: SPECIALIST WINGS */}
        <div className="grid w-full grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-14 px-2 md:px-6">
          {/* WING A: GROWTH & INTELLIGENCE */}
          <div className="relative flex flex-col items-center">
            <div className="mb-3 flex w-full items-center justify-between border-b border-white/10 pb-1.5 px-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Growth & Intelligence Wing
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                SEO · Content · Market Intel
              </span>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 w-full py-1">
              {growthWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id} className="relative">
                  <AgentDesk
                    worker={worker}
                    isWorkerPresent={isWorkerAtDesk(worker.key)}
                    isSelected={selectedWorker?.id === worker.id}
                    isHovered={hoveredWorker?.id === worker.id}
                    onSelect={onSelectWorker}
                    onHover={onHoverWorker}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* WING B: BUILD & OPERATIONS */}
          <div className="relative flex flex-col items-center">
            <div className="mb-3 flex w-full items-center justify-between border-b border-white/10 pb-1.5 px-2">
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

            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 w-full py-1">
              {buildWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id} className="relative">
                  <AgentDesk
                    worker={worker}
                    isWorkerPresent={isWorkerAtDesk(worker.key)}
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

        {/* LEVEL 3: COMMUNICATIONS & CRM */}
        {commsWorkers.length > 0 && (
          <div className="relative flex flex-col items-center max-w-4xl w-full">
            <div className="mb-3 flex w-full items-center justify-between border-b border-white/10 pb-1.5 px-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-400 shadow-sm shadow-rose-400" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-rose-400">
                  Customer Communications
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                WhatsApp · Live Conversational CRM
              </span>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-6 py-1">
              {commsWorkers.map((worker) => (
                <div key={worker.id} data-worker-id={worker.id} className="relative">
                  <AgentDesk
                    worker={worker}
                    isWorkerPresent={isWorkerAtDesk(worker.key)}
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

      {/* ---------------------------------------------------- */}
      {/* 5. DYNAMIC MOVING & WALKING CHARACTERS               */}
      {/* ---------------------------------------------------- */}
      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        {simWorkers
          .filter((w) => !isWorkerAtDesk(w.key))
          .map((sim) => {
            const rawWorker = workers.find((w) => w.key === sim.key) || hermesWorker;

            return (
              <div
                key={`moving-${sim.key}`}
                className="office-moving-agent pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all"
                style={{
                  left: `${sim.x}%`,
                  top: `${sim.y}%`,
                }}
                onClick={() => onSelectWorker(rawWorker)}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onHoverWorker(rawWorker, {
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top,
                  });
                }}
                onMouseLeave={() => onHoverWorker(null)}
              >
                <AgentCharacter
                  name={sim.name}
                  department={rawWorker.department}
                  state={rawWorker.state}
                  accentColor={sim.accentColor}
                  secondaryColor={sim.secondaryColor}
                  isHermes={sim.key === "hermes"}
                  posture={sim.posture}
                  facing={sim.facing}
                  holdingArtifact={sim.holdingArtifact}
                />

                {/* Overhead Name & Activity Pill */}
                <div className="mt-1 flex items-center justify-center">
                  <span className="rounded-full border border-white/20 bg-slate-900/90 px-2 py-0.5 font-mono text-[8px] font-bold text-slate-200 shadow-md">
                    {sim.name} · {sim.activity.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Floor Fog & Depth Occlusion */}
      <div className="pointer-events-none relative h-12 w-full bg-gradient-to-t from-[#05070a] to-transparent" />
    </div>
  );
}
