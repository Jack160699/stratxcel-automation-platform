"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const FIELD_FOCUSABLE = "input, select, textarea";

/**
 * Modal on desktop, bottom sheet <768px — one component, CSS handles the
 * breakpoint switch (docs/product-design/RESPONSIVE_AND_MOBILE_SPECIFICATION.md
 * §8). 200ms cubic-bezier(.2,.8,.2,1) matches the design system's modal/sheet
 * motion timing exactly.
 */
export type ModalSize = "sm" | "md" | "lg" | "xl" | "wide" | "full";

const MODAL_SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl lg:max-w-2xl",
  xl: "sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl",
  wide: "sm:max-w-3xl lg:max-w-5xl xl:max-w-6xl",
  full: "sm:max-w-[calc(100vw-2rem)] lg:max-w-[calc(100vw-4rem)]",
};

/**
 * Modal on desktop, bottom sheet <768px — one component, CSS handles the
 * breakpoint switch (docs/product-design/RESPONSIVE_AND_MOBILE_SPECIFICATION.md
 * §8). 200ms cubic-bezier(.2,.8,.2,1) matches the design system's modal/sheet
 * motion timing exactly.
 */
export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = dialogRef.current;
    const focusables = () =>
      root
        ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true")
        : [];
    const firstField = root?.querySelector<HTMLElement>(FIELD_FOCUSABLE);
    const initial = firstField && !firstField.hasAttribute("disabled") ? firstField : focusables()[0];
    if (initial) initial.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = MODAL_SIZE_CLASSES[size] ?? MODAL_SIZE_CLASSES.md;

  return (
    <div
      className="fixed inset-0 z-[var(--sx-z-modal,60)] flex items-end justify-center bg-[rgb(4_6_10_/_0.72)] p-0 sm:p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)] w-full ${sizeClass} flex flex-col overflow-hidden rounded-t-sx-lg border border-sx-border-strong bg-sx-elevated p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--sx-shadow-xl)] transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] sm:rounded-sx-lg sm:pb-6`}
      >
        <div className="mb-2 flex justify-center sm:hidden shrink-0">
          <span className="h-1 w-10 rounded-full bg-sx-border-strong" />
        </div>
        <div className="mb-3 flex items-center justify-between shrink-0">
          <h2 id={titleId} className="font-sx-sans text-lg font-semibold text-sx-text sm:text-base">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-11 min-w-11 flex items-center justify-center text-sx-text-subtle hover:text-sx-text">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(100dvh-8rem)] sm:max-h-[calc(100dvh-10rem)] pr-0.5 min-h-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Right-side drawer/overlay — used for the context panel below the pinned breakpoint, and the mobile sidebar drawer. */
export function Drawer({
  open,
  onClose,
  side = "right",
  children,
  widthClassName = "w-full max-w-[min(22rem,100vw)] sm:w-88 sm:max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  children: ReactNode;
  widthClassName?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[var(--sx-z-sheet,50)] bg-[rgb(4_6_10_/_0.6)]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`fixed inset-y-0 ${side === "right" ? "right-0" : "left-0"} ${widthClassName} border-sx-border bg-sx-surface-1 shadow-[var(--sx-shadow-xl)] duration-[160ms] ${
          side === "right" ? "border-l" : "border-r"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-[var(--sx-z-tooltip,80)] mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-sx-xs border border-sx-border-strong bg-sx-elevated px-2 py-1 text-[11px] text-sx-text opacity-0 shadow-[var(--sx-shadow-lg)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
