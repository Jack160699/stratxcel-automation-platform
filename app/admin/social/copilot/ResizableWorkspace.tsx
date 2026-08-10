"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

const STORAGE_KEY = "saut:copilot:workspace-layout";
const LEFT_MIN = 200;
const LEFT_MAX = 280;
const RIGHT_MIN = 280;
const RIGHT_MAX = 340;
/** Normal collapsed rail strip — must stay in its own grid track (never overlay center). */
const COLLAPSED_STRIP = 48;
const KEYBOARD_STEP = 16;

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

/** Icon-only collapsed rail control — no vertical text that forces track width. */
function CollapsedRailStrip({
  side,
  label,
  onExpand,
}: {
  side: "left" | "right";
  label: string;
  onExpand: () => void;
}) {
  const icon = side === "left" ? "\u2630" : label === "Ready" ? "\u2713" : "\u2261";
  return (
    <div
      className={`saut-workspace-rail-strip saut-workspace-rail-strip-${side}`}
      aria-label={`${label} collapsed`}
      data-collapsed-rail={side}
    >
      <button
        type="button"
        className="saut-workspace-rail-expand"
        onClick={onExpand}
        aria-label={`Expand ${label}`}
        title={`Expand ${label}`}
      >
        <span aria-hidden>{icon}</span>
      </button>
    </div>
  );
}

/** Always occupies a grid track so auto-placement never shifts siblings. */
function GridSlot({
  column,
  children,
  className,
}: {
  column: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "saut-workspace-slot"} style={{ gridColumn: column, minWidth: 0, minHeight: 0 }}>
      {children}
    </div>
  );
}

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
  /** READY_FOR_REVIEW: keep right rail collapsed to a compact Ready control. */
  readyReview?: boolean;
  /** Called when owner expands a rail from Focus edge toggles. */
  onExitFocus?: () => void;
}) {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [layoutReady, setLayoutReady] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "progress" | "context">("chat");
  const [readyRightExpanded, setReadyRightExpanded] = useState(false);
  const preFocusOpenRef = useRef<{ leftOpen: boolean; rightOpen: boolean } | null>(null);

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
      return;
    }
    if (preFocusOpenRef.current) {
      const restored = preFocusOpenRef.current;
      preFocusOpenRef.current = null;
      setLayout((current) => ({
        ...current,
        leftOpen: restored.leftOpen,
        rightOpen: readyReview ? false : restored.rightOpen,
      }));
    }
  }, [focusMode, readyReview]);

  useEffect(() => {
    if (!readyReview) return;
    const frame = window.requestAnimationFrame(() => setReadyRightExpanded(false));
    return () => window.cancelAnimationFrame(frame);
  }, [readyReview]);

  const leftOpen = focusMode ? false : layout.leftOpen;
  const rightOpen = focusMode ? false : readyReview ? readyRightExpanded : layout.rightOpen;

  // Stable 5-track grid. Focus removes rails from the flow (0 width).
  // Center is always minmax(0, 1fr) so cards/labels cannot collapse it.
  const leftTrack = focusMode ? "0px" : leftOpen ? `${layout.leftWidth}px` : `${COLLAPSED_STRIP}px`;
  const leftGutter = !focusMode && leftOpen ? "8px" : "0px";
  const rightGutter = !focusMode && rightOpen ? "8px" : "0px";
  const rightTrack = focusMode ? "0px" : rightOpen ? `${layout.rightWidth}px` : `${COLLAPSED_STRIP}px`;
  const columns = `${leftTrack} ${leftGutter} minmax(0, 1fr) ${rightGutter} ${rightTrack}`;

  const expandLeft = () => {
    if (focusMode) onExitFocus?.();
    setLayout((current) => ({ ...current, leftOpen: true }));
  };
  const expandRight = () => {
    if (focusMode) onExitFocus?.();
    if (readyReview) setReadyRightExpanded(true);
    else setLayout((current) => ({ ...current, rightOpen: true }));
  };

  return (
    <div className={`saut-agent-workspace${focusMode ? " is-focus" : ""}`} data-focus-mode={focusMode ? "true" : "false"}>
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
        style={{ gridTemplateColumns: columns }}
      >
        {/* Column 1 — left rail / collapsed strip / focus empty */}
        <GridSlot column={1} className="saut-workspace-slot saut-workspace-slot-left min-h-0 min-w-0 overflow-hidden">
          {focusMode ? null : leftOpen ? (
            left
          ) : (
            <CollapsedRailStrip side="left" label="Sessions" onExpand={expandLeft} />
          )}
        </GridSlot>

        {/* Column 2 — splitter or empty track (always present for stable placement) */}
        <GridSlot column={2} className="saut-workspace-slot saut-workspace-slot-gutter min-h-0 min-w-0">
          {!focusMode && leftOpen ? (
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

        {/* Column 3 — center artifact (always minmax(0,1fr)) */}
        <div className="saut-workspace-center relative min-h-0 min-w-0" style={{ gridColumn: 3 }}>
          {focusMode ? (
            <>
              <button
                type="button"
                className="saut-focus-edge-toggle saut-focus-edge-toggle-left"
                onClick={expandLeft}
                aria-label="Show session rail"
                title="Show sessions"
              >
                <span aria-hidden>{"\u2630"}</span>
              </button>
              <button
                type="button"
                className="saut-focus-edge-toggle saut-focus-edge-toggle-right"
                onClick={expandRight}
                aria-label={readyReview ? "Show progress details" : "Show progress rail"}
                title={readyReview ? "Show Ready details" : "Show progress"}
              >
                <span aria-hidden>{readyReview ? "\u2713" : "\u2261"}</span>
              </button>
            </>
          ) : null}
          {center}
        </div>

        {/* Column 4 — splitter or empty track */}
        <GridSlot column={4} className="saut-workspace-slot saut-workspace-slot-gutter min-h-0 min-w-0">
          {!focusMode && rightOpen ? (
            <Splitter
              side="right"
              value={layout.rightWidth}
              min={RIGHT_MIN}
              max={RIGHT_MAX}
              onChange={(rightWidth) => setLayout((current) => ({ ...current, rightWidth }))}
              onCollapse={() => {
                if (readyReview) setReadyRightExpanded(false);
                else setLayout((current) => ({ ...current, rightOpen: false }));
              }}
            />
          ) : null}
        </GridSlot>

        {/* Column 5 — right rail / collapsed strip / focus empty */}
        <GridSlot column={5} className="saut-workspace-slot saut-workspace-slot-right min-h-0 min-w-0 overflow-hidden">
          {focusMode ? null : rightOpen ? (
            <aside className="saut-agent-rail saut-agent-right flex h-full min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Progress and context">
              <div className="saut-workspace-progress">{progress}</div>
              <div className="saut-workspace-context">{context}</div>
            </aside>
          ) : (
            <CollapsedRailStrip
              side="right"
              label={readyReview ? "Ready" : "Progress"}
              onExpand={expandRight}
            />
          )}
        </GridSlot>
      </div>
    </div>
  );
}
