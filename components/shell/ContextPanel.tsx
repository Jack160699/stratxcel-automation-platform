"use client";

import type { ReactNode } from "react";

/**
 * Right context panel — pinned ≥1440px, overlay 1280–1439px (and tablet),
 * sheet on mobile. docs/product-design/SHARED_SHELL_SPECIFICATION.md §4.
 * The ≥1440px pinned column is a real CSS Grid/flex sibling declared by the
 * caller (AppShell); this component itself renders the always-present panel
 * body plus the <1440px overlay/scrim behavior, since both share the same
 * content.
 */
export function ContextPanel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      {/* Pinned column at ≥1440px — no scrim, no close-on-outside-click, permanent. */}
      <aside className="hidden w-80 shrink-0 flex-col border-l border-sx-border bg-[#080B10] 2xl:flex">
        <PanelBody title={title} onClose={onClose}>
          {children}
        </PanelBody>
      </aside>

      {/* Overlay at <1440px (and the mobile sheet shares this same markup — width/inset handled by the sm: breakpoint). */}
      <div className="fixed inset-0 z-[var(--sx-z-sheet,50)] bg-[rgb(4_6_10_/_0.6)] 2xl:hidden" onClick={onClose}>
        <aside
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-sx-border bg-[#080B10] shadow-[var(--sx-shadow-xl)] duration-[160ms]"
        >
          <PanelBody title={title} onClose={onClose}>
            {children}
          </PanelBody>
        </aside>
      </div>
    </>
  );
}

function PanelBody({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-sx-sans text-sm font-semibold text-sx-text">{title}</h2>
        <button onClick={onClose} aria-label="Close panel" className="text-sx-text-subtle hover:text-sx-text">
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}
