import { Card } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";

export type RuntimeConnectionState = "connected" | "disconnected" | "unknown";

const RUNTIME_CHIP: Record<RuntimeConnectionState, { label: string; state: ChipState }> = {
  connected: { label: "Available", state: "success" },
  unknown: { label: "Status unavailable", state: "neutral" },
  disconnected: { label: "Unavailable", state: "dashed" },
};

/**
 * Hermes/execution-runtime connection indicator. Defaults to disconnected
 * until a caller passes a live health signal. Copilot still compiles
 * missions and runs the tenant Agent Core; Hermes does not get unrestricted
 * root access.
 */
export function RuntimeStatus({
  state = "disconnected",
  detail,
}: {
  state?: RuntimeConnectionState;
  detail?: string;
}) {
  const chip = RUNTIME_CHIP[state];
  return (
    <Card variant="nested" className="flex items-center justify-between gap-3">
      <div>
        <p className="text-[13px] font-medium text-sx-text">Work execution</p>
        <p className="mt-0.5 text-xs text-sx-text-muted">
          {detail
            ?? (state === "connected"
              ? "Hermes can plan and delegate. High-risk actions still need owner approval."
              : "Missions compile and queue. Hermes execution stays controlled until the worker reports a live adapter.")}
        </p>
      </div>
      <StatusChip state={chip.state}>{chip.label}</StatusChip>
    </Card>
  );
}
