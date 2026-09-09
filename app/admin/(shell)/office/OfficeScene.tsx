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
import { OfficeEnvironment } from "./OfficeEnvironment";
import { DataTrack } from "./DataTrack";
import { Users, Sparkles, Zap, Activity } from "lucide-react";

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

  // 1. Measure viewport for responsive 16:9 cinematic scaling
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

  // Native resolution of the 3D cinematic architectural cutaway (16:9)
  const baseWidth = 1376;
  const baseHeight = 768;
  const scale = useMemo(() => {
    const availableWidth = viewportDim.width - 64; // Account for left nav rail
    const availableHeight = viewportDim.height - 24;
    const scaleX = availableWidth / baseWidth;
    const scaleY = availableHeight / baseHeight;
    return Math.min(scaleX, scaleY);
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

  // Check if a meeting is currently underway in the boardroom
  const isMeetingActive = simWorkers.some(
    (w) => w.currentLocation === "MEETING_TABLE" || w.activity === "MEETING_CHAIRING"
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
    }, 5000);

    const ambientTimer = setInterval(() => {
      setSimWorkers((prev) => {
        const candidates = prev.filter(
          (w) => !w.isMoving && !w.assignedMission && w.key !== "hermes"
        );
        if (candidates.length === 0) return prev;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        return triggerAmbientLifeEvent(prev, chosen.key);
      });
    }, 18_000);

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

  // Check if a worker is currently seated at their desk
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
      className={`relative h-screen w-screen overflow-hidden select-none bg-[#05070a] transition-transform duration-1000 ${
        isAmbientMode ? "office-camera-drift" : ""
      }`}
    >
      {/* Centered Scaled 16:9 Cinematic Stage */}
      <div
        ref={stageRef}
        className="absolute left-1/2 top-1/2 transition-transform duration-300 origin-center shadow-2xl"
        style={{
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: `translate(calc(-50% + 32px), -50%) scale(${scale})`,
        }}
      >
        {/* ---------------------------------------------------- */}
        {/* 1. 3D ARCHITECTURAL CUTAWAY ENVIRONMENT             */}
        {/* ---------------------------------------------------- */}
        <OfficeEnvironment
          hermesObjective={hermesWorker?.statusLabel || "Planning next steps... 12 missions in progress"}
          isMeetingActive={isMeetingActive}
          activeCount={activeMissions.length || 12}
          onSelectRoom={(roomKey) => {
            const target = workers.find(
              (w) => w.department === roomKey || w.key.includes(roomKey)
            );
            if (target) onSelectWorker(target);
          }}
        />

        {/* ---------------------------------------------------- */}
        {/* 2. REALTIME DATA CONDUITS (Active Packet Movement)   */}
        {/* ---------------------------------------------------- */}
        <DataTrack workflows={workflows} workerPositions={deskCoords} />

        {/* ---------------------------------------------------- */}
        {/* 3. GROUNDED WORKSPACE DESKS IN PHYSICAL 3D ROOMS     */}
        {/* ---------------------------------------------------- */}

        {/* PENTHOUSE: CEO / HERMES EXECUTIVE SUITE */}
        {hermesWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "45%", top: "25%" }}
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
          </div>
        )}

        {/* PENTHOUSE: BOARDROOM ACTIVE MEETING PARTICIPANTS OVERLAY */}
        {isMeetingActive && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-3"
            style={{ left: "61.5%", top: "25%" }}
          >
            <div className="flex -space-x-2 overflow-hidden rounded-full border border-indigo-400/40 bg-slate-950/80 p-1 shadow-2xl backdrop-blur-md">
              <span className="h-6 w-6 rounded-full bg-indigo-500/30 border border-indigo-400 text-[10px] flex items-center justify-center font-bold text-indigo-200">
                H
              </span>
              <span className="h-6 w-6 rounded-full bg-emerald-500/30 border border-emerald-400 text-[10px] flex items-center justify-center font-bold text-emerald-200">
                M
              </span>
              <span className="h-6 w-6 rounded-full bg-amber-500/30 border border-amber-400 text-[10px] flex items-center justify-center font-bold text-amber-200">
                A
              </span>
            </div>
          </div>
        )}

        {/* LEVEL 2: MID-UPPER FLOOR ROOMS */}

        {/* Research Pod (Athena) */}
        {researchWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "14.5%", top: "45%" }}
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

        {/* Marketing Pod (Calliope) */}
        {marketingWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "25.5%", top: "45%" }}
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

        {/* Sales Pod (Mercury) */}
        {salesWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "36.5%", top: "45%" }}
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

        {/* Operations Pod (Atlas) */}
        {operationsWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "61.5%", top: "45%" }}
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

        {/* Finance Pod (Plutus) */}
        {financeWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "73.5%", top: "45%" }}
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

        {/* LEVEL 1: LOWER-MID FLOOR ROOMS */}

        {/* Engineering Pod (Vulcan) */}
        {engineeringWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "14.5%", top: "63%" }}
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

        {/* People & HR Pod (Hestia) */}
        {peopleWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "26.5%", top: "63%" }}
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

        {/* CRM Pod (Vesta / Iris) */}
        {crmWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "63.5%", top: "63%" }}
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

        {/* SEO & Analytics Pod (Aether) */}
        {seoWorker && (
          <div
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: "75.5%", top: "63%" }}
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

        {/* ---------------------------------------------------- */}
        {/* 4. DYNAMIC MOVING & WALKING CHARACTERS               */}
        {/* ---------------------------------------------------- */}
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
          {simWorkers
            .filter((sim) => sim.isMoving || !isWorkerAtDesk(sim.key))
            .map((sim) => {
              const liveData = workers.find((w) => w.key === sim.key);
              return (
                <div
                  key={sim.key}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-linear pointer-events-auto cursor-pointer"
                  style={{
                    left: `${sim.x}%`,
                    top: `${sim.y}%`,
                  }}
                  onClick={() => {
                    if (liveData) onSelectWorker(liveData);
                  }}
                  onMouseEnter={(e) => {
                    if (liveData) {
                      onHoverWorker(liveData, {
                        clientX: e.clientX,
                        clientY: e.clientY,
                      });
                    }
                  }}
                  onMouseLeave={() => onHoverWorker(null)}
                >
                  <AgentCharacter
                    name={sim.name}
                    department={liveData?.department || "sales"}
                    state={liveData?.state || "WORKING"}
                    accentColor={sim.accentColor}
                    secondaryColor={sim.secondaryColor}
                    isHermes={sim.key === "hermes"}
                    posture={sim.posture}
                    facing={sim.facing}
                    holdingArtifact={sim.holdingArtifact}
                  />
                  <div className="mt-1 flex items-center justify-center gap-1 rounded-full border border-white/20 bg-slate-950/85 px-2 py-0.5 shadow-lg backdrop-blur-md text-[8px] font-mono whitespace-nowrap">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: sim.accentColor }}
                    />
                    <span className="font-bold text-white">{sim.name}</span>
                    <span className="text-slate-400 font-normal">· {sim.activity.replace(/_/g, " ")}</span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
