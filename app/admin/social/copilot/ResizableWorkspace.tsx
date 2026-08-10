"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

const STORAGE_KEY = "saut:copilot:workspace-layout";
const LEFT_MIN = 180;
const LEFT_MAX = 360;
const RIGHT_MIN = 260;
const RIGHT_MAX = 440;
const KEYBOARD_STEP = 16;

interface LayoutState {
  leftWidth: number;
  rightWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
}

const DEFAULT_LAYOUT: LayoutState = {
  leftWidth: 220,
  rightWidth: 310,
  leftOpen: true,
  rightOpen: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function Splitter({
  side,
  value,
  min,
  max,
  onChange,
  onCollapse,
}: {
  side: "left" | "right";
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onCollapse: () => void;
}) {
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = value;
    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      onChange(clamp(startWidth + (side === "left" ? delta : -delta), min, max));
    };
    const stop = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div
      role="separator"
      aria-label={`Resize ${side} Copilot pane`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className="saut-workspace-splitter"
      onPointerDown={startResize}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          onChange(clamp(value + direction * KEYBOARD_STEP * (side === "left" ? 1 : -1), min, max));
        }
        if (event.key === "Home") onChange(min);
        if (event.key === "End") onChange(max);
      }}
    >
      <span aria-hidden className="saut-workspace-splitter-line" />
      <button
        type="button"
        className="saut-workspace-collapse"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onCollapse}
        aria-label={`Collapse ${side} Copilot pane`}
        title={`Collapse ${side} pane`}
      >
        {side === "left" ? "\u2039" : "\u203a"}
      </button>
    </div>
  );
}

export function ResizableWorkspace({
  left,
  center,
  progress,
  context,
}: {
  left: ReactNode;
  center: ReactNode;
  progress: ReactNode;
  context: ReactNode;
}) {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "progress" | "context">("chat");

  useEffect(() => {
    const restoreLayout = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<LayoutState> | null;
        if (stored) {
          setLayout({
            leftWidth: clamp(Number(stored.leftWidth) || DEFAULT_LAYOUT.leftWidth, LEFT_MIN, LEFT_MAX),
            rightWidth: clamp(Number(stored.rightWidth) || DEFAULT_LAYOUT.rightWidth, RIGHT_MIN, RIGHT_MAX),
            leftOpen: stored.leftOpen !== false,
            rightOpen: stored.rightOpen !== false,
          });
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      setLayoutReady(true);
    }, 0);
    return () => window.clearTimeout(restoreLayout);
  }, []);

  useEffect(() => {
    if (layoutReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout, layoutReady]);

  const columns = [
    layout.leftOpen ? `${layout.leftWidth}px` : "0px",
    layout.leftOpen ? "8px" : "0px",
    "minmax(420px, 1fr)",
    layout.rightOpen ? "8px" : "0px",
    layout.rightOpen ? `${layout.rightWidth}px` : "0px",
  ].join(" ");

  return (
    <div className="saut-agent-workspace">
      <div className="saut-mobile-workspace-tabs" role="tablist" aria-label="Copilot workspace panels">
        {(["chat", "progress", "context"] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={mobileTab === tab} onClick={() => setMobileTab(tab)}>
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="saut-desktop-workspace" data-mobile-tab={mobileTab} style={{ gridTemplateColumns: columns }}>
        <div className={`min-h-0 min-w-0 overflow-hidden ${layout.leftOpen ? "" : "invisible"}`}>{left}</div>
        {layout.leftOpen ? (
          <Splitter
            side="left"
            value={layout.leftWidth}
            min={LEFT_MIN}
            max={LEFT_MAX}
            onChange={(leftWidth) => setLayout((current) => ({ ...current, leftWidth }))}
            onCollapse={() => setLayout((current) => ({ ...current, leftOpen: false }))}
          />
        ) : null}
        <div className="saut-workspace-center relative min-h-0 min-w-0">
          {!layout.leftOpen && (
            <button type="button" className="saut-pane-restore left-2" onClick={() => setLayout((current) => ({ ...current, leftOpen: true }))} aria-label="Show session rail" title="Show session rail">
              Sessions &gt;
            </button>
          )}
          {!layout.rightOpen && (
            <button type="button" className="saut-pane-restore right-2" onClick={() => setLayout((current) => ({ ...current, rightOpen: true }))} aria-label="Show progress rail" title="Show progress rail">
              &lt; Progress
            </button>
          )}
          {center}
        </div>
        {layout.rightOpen ? (
          <Splitter
            side="right"
            value={layout.rightWidth}
            min={RIGHT_MIN}
            max={RIGHT_MAX}
            onChange={(rightWidth) => setLayout((current) => ({ ...current, rightWidth }))}
            onCollapse={() => setLayout((current) => ({ ...current, rightOpen: false }))}
          />
        ) : null}
        {/*
          Fixed live console, not a long document: the rail itself never
          scrolls as one blob (no overflow-y here) — .saut-workspace-progress
          is the one flexible region with its own internal scroller, and
          .saut-workspace-context is pinned below it with a bounded height of
          its own. See Section 5/6 of the live-progress cleanup brief.
        */}
        <aside className={`saut-agent-rail saut-agent-right flex min-h-0 min-w-0 flex-col overflow-hidden ${layout.rightOpen ? "" : "invisible"}`} aria-label="Progress and context">
          <div className="saut-workspace-progress">{progress}</div>
          <div className="saut-workspace-context">{context}</div>
        </aside>
      </div>
    </div>
  );
}
