"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LiveWorker, OfficeTelemetry } from "./office-types";
import { OfficeStatusBar } from "./OfficeStatusBar";
import { OfficeScene } from "./OfficeScene";
import { AgentHoverCard } from "./AgentHoverCard";
import { AgentDetailDrawer } from "./AgentDetailDrawer";
import { OfficeCommandDock } from "./OfficeCommandDock";
import { AmbientModeOverlay } from "./AmbientModeOverlay";
import { ActivityPanel } from "./ActivityPanel";
import "./office-animations.css";

interface OfficeWorkspaceProps {
  initialTelemetry: OfficeTelemetry;
}

// 25 seconds of inactivity transitions into cinematic screensaver mode
const INACTIVITY_TIMEOUT_MS = 25_000;

export function OfficeWorkspace({ initialTelemetry }: OfficeWorkspaceProps) {
  const { active } = useCurrentTenant();
  const [telemetry, setTelemetry] = useState<OfficeTelemetry>(initialTelemetry);
  const [selectedWorker, setSelectedWorker] = useState<LiveWorker | null>(null);
  const [hoveredWorker, setHoveredWorker] = useState<LiveWorker | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAmbientMode, setIsAmbientMode] = useState(false);
  const [mouseActive, setMouseActive] = useState(true);
  const [isActivityPanelOpen, setIsActivityPanelOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mouseFadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch updated telemetry for active tenant
  const fetchTelemetry = useCallback(async () => {
    const tenantId = active?.tenantId || initialTelemetry.tenantId;
    if (!tenantId) return;

    try {
      const res = await fetch(`/api/platform/admin/office/telemetry?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.telemetry) {
          setTelemetry(data.telemetry);
        }
      }
    } catch (err) {
      console.error("[OFFICE_FETCH_ERROR]", err);
    }
  }, [active?.tenantId, initialTelemetry.tenantId]);

  // Re-fetch when tenant changes in ClientSwitcher
  useEffect(() => {
    if (active?.tenantId && active.tenantId !== telemetry.tenantId) {
      fetchTelemetry();
    }
  }, [active?.tenantId, telemetry.tenantId, fetchTelemetry]);

  // Supabase Realtime Subscription + 10s Fallback Heartbeat Sync
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const tenantId = active?.tenantId || initialTelemetry.tenantId;
    if (!tenantId) return;

    // Realtime channel on missions
    const channel = supabase
      .channel(`office-missions-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "missions",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          fetchTelemetry();
        }
      )
      .subscribe();

    // 10s polling for live EC2 worker heartbeats
    const heartbeatInterval = setInterval(() => {
      fetchTelemetry();
    }, 10_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(heartbeatInterval);
    };
  }, [active?.tenantId, initialTelemetry.tenantId, fetchTelemetry]);

  // Reset inactivity timer for Screensaver / Ambient Mode
  const handleUserActivity = useCallback(() => {
    setMouseActive(true);
    if (isAmbientMode) {
      setIsAmbientMode(false);
    }

    if (mouseFadeTimerRef.current) clearTimeout(mouseFadeTimerRef.current);
    mouseFadeTimerRef.current = setTimeout(() => {
      setMouseActive(false);
    }, 4000);

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setIsAmbientMode(true);
    }, INACTIVITY_TIMEOUT_MS);
  }, [isAmbientMode]);

  useEffect(() => {
    window.addEventListener("mousemove", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("touchstart", handleUserActivity);
    handleUserActivity();

    return () => {
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (mouseFadeTimerRef.current) clearTimeout(mouseFadeTimerRef.current);
    };
  }, [handleUserActivity]);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {
        setIsFullscreen(true);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Hover handler
  const handleHoverWorker = (
    worker: LiveWorker | null,
    event?: { clientX: number; clientY: number }
  ) => {
    if (!worker || !event) {
      setHoveredWorker(null);
      setHoverPosition(null);
      return;
    }
    setHoveredWorker(worker);
    setHoverPosition({ x: event.clientX, y: event.clientY });
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-[#06080d] select-none font-sans text-slate-100"
    >
      {/* 1. Subtle Floating Top HUD (Status, Clock, Controls) */}
      <OfficeStatusBar
        telemetry={telemetry}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onEnterAmbientMode={() => setIsAmbientMode(true)}
        isAmbientMode={isAmbientMode}
        mouseActive={mouseActive}
        isActivityPanelOpen={isActivityPanelOpen}
        onToggleActivityPanel={() => setIsActivityPanelOpen((prev) => !prev)}
      />

      {/* 2. Main Full-Bleed 2.5D Digital Office Scene */}
      <OfficeScene
        workers={telemetry.workers}
        workflows={telemetry.workflows}
        artifacts={telemetry.artifacts}
        activeMissions={telemetry.activeMissions}
        selectedWorker={selectedWorker}
        hoveredWorker={hoveredWorker}
        onSelectWorker={setSelectedWorker}
        onHoverWorker={handleHoverWorker}
        isAmbientMode={isAmbientMode}
      />

      {/* 3. Floating Corner Command Dock (Hermes Pill -> Expands upward, Never covers agents) */}
      <OfficeCommandDock
        tenantId={active?.tenantId || initialTelemetry.tenantId}
        onCommandSubmitted={(cmd) => {
          const lower = cmd.toLowerCase();
          setTelemetry((prev) => {
            const updatedWorkers = prev.workers.map((w) => {
              if (w.key === "hermes") {
                return {
                  ...w,
                  state: "PLANNING" as const,
                  statusLabel: `Orchestrating: ${cmd.slice(0, 26)}...`,
                };
              }
              if (
                (lower.includes("seo") || lower.includes("keyword") || lower.includes("search")) &&
                w.key === "seo_agent"
              ) {
                return {
                  ...w,
                  state: "SEARCHING" as const,
                  statusLabel: "Running SEO Discovery...",
                };
              }
              if (
                (lower.includes("lead") || lower.includes("crm") || lower.includes("pipeline") || lower.includes("client") || lower.includes("solar") || lower.includes("admission") || lower.includes("linkup")) &&
                (w.key === "whatsapp_agent" || w.key === "sales_agent")
              ) {
                return {
                  ...w,
                  state: "WORKING" as const,
                  statusLabel: "Qualifying ICP Leads...",
                };
              }
              if (
                (lower.includes("website") || lower.includes("site") || lower.includes("page") || lower.includes("build") || lower.includes("engineering")) &&
                (w.key === "website_agent" || w.key === "engineering_agent")
              ) {
                return {
                  ...w,
                  state: "WORKING" as const,
                  statusLabel: "Synthesizing Full-Stack Layout...",
                };
              }
              if (
                (lower.includes("post") || lower.includes("content") || lower.includes("social") || lower.includes("campaign")) &&
                (w.key === "content_agent" || w.key === "marketing_agent")
              ) {
                return {
                  ...w,
                  state: "GENERATING" as const,
                  statusLabel: "Drafting Editorial Campaign...",
                };
              }
              if (
                (lower.includes("competitor") || lower.includes("research") || lower.includes("market") || lower.includes("intel")) &&
                w.key === "research_agent"
              ) {
                return {
                  ...w,
                  state: "ANALYZING" as const,
                  statusLabel: "Synthesizing Market Evidence...",
                };
              }
              if (
                (lower.includes("finance") || lower.includes("revenue") || lower.includes("pricing") || lower.includes("money") || lower.includes("lakh")) &&
                w.key === "finance_agent"
              ) {
                return {
                  ...w,
                  state: "ANALYZING" as const,
                  statusLabel: "Modeling Pro-Forma Economics...",
                };
              }
              return w;
            });

            // Create immediate live activity for real-time observability in the Harness panel
            const newActivity = {
              id: `cmd-${Date.now()}`,
              workerKey: "hermes",
              workerName: "Hermes",
              role: "CEO & Orchestrator",
              department: "executive" as const,
              departmentLabel: "CEO & Executive",
              state: "PLANNING" as const,
              missionId: `local-${Date.now()}`,
              missionGoal: cmd,
              currentStep: "executive_reasoning",
              elapsedTime: "0s",
              latestEvent: "Founder directive received",
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            return {
              ...prev,
              workers: updatedWorkers,
              liveActivities: [newActivity, ...(prev.liveActivities || [])],
            };
          });
        }}
        onRefreshTelemetry={fetchTelemetry}
        isAmbientMode={isAmbientMode}
      />

      {/* 4. Harness-Style Resizable Live Activity Panel */}
      <ActivityPanel
        activities={telemetry.liveActivities || []}
        isOpen={isActivityPanelOpen}
        onToggle={() => setIsActivityPanelOpen((prev) => !prev)}
        onSelectWorkerKey={(key) => {
          const target = telemetry.workers.find((w) => w.key === key);
          if (target) setSelectedWorker(target);
        }}
      />

      {/* 5. Compact AR Hover "Eye" Bubble */}
      <AgentHoverCard worker={hoveredWorker} position={hoverPosition} />

      {/* 6. Click Detail Inspector Drawer */}
      <AgentDetailDrawer
        worker={selectedWorker}
        onClose={() => setSelectedWorker(null)}
      />

      {/* 7. Screensaver / Ambient Mode Overlay Indicator */}
      <AmbientModeOverlay
        isActive={isAmbientMode}
        telemetry={telemetry}
        onWake={() => setIsAmbientMode(false)}
      />
    </div>
  );
}
