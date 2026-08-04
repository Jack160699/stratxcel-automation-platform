import { Card } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";

export type RuntimeConnectionState = "connected" | "disconnected" | "unknown";

const RUNTIME_CHIP: Record<RuntimeConnectionState, { label: string; state: ChipState }> = {
  connected: { label: "Runtime connected", state: "success" },
  unknown: { label: "Runtime status unknown", state: "neutral" },
  disconnected: { label: "Runtime disconnected", state: "dashed" },
};

/**
 * Hermes/execution-runtime connection indicator. Today this is always
 * "disconnected" for every client module — Hermes's runtime connection is
 * handled in a separate phase (see STRATEXCEL_AI_MASTER_BUILD_BRIEF.md) —
 * so no module may render "connected" without a real health signal wired
 * up. The exact wording below is the sanctioned copy for this state.
 */
export function RuntimeStatus({ state = "disconnected", detail }: { state?: RuntimeConnectionState; detail?: string }) {
  const chip = RUNTIME_CHIP[state];
  return (
    <Card variant="nested" className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[13px] font-medium text-sx-text">Execution runtime</p>
        <p className="mt-0.5 text-xs text-sx-text-muted">{detail ?? "Execution service is not connected in this environment."}</p>
      </div>
      <StatusChip state={chip.state}>{chip.label}</StatusChip>
    </Card>
  );
}
