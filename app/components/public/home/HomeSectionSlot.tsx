import type { ReactNode } from "react";
import { ScrollReveal } from "@/app/components/public/motion/ScrollReveal";

type HomeSectionSlotProps = {
  id: string;
  sectionKey: string;
  label: string;
  children?: ReactNode;
  className?: string;
  bordered?: boolean;
  reveal?: boolean;
};

/**
 * Composition boundary for parallel homepage sections.
 * Other Wave-1 agents can replace slot children without touching the page skeleton.
 */
export function HomeSectionSlot({
  id,
  sectionKey,
  label,
  children,
  className = "",
  bordered = true,
  reveal = true,
}: HomeSectionSlotProps) {
  const inner = children ?? (
    <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="rounded-sx-md border border-dashed border-sx-border bg-sx-surface-2/50 px-6 py-10 text-center">
        <p className="font-sx-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-sx-text-subtle">
          {label}
        </p>
        <p className="mt-2 font-sx-sans text-sm text-sx-text-muted">
          Section reserved for Wave-1 integration.
        </p>
      </div>
    </div>
  );

  return (
    <section
      id={id}
      data-home-section={sectionKey}
      aria-label={label}
      className={`${bordered ? "border-b border-sx-border" : ""} ${className}`.trim()}
    >
      {reveal ? <ScrollReveal>{inner}</ScrollReveal> : inner}
    </section>
  );
}
