import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";

export interface MissionSummary {
  id: string;
  goal_text: string;
  state: string;
  service_key?: string | null;
  estimated_cost_cents?: number | null;
  created_at: string;
}

/** Same mission-state → chip mapping as app/app/missions/page.tsx (MISSION_STATE_CHIP), kept local here per that file's own precedent of a local copy rather than a cross-module import. */
export const MISSION_STATE_CHIP: Record<string, { label: string; state: ChipState }> = {
  DRAFT: { label: "Draft", state: "neutral" },
  ESTIMATING: { label: "Estimating", state: "neutral" },
  AWAITING_FUNDS: { label: "Awaiting funds", state: "warning" },
  READY: { label: "Ready", state: "accent" },
  QUEUED: { label: "Queued", state: "accent" },
  RUNNING: { label: "Running", state: "ai" },
  AWAITING_INPUT: { label: "Awaiting input", state: "warning" },
  AWAITING_APPROVAL: { label: "Awaiting approval", state: "warning" },
  HUMAN_HANDOFF: { label: "Human handoff", state: "warning" },
  RESUMED: { label: "Resumed", state: "accent" },
  COMPLETED: { label: "Completed", state: "success" },
  PARTIALLY_COMPLETED: { label: "Partially completed", state: "success" },
  FAILED: { label: "Failed", state: "danger" },
  CANCELLED: { label: "Cancelled", state: "neutral" },
  BLOCKED: { label: "Blocked", state: "danger" },
};

/** Compact mission row reused by Copilot, Website, Ads "related missions" lists — links to the real mission detail page. */
export function MissionSummaryCard({ mission, href }: { mission: MissionSummary; href?: string }) {
  const chip = MISSION_STATE_CHIP[mission.state] ?? { label: mission.state, state: "neutral" as ChipState };
  const body = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] text-sx-text" title={mission.goal_text}>
          {mission.goal_text}
        </p>
        <p className="mt-0.5 text-xs text-sx-text-subtle">
          {mission.service_key ?? "Unmatched service"}
          {mission.estimated_cost_cents != null ? ` · ₹${(mission.estimated_cost_cents / 100).toFixed(2)}` : ""}
        </p>
      </div>
      <StatusChip state={chip.state} pulse={chip.state === "ai"}>
        {chip.label}
      </StatusChip>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 transition-colors hover:border-sx-border-strong">
        {body}
      </Link>
    );
  }
  return <Card variant="nested">{body}</Card>;
}
