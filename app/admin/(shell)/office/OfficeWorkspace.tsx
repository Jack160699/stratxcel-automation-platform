"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LiveWorker, OfficeTelemetry } from "./office-types";
import { OfficeStatusBar } from "./OfficeStatusBar";
import { OfficeScene } from "./OfficeScene";
import { AgentHoverCard } from "./AgentHoverCard";
import { AgentDetailDrawer } from "./AgentDetailDrawer";
import { HermesCommandBar } from "./HermesCommandBar";
import { AmbientModeOverlay } from "./AmbientModeOverlay";
import "./office-animations.css";

interface OfficeWorkspaceProps {
  initialTelemetry: OfficeTelemetry;
}

const INACTIVITY_TIMEOUT_MS = 60_000; // 60s inactivity triggers screensaver

export function OfficeWorkspace({ initialTelemetry }: OfficeWorkspaceProps) {
  const { active } = useCurrentTenant();
  const [telemetry, setTelemetry] = useState<OfficeTelemetry>(initialTelemetry);
  const [selectedWorker, setSelectedWorker] = useState<LiveWorker | null>(null);
  const [hoveredWorker, setHoveredWorker] = useState<LiveWorker | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAmbientMode, setIsAmbientMode] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch updated telemetry for active tenant
  const fetchTelemetry = useCallback(async () => {
    const tenantId = active?.tenantId || initialTelemetry.tenantId;
    if (!tenantId) return;

    try {
      setIsRefreshing(true);
      const res = await fetch(`/api/platform/admin/office/telemetry?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.telemetry) {
          setTelemetry(data.telemetry);
        }
      }
    } catch (err) {
      console.error("[OFFICE_FETCH_ERROR]", err);
    } finally {
      setIsRefreshing(false);
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

    // 10s fallback polling for live EC2 worker heartbeats
    const heartbeatInterval = setInterval(() => {
      fetchTelemetry();
    }, 10_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(heartbeatInterval);
    };
  }, [active?.tenantId, initialTelemetry.tenantId, fetchTelemetry]);

  // Reset inactivity timer for Screensaver / Ambient Mode
  const resetInactivityTimer = useCallback(() => {
    if (isAmbientMode) {
      setIsAmbientMode(false);
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      setIsAmbientMode(true);
    }, INACTIVITY_TIMEOUT_MS);
  }, [isAmbientMode]);

  useEffect(() => {
    function handleUserActivity() {
      resetInactivityTimer();
    }

    window.addEventListener("mousemove", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);
    window.addEventListener("touchstart", handleUserActivity);
    resetInactivityTimer();

    return () => {
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [resetInactivityTimer]);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {
        // Fallback: Viewport CSS Fullscreen
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
  const handleHoverWorker = (worker: LiveWorker | null, event?: React.MouseEvent) => {
    if (!worker || !event) {
      setHoveredWorker(null);
      setHoverPosition(null);
      return;
    }
    setHoveredWorker(worker);
    setHoverPosition({ x: event.clientX, y: event.clientY - 20 });
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col gap-4 font-sans text-slate-100 transition-all duration-500 ${
        isFullscreen
          ? "fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-6"
          : "min-h-[calc(100vh-5rem)]"
      }`}
    >
      {/* 1. Live Office Status Bar */}
      <OfficeStatusBar
        telemetry={telemetry}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onEnterAmbientMode={() => setIsAmbientMode(true)}
        onRefresh={fetchTelemetry}
        isRefreshing={isRefreshing}
      />

      {/* 2. Main 2.5D Digital Office Scene */}
      <OfficeScene
        workers={telemetry.workers}
        workflows={telemetry.workflows}
        selectedWorker={selectedWorker}
        hoveredWorker={hoveredWorker}
        onSelectWorker={setSelectedWorker}
        onHoverWorker={handleHoverWorker}
        isAmbientMode={isAmbientMode}
      />

      {/* 3. Executive Hermes CEO Command Bar */}
      <HermesCommandBar
        onCommandSubmitted={(cmd) => {
          // Immediately set Hermes to thinking while processing
          setTelemetry((prev) => ({
            ...prev,
            workers: prev.workers.map((w) =>
              w.key === "hermes"
                ? { ...w, state: "THINKING", statusLabel: `Processing: "${cmd.slice(0, 30)}..."` }
                : w
            ),
          }));
        }}
        onRefreshTelemetry={fetchTelemetry}
      />

      {/* 4. Hover "Eye" Floating Card */}
      <AgentHoverCard worker={hoveredWorker} position={hoverPosition} />

      {/* 5. Click Detail Inspector Drawer */}
      <AgentDetailDrawer
        worker={selectedWorker}
        onClose={() => setSelectedWorker(null)}
      />

      {/* 6. Screensaver / Ambient Mode Overlay */}
      <AmbientModeOverlay
        isActive={isAmbientMode}
        telemetry={telemetry}
        onWake={() => setIsAmbientMode(false)}
      />
    </div>
  );
}
