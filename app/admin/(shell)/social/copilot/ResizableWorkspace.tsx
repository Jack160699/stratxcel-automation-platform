"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

const STORAGE_KEY = "saut:copilot:workspace-layout";
const LEFT_MIN = 200;
const LEFT_MAX = 280;
const RIGHT_MIN = 280;
const RIGHT_MAX = 340;
const COLLAPSED_STRIP = 48;
const KEYBOARD_STEP = 16;
const DRAWER_LEFT_WIDTH = 260;
const DRAWER_RIGHT_WIDTH = 300;

interface LayoutState {
  leftWidth: number;
  rightWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
}

const DEFAULT_LAYOUT: LayoutState = {
  leftWidth: 232,
  rightWidth: 300,
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

function CollapsedRailStrip({
  side,
  label,
  onExpand,
}: {
  side: "left" | "right";
  label: string;
  onExpand: () => void;
}) {
  return (
    <div className={`saut-workspace-rail-strip saut-workspace-rail-strip-${side}`} aria-label={`${label} collapsed`} data-collapsed-rail={side}>
      <button type="button" className="saut-workspace-rail-expand" onClick={onExpand} aria-label={`Expand ${label}`} title={`Expand ${label}`}>
        <span aria-hidden>{side === "left" ? "\u2630" : "\u2261"}</span>
      </button>
    </div>
  );
}

function GridSlot({ column, children, className }: { column: number; children?: ReactNode; className?: string }) {
  return (
    <div className={className ?? "saut-workspace-slot"} style={{ gridColumn: column, minWidth: 0, minHeight: 0 }}>
      {children}
    </div>
  );
}

/**
 * Desktop workspace grid.
 * - RUNNING: docked resizable rails (in-flow).
 * - READY / Focus: center stays full width; sessions & activity open as overlay drawers
 *   so card geometry never reflows.
 */
export function ResizableWorkspace({
  left,
  center,
  progress,
  context,
  focusMode = false,
  readyReview = false,
  onExitFocus,
}: {
  left: ReactNode;
  center: ReactNode;
  progress: ReactNode;
  context: ReactNode;
  focusMode?: boolean;
  readyReview?: boolean;
  onExitFocus?: () => void;
}) {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "progress" | "context">("chat");
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const preFocusOpenRef = useRef<{ leftOpen: boolean; rightOpen: boolean } | null>(null);

  /** Overlay drawers: READY review and Focus — center width stays stable. */
  const overlayRails = focusMode || readyReview;

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

  useEffect(() => {
    if (focusMode) {
      setLayout((current) => {
        if (current.leftOpen || current.rightOpen) {
          preFocusOpenRef.current = { leftOpen: current.leftOpen, rightOpen: current.rightOpen };
          return { ...current, leftOpen: false, rightOpen: false };
        }
        return current;
      });
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
      return;
    }
    if (preFocusOpenRef.current) {
      const restored = preFocusOpenRef.current;
      preFocusOpenRef.current = null;
      if (!readyReview) {
        setLayout((current) => ({
          ...current,
          leftOpen: restored.leftOpen,
          rightOpen: restored.rightOpen,
        }));
      }
    }
  }, [focusMode, readyReview]);

  useEffect(() => {
    if (!readyReview) return;
    const frame = window.requestAnimationFrame(() => {
      setRightDrawerOpen(false);
      setLeftDrawerOpen(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [readyReview]);

  const leftOpen = overlayRails ? false : layout.leftOpen;
  const rightOpen = overlayRails ? false : layout.rightOpen;

  const leftTrack = overlayRails ? "0px" : leftOpen ? `${layout.leftWidth}px` : `${COLLAPSED_STRIP}px`;
  const leftGutter = !overlayRails && leftOpen ? "8px" : "0px";
  const rightGutter = !overlayRails && rightOpen ? "8px" : "0px";
  const rightTrack = overlayRails ? "0px" : rightOpen ? `${layout.rightWidth}px` : `${COLLAPSED_STRIP}px`;
  const columns = `${leftTrack} ${leftGutter} minmax(0, 1fr) ${rightGutter} ${rightTrack}`;

  const openLeftDrawer = () => {
    setLeftDrawerOpen(true);
    setRightDrawerOpen(false);
  };
  const openRightDrawer = () => {
    setRightDrawerOpen(true);
    setLeftDrawerOpen(false);
  };
  const closeDrawers = () => {
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
  };

  const expandLeftDocked = () => {
    if (focusMode) onExitFocus?.();
    setLayout((current) => ({ ...current, leftOpen: true }));
  };
  const expandRightDocked = () => {
    if (focusMode) onExitFocus?.();
    setLayout((current) => ({ ...current, rightOpen: true }));
  };

  return (
    <div
      className={`saut-agent-workspace${focusMode ? " is-focus" : ""}${overlayRails ? " is-overlay-rails" : ""}${readyReview ? " is-ready-review" : ""}`}
      data-focus-mode={focusMode ? "true" : "false"}
      data-overlay-rails={overlayRails ? "true" : "false"}
      data-ready-review={readyReview ? "true" : "false"}
    >
      <div className="saut-mobile-workspace-tabs" role="tablist" aria-label="Copilot workspace panels">
        {(["chat", "progress", "context"] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={mobileTab === tab} onClick={() => setMobileTab(tab)}>
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div
        className="saut-desktop-workspace"
        data-mobile-tab={mobileTab}
        data-left-open={leftOpen ? "true" : "false"}
        data-right-open={rightOpen ? "true" : "false"}
        data-focus-mode={focusMode ? "true" : "false"}
        data-overlay-rails={overlayRails ? "true" : "false"}
        style={{ gridTemplateColumns: columns }}
      >
        <GridSlot column={1} className="saut-workspace-slot saut-workspace-slot-left min-h-0 min-w-0 overflow-hidden">
          {overlayRails ? null : leftOpen ? left : <CollapsedRailStrip side="left" label="Sessions" onExpand={expandLeftDocked} />}
        </GridSlot>

        <GridSlot column={2} className="saut-workspace-slot saut-workspace-slot-gutter min-h-0 min-w-0">
          {!overlayRails && leftOpen ? (
            <Splitter
              side="left"
              value={layout.leftWidth}
              min={LEFT_MIN}
              max={LEFT_MAX}
              onChange={(leftWidth) => setLayout((current) => ({ ...current, leftWidth }))}
              onCollapse={() => setLayout((current) => ({ ...current, leftOpen: false }))}
            />
          ) : null}
        </GridSlot>

        <div className="saut-workspace-center relative min-h-0 min-w-0" style={{ gridColumn: 3 }} data-center-scroll-owner="true">
          {overlayRails ? (
            <div className="saut-edge-controls" aria-label="Workspace drawers">
              <button
                type="button"
                className="saut-focus-edge-toggle saut-focus-edge-toggle-left"
                onClick={openLeftDrawer}
                aria-label="Open conversations"
                title="Open conversations"
                aria-expanded={leftDrawerOpen}
              >
                <span aria-hidden>{"\u2630"}</span>
              </button>
              <div className="saut-edge-right-cluster">
                {readyReview ? (
                  <span className="saut-ready-status-chip" title="Ready for review" aria-label="Ready for review">
                    <span aria-hidden>✓</span> Ready
                  </span>
                ) : null}
                <button
                  type="button"
                  className="saut-focus-edge-toggle saut-focus-edge-toggle-right"
                  onClick={openRightDrawer}
                  aria-label="Open activity"
                  title="Open activity"
                  aria-expanded={rightDrawerOpen}
                >
                  <span aria-hidden>{"\u2261"}</span>
                </button>
              </div>
            </div>
          ) : null}
          {center}

          {overlayRails && (leftDrawerOpen || rightDrawerOpen) ? (
            <button type="button" className="saut-drawer-backdrop" aria-label="Close drawer" onClick={closeDrawers} />
          ) : null}

          {overlayRails && leftDrawerOpen ? (
            <aside
              className="saut-workspace-drawer saut-workspace-drawer-left"
              style={{ width: DRAWER_LEFT_WIDTH }}
              aria-label="Conversations"
              data-drawer="sessions"
            >
              <header className="saut-drawer-header">
                <strong>Conversations</strong>
                <button type="button" className="saut-drawer-close" onClick={closeDrawers} aria-label="Close conversations" title="Close">
                  ×
                </button>
              </header>
              <div className="saut-drawer-body">{left}</div>
            </aside>
          ) : null}

          {overlayRails && rightDrawerOpen ? (
            <aside
              className="saut-workspace-drawer saut-workspace-drawer-right"
              style={{ width: DRAWER_RIGHT_WIDTH }}
              aria-label="Activity"
              data-drawer="activity"
            >
              <header className="saut-drawer-header">
                <strong>Activity</strong>
                <button type="button" className="saut-drawer-close" onClick={closeDrawers} aria-label="Close activity" title="Close">
                  ×
                </button>
              </header>
              <div className="saut-drawer-body">
                <div className="saut-workspace-progress">{progress}</div>
                <div className="saut-workspace-context">{context}</div>
              </div>
            </aside>
          ) : null}
        </div>

        <GridSlot column={4} className="saut-workspace-slot saut-workspace-slot-gutter min-h-0 min-w-0">
          {!overlayRails && rightOpen ? (
            <Splitter
              side="right"
              value={layout.rightWidth}
              min={RIGHT_MIN}
              max={RIGHT_MAX}
              onChange={(rightWidth) => setLayout((current) => ({ ...current, rightWidth }))}
              onCollapse={() => setLayout((current) => ({ ...current, rightOpen: false }))}
            />
          ) : null}
        </GridSlot>

        <GridSlot column={5} className="saut-workspace-slot saut-workspace-slot-right min-h-0 min-w-0 overflow-hidden">
          {overlayRails ? null : rightOpen ? (
            <aside className="saut-agent-rail saut-agent-right flex h-full min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Progress and context">
              <div className="saut-workspace-progress">{progress}</div>
              <div className="saut-workspace-context">{context}</div>
            </aside>
          ) : (
            <CollapsedRailStrip side="right" label="Progress" onExpand={expandRightDocked} />
          )}
        </GridSlot>
      </div>
    </div>
  );
}
