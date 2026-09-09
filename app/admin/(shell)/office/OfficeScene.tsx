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
  const stageRef = useRef<HTMLDivElement>(null);
  const [deskCoords, setDeskCoords] = useState<Record<string, { x: number; y: number }>>({});
  const [viewportDim, setViewportDim] = useState({ width: 1440, height: 900 });

  const [simWorkers, setSimWorkers] = useState<SimulationWorkerState[]>(() =>
    initializeSimulationWorkers(workers)
  );

  const prevTelemetryRef = useRef<{
    workers: LiveWorker[];
    activeMissions: OfficeMission[];
    artifacts: PhysicalArtifact[];
  } | null>(null);

  // 1. Measure viewport for responsive 2.5D isometric scaling
  useEffect(() => {
    function updateDimensions() {
      setViewportDim({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const baseWidth = 1480;
  const baseHeight = 880;
  const scale = useMemo(() => {
    const scaleX = viewportDim.width / baseWidth;
    const scaleY = (viewportDim.height - 40) / baseHeight;
    return Math.min(scaleX, scaleY, 1.25);
  }, [viewportDim.width, viewportDim.height]);

  // 2. Map department specialists from workforce roster
  const hermesWorker = workers.find((w) => w.key === "hermes") || workers[0];
  const salesWorker = workers.find(
    (w) => w.department === "sales" || w.key === "sales_agent" || w.key === "whatsapp_agent"
  );
  const crmWorker = workers.find(
    (w) => w.department === "crm" || w.key === "crm_agent" || w.key === "design_agent"
  );
  const researchWorker = workers.find(
    (w) => w.department === "research" || w.key === "research_agent"
  );
  const seoWorker = workers.find((w) => w.department === "seo" || w.key === "seo_agent");
  const marketingWorker = workers.find(
    (w) => w.department === "marketing" || w.department === "content" || w.key === "content_agent"
  );
  const financeWorker = workers.find(
    (w) => w.department === "finance" || w.key === "finance_agent"
  );
  const engineeringWorker = workers.find(
    (w) => w.department === "engineering" || w.department === "website" || w.key === "website_agent"
  );
  const operationsWorker = workers.find(
    (w) => w.department === "operations" || w.key === "operations_agent"
  );
  const peopleWorker = workers.find(
    (w) => w.department === "people" || w.key === "people_agent"
  );

  // 3. Detect Real Telemetry Events & Dispatch into Simulation
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

  // 4. Simulation Step Loop: Advances moving characters along waypoints
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

  // 5. Ambient Environmental Life Scheduler (Honest idle breaks in Coffee/Kitchen/Gaming/Relaxation)
  useEffect(() => {
    const initialAmbientTimer = setTimeout(() => {
      setSimWorkers((prev) => {
        const candidates = prev.filter(
          (w) => !w.isMoving && !w.assignedMission && w.key !== "hermes"
        );
        if (candidates.length === 0) return prev;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        return triggerAmbientLifeEvent(prev, chosen.key);
      });
    }, 4000);

    const ambientTimer = setInterval(() => {
      setSimWorkers((prev) => {
        const candidates = prev.filter(
          (w) => !w.isMoving && !w.assignedMission && w.key !== "hermes"
        );
        if (candidates.length === 0) return prev;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        return triggerAmbientLifeEvent(prev, chosen.key);
      });
    }, 16_000);

    return () => {
      clearTimeout(initialAmbientTimer);
      clearInterval(ambientTimer);
    };
  }, []);

  // 6. Track DOM coordinates for DataTrack bezier conduits
  useEffect(() => {
    function updateCoords() {
      if (!stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const coords: Record<string, { x: number; y: number }> = {};

      const deskElements = stageRef.current.querySelectorAll("[data-worker-id]");
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
  }, [workers, scale]);

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
      className={`relative h-screen w-screen overflow-hidden select-none transition-transform duration-1000 ${
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
      {/* Centered Scaled 2.5D Isometric Stage */}
      <div
        ref={stageRef}
        className="absolute left-1/2 top-1/2 transition-transform duration-300 origin-center"
        style={{
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {/* ---------------------------------------------------- */}
        {/* 1. ARCHITECTURAL TOP BRAND SIGN & MISSION BOARD     */}
        {/* ---------------------------------------------------- */}
        <div className="absolute top-4 left-8 right-8 z-10 flex items-center justify-between pointer-events-none">
          {/* StratXcel Wall Sign */}
          <div className="pointer-events-auto relative flex items-center gap-3 rounded-2xl border border-white/15 bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-slate-900/90 px-5 py-2.5 shadow-2xl backdrop-blur-xl">
            <div className="office-sign-backlight pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-r from-indigo-500/25 via-cyan-500/25 to-emerald-500/25 blur-xl" />
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-slate-950/90 p-1.5 shadow-inner">
              <Image
                src="/logo-v2.png"
                alt="StratXcel Mark"
                width={28}
                height={28}
                className="object-contain"
                priority
              />
            </div>
            <div className="relative flex flex-col text-left">
              <span className="font-extrabold tracking-[0.24em] text-xs text-white drop-shadow-lg">
                STRATXCEL
              </span>
              <span className="font-mono text-[8px] font-bold tracking-[0.28em] text-cyan-300 uppercase">
                AUTONOMOUS COMPANY HEADQUARTERS
              </span>
            </div>
            <div className="relative ml-2 pl-3 border-l border-white/10 hidden sm:flex items-center gap-1.5 font-mono text-[9px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>HQ ACTIVE</span>
            </div>
          </div>

          {/* Physical Mission Board */}
          <div className="pointer-events-auto">
            <PhysicalMissionBoard missions={activeMissions} />
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* 2. OFFICE ENVIRONMENT (14 Rooms, Corridors, Mats)   */}
        {/* ---------------------------------------------------- */}
        <OfficeEnvironment />

        {/* ---------------------------------------------------- */}
        {/* 3. REALTIME DATA CONDUITS (Active Packet Movement)   */}
        {/* ---------------------------------------------------- */}
        <DataTrack workflows={workflows} workerPositions={deskCoords} />

        {/* ---------------------------------------------------- */}
        {/* 4. WORKSPACE GROUNDED DESKS (10 Dedicated Depts)     */}
        {/* ---------------------------------------------------- */}
        {/* LEVEL 1: CEO / HERMES ORCHESTRATOR SUITE */}
        {hermesWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "50%", top: "140px" }}
            data-worker-id={hermesWorker.id}
          >
            <AgentDesk
              worker={hermesWorker}
              isWorkerPresent={isWorkerAtDesk("hermes")}
              isSelected={selectedWorker?.id === hermesWorker.id}
              isHovered={hoveredWorker?.id === hermesWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
            <div className="mt-0.5 flex items-center justify-center gap-1 font-mono text-[8px] uppercase tracking-[0.25em] text-cyan-400 font-bold">
              <span className="h-1 w-1 rounded-full bg-cyan-400 animate-ping" />
              <span>EXECUTIVE CEO SUITE</span>
            </div>
          </div>
        )}

        {/* LEVEL 2: MIDDLE ROW OF SPECIALISTS (Sales, CRM, Research, SEO, Marketing, Finance) */}
        {/* Sales Pod (Mercury) */}
        {salesWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "16%", top: "520px" }}
            data-worker-id={salesWorker.id}
          >
            <AgentDesk
              worker={salesWorker}
              isWorkerPresent={isWorkerAtDesk(salesWorker.key)}
              isSelected={selectedWorker?.id === salesWorker.id}
              isHovered={hoveredWorker?.id === salesWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

        {/* CRM Pod (Vesta / Iris) */}
        {crmWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "28%", top: "520px" }}
            data-worker-id={crmWorker.id}
          >
            <AgentDesk
              worker={crmWorker}
              isWorkerPresent={isWorkerAtDesk(crmWorker.key)}
              isSelected={selectedWorker?.id === crmWorker.id}
              isHovered={hoveredWorker?.id === crmWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

        {/* Research Pod (Athena) */}
        {researchWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "40%", top: "520px" }}
            data-worker-id={researchWorker.id}
          >
            <AgentDesk
              worker={researchWorker}
              isWorkerPresent={isWorkerAtDesk(researchWorker.key)}
              isSelected={selectedWorker?.id === researchWorker.id}
              isHovered={hoveredWorker?.id === researchWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

        {/* SEO Pod (Aether) */}
        {seoWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "60%", top: "520px" }}
            data-worker-id={seoWorker.id}
          >
            <AgentDesk
              worker={seoWorker}
              isWorkerPresent={isWorkerAtDesk(seoWorker.key)}
              isSelected={selectedWorker?.id === seoWorker.id}
              isHovered={hoveredWorker?.id === seoWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

        {/* Marketing Pod (Calliope) */}
        {marketingWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "72%", top: "520px" }}
            data-worker-id={marketingWorker.id}
          >
            <AgentDesk
              worker={marketingWorker}
              isWorkerPresent={isWorkerAtDesk(marketingWorker.key)}
              isSelected={selectedWorker?.id === marketingWorker.id}
              isHovered={hoveredWorker?.id === marketingWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

        {/* Finance Pod (Plutus) */}
        {financeWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "84%", top: "520px" }}
            data-worker-id={financeWorker.id}
          >
            <AgentDesk
              worker={financeWorker}
              isWorkerPresent={isWorkerAtDesk(financeWorker.key)}
              isSelected={selectedWorker?.id === financeWorker.id}
              isHovered={hoveredWorker?.id === financeWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

        {/* LEVEL 3: SOUTH ROW (Engineering, Operations, People) */}
        {/* Engineering Pod (Vulcan) */}
        {engineeringWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "22%", top: "690px" }}
            data-worker-id={engineeringWorker.id}
          >
            <AgentDesk
              worker={engineeringWorker}
              isWorkerPresent={isWorkerAtDesk(engineeringWorker.key)}
              isSelected={selectedWorker?.id === engineeringWorker.id}
              isHovered={hoveredWorker?.id === engineeringWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

        {/* Operations Cloud Fleet Pod (Atlas) */}
        {operationsWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "50%", top: "690px" }}
            data-worker-id={operationsWorker.id}
          >
            <AgentDesk
              worker={operationsWorker}
              isWorkerPresent={isWorkerAtDesk(operationsWorker.key)}
              isSelected={selectedWorker?.id === operationsWorker.id}
              isHovered={hoveredWorker?.id === operationsWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

        {/* People & Talent Pod (Hestia) */}
        {peopleWorker && (
          <div
            className="absolute z-20 -translate-x-1/2"
            style={{ left: "78%", top: "690px" }}
            data-worker-id={peopleWorker.id}
          >
            <AgentDesk
              worker={peopleWorker}
              isWorkerPresent={isWorkerAtDesk(peopleWorker.key)}
              isSelected={selectedWorker?.id === peopleWorker.id}
              isHovered={hoveredWorker?.id === peopleWorker.id}
              onSelect={onSelectWorker}
              onHover={onHoverWorker}
            />
          </div>
        )}

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
                    <span className="rounded-full border border-white/20 bg-slate-900/95 px-2 py-0.5 font-mono text-[8px] font-bold text-slate-200 shadow-md">
                      {sim.name} · {sim.activity.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
