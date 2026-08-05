import type { ReactNode } from "react";

export type ChipState = "success" | "warning" | "danger" | "accent" | "ai" | "learning" | "neutral" | "dashed";

const CHIP_CLASSES: Record<ChipState, string> = {
  success: "bg-[rgb(53_201_140_/_0.1)] border border-[rgb(53_201_140_/_0.28)] text-[#5BDCA7]",
  warning: "bg-[rgb(240_180_41_/_0.1)] border border-[rgb(240_180_41_/_0.3)] text-[#F3C55C]",
  danger: "bg-[rgb(242_86_95_/_0.1)] border border-[rgb(242_86_95_/_0.32)] text-[#FF8A90]",
  accent: "bg-sx-accent-muted border border-[rgb(58_160_255_/_0.28)] text-[#7CC2FF]",
  ai: "bg-[rgb(79_220_229_/_0.1)] border border-[rgb(79_220_229_/_0.26)] text-[#7FE7EE]",
  learning: "bg-[rgb(167_139_250_/_0.1)] border border-[rgb(167_139_250_/_0.28)] text-[#BCA6FB]",
  neutral: "bg-sx-surface-2 border border-sx-border text-sx-text-muted",
  dashed: "bg-sx-surface-2 border border-dashed border-sx-border-strong text-sx-text-muted",
};

const DOT_SHAPE: Partial<Record<ChipState, string>> = {
  warning: "rotate-45 rounded-[1px]",
  danger: "rotate-45 rounded-[1px]",
  accent: "rounded-full border border-current bg-transparent",
  dashed: "rounded-full border border-current bg-transparent",
};

/**
 * Status/pipeline chip — dot SHAPE differs per state (not colour alone), per
 * docs/product-design/DESIGN_SOURCE_AUDIT.md §2.8 and the accessibility rule
 * in §2.16 (status is never colour-only).
 */
export function StatusChip({
  state,
  children,
  pulse = false,
  dot = true,
  className = "",
}: {
  state: ChipState;
  children: ReactNode;
  pulse?: boolean;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-[21px] items-center gap-1.5 whitespace-nowrap rounded-sx-pill px-2 font-sx-mono text-[9.5px] uppercase tracking-[0.08em] ${CHIP_CLASSES[state]} ${className}`}
    >
      {dot && (
        <span
          className={`h-[5px] w-[5px] flex-none rounded-full bg-current ${DOT_SHAPE[state] ?? ""} ${pulse ? "animate-sx-pulse" : ""}`}
        />
      )}
      {children}
    </span>
  );
}

export type AiState = "observing" | "analyzing" | "planning" | "generating" | "scheduling" | "publishing" | "measuring" | "learning";

const AI_DOT_COLOR: Record<AiState, string> = {
  observing: "bg-sx-offline",
  analyzing: "bg-sx-ai",
  planning: "bg-sx-ai",
  generating: "bg-sx-accent",
  scheduling: "bg-sx-accent",
  publishing: "bg-sx-success",
  measuring: "bg-sx-text-subtle",
  learning: "bg-sx-learning",
};

const AI_PULSES: ReadonlySet<AiState> = new Set(["analyzing", "planning", "generating", "publishing", "learning"]);

/** The 6px AI pulse-dot primitive — docs/product-design/DESIGN_SOURCE_AUDIT.md §2.7. */
export function PulseDot({ state, className = "" }: { state: AiState; className?: string }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${AI_DOT_COLOR[state]} ${AI_PULSES.has(state) ? "animate-sx-pulse" : ""} ${className}`}
      aria-hidden="true"
    />
  );
}

/** Pulse dot + mono state label, as an aria-live region — the agent-status primitive used in the top command bar and Copilot. */
export function AgentStatus({ state, label }: { state: AiState; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sx-mono text-[10.5px] uppercase tracking-[0.08em] text-sx-text-muted" aria-live="polite">
      <PulseDot state={state} />
      {label}
    </span>
  );
}
