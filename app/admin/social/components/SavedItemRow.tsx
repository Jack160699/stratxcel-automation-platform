import type { ReactNode } from "react";

/**
 * Shared layout for every saved Brand Brain item row (Products, Audiences,
 * Pillars, Sources, Rules). Uses CSS Grid with an explicit
 * `minmax(0, 1fr) auto` track split instead of relying on flexbox shrink
 * math: the content column can grow, wrap, or clamp but is never allowed to
 * push the actions column off-screen, and the actions column never shrinks.
 * Below the sm breakpoint the two columns stack (content, then actions),
 * which is the intended mobile layout rather than a bug.
 */
export function SavedItemRow({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div className="saut-item-row" style={{ background: "var(--saut-surface-2)" }}>
      <div className="saut-item-row-content">{children}</div>
      <div className="saut-item-row-actions">{actions}</div>
    </div>
  );
}
