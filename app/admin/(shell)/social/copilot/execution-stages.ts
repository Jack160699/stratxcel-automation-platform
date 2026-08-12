// Groups the raw, chronological Copilot execution trace into a handful of
// human-operational stages (Understanding, Context & Brand, Content
// Planning, Media, Accounts, Publishing, Final Result) instead of showing
// every provider round-trip and tool call as an equally-weighted top-level
// row. This is presentation-only grouping over real persisted events — it
// never invents a stage, a step, or a status; see
// design/social-autopilot/README.md's "Progress is operational telemetry
// only" principle.
import type { AgentRunEventRow } from "@/lib/social/repositories/agent-runs";

export type StageId = "understanding" | "brand" | "content" | "media" | "accounts" | "publishing" | "final" | "other";

export const STAGE_TITLES: Record<StageId, string> = {
  understanding: "Understanding",
  brand: "Context & Brand",
  content: "Content Planning",
  media: "Media",
  accounts: "Accounts",
  publishing: "Publishing",
  final: "Final Result",
  other: "Other operations",
};

const STAGE_FOR_TOOL: Record<string, StageId> = {
  inspect_brand: "brand",
  get_performance: "brand",
  inspect_health: "accounts",
  inspect_accounts: "accounts",
  set_operating_mode: "accounts",
  inspect_jobs: "publishing",
  inspect_dead_letters: "publishing",
  schedule_post: "publishing",
  cancel_scheduled_post: "publishing",
  execute_youtube_verification: "publishing",
  execute_private_youtube_verification: "publishing",
  list_campaigns: "content",
  list_content: "content",
  create_campaign: "content",
  create_content_item: "content",
  create_content_variant: "content",
  update_content_variant: "content",
  ingest_media: "media",
  inspect_content_media: "media",
  attach_media_to_content: "media",
};

export type StageStatus = "pending" | "running" | "success" | "failed";

export interface ExecutionStage {
  id: StageId;
  key: string; // unique per rendered segment (stages can repeat, e.g. two separate Content Planning segments)
  title: string;
  events: AgentRunEventRow[];
  status: StageStatus;
  /** True when this stage had a failed attempt that a later retry recovered from — the stage still reads SUCCESS, but the UI notes it. */
  recovered: boolean;
  /** Sum of every event's recorded durationMs within this stage, when available. */
  durationMs: number | null;
  /** How many provider (AI) request/response round-trips happened inside this stage. */
  providerCalls: number;
  providerDurationMs: number;
}

function eventDuration(event: AgentRunEventRow): number | null {
  const value = event.meta?.durationMs;
  return typeof value === "number" ? value : null;
}

/**
 * A stage's status reflects its FINAL outcome, not whether anything inside
 * it ever failed. A tool call that failed and was then successfully retried
 * (e.g. an invented content pillar corrected to the real canonical one) must
 * not leave the whole stage looking red — only the last terminal
 * (TOOL_COMPLETED/TOOL_FAILED) event decides failed vs. recovered. The
 * original failed attempt stays visible in the stage's own event list and
 * in the full technical trace; it is never hidden, just not the headline.
 */
function stageStatus(events: AgentRunEventRow[], isLastStage: boolean, runStatus: string | undefined): StageStatus {
  if (events.some((event) => event.status === "PENDING")) return "pending"; // waiting for approval
  const terminalEvents = events.filter((event) => event.type === "TOOL_COMPLETED" || event.type === "TOOL_FAILED");
  const lastTerminal = terminalEvents[terminalEvents.length - 1];
  if (lastTerminal?.status === "FAILED") return "failed"; // ended in failure — nothing recovered it
  if (isLastStage && runStatus === "RUNNING") return "running";
  return "success";
}

function stageRecovered(events: AgentRunEventRow[], status: StageStatus): boolean {
  return status === "success" && events.some((event) => event.type === "TOOL_FAILED" && event.status === "FAILED");
}

/**
 * Partitions a run's events into stage segments. A new segment starts at
 * each TOOL_STARTED event whose tool maps to a different stage than the
 * segment currently being built (so consecutive calls in the same stage,
 * e.g. create_content_item then create_content_variant, collapse into one
 * "Content Planning" row); RUN_COMPLETED/RUN_FAILED always start the
 * trailing "Final Result" segment. Provider round-trips and other
 * non-tool events attach to whichever segment is open when they occur.
 */
export function groupEventsIntoStages(events: AgentRunEventRow[], runStatus?: string): ExecutionStage[] {
  const segments: Array<{ id: StageId; events: AgentRunEventRow[] }> = [];
  let current: { id: StageId; events: AgentRunEventRow[] } | null = null;

  for (const event of events) {
    if (event.type === "RUN_COMPLETED" || event.type === "RUN_FAILED") {
      current = { id: "final", events: [] };
      segments.push(current);
      current.events.push(event);
      continue;
    }
    if ((event.type === "TOOL_STARTED" || event.type === "APPROVAL_REQUIRED") && event.tool_name) {
      const stageId = STAGE_FOR_TOOL[event.tool_name] ?? "other";
      if (!current || current.id !== stageId) {
        current = { id: stageId, events: [] };
        segments.push(current);
      }
    }
    if (!current) {
      current = { id: "understanding", events: [] };
      segments.push(current);
    }
    current.events.push(event);
  }

  return segments.map((segment, index) => {
    const providerEvents = segment.events.filter((event) => event.type === "PROVIDER_RESPONSE_RECEIVED");
    const durations = segment.events.map(eventDuration).filter((value): value is number => value !== null);
    const status = stageStatus(segment.events, index === segments.length - 1, runStatus);
    return {
      id: segment.id,
      key: `${segment.id}-${index}`,
      title: STAGE_TITLES[segment.id],
      events: segment.events,
      status,
      recovered: stageRecovered(segment.events, status),
      durationMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) : null,
      providerCalls: providerEvents.length,
      providerDurationMs: providerEvents.reduce((sum, event) => sum + (eventDuration(event) ?? 0), 0),
    };
  });
}

/**
 * The single "Currently…" line for the fixed banner above the stage list.
 * A mission waiting on a human decision is still "current" even though its
 * underlying run has technically finished executing — never blank the
 * banner out from under a user who's mid-approval (Section 12/14 of the
 * follow-up brief).
 */
export function currentActionLabel(events: AgentRunEventRow[], running: boolean, waitingForApproval = false): string | null {
  if (waitingForApproval) return "Ready for your approval";
  if (!running || events.length === 0) return null;
  return events[events.length - 1].label;
}

/**
 * Which stage the Progress viewport should auto-follow: the first stage
 * that's still failed/pending/running, or the last stage if everything so
 * far reads as finished (e.g. right after a terminal event lands). Used to
 * scroll only when the ACTIVE stage identity changes — never on every raw
 * event — so the live console doesn't jitter (Section 11 of the live-
 * progress cleanup brief).
 */
export function activeStageKey(stages: ExecutionStage[]): string | null {
  if (stages.length === 0) return null;
  const active = stages.find((stage) => stage.status === "failed" || stage.status === "pending" || stage.status === "running");
  return (active ?? stages[stages.length - 1]).key;
}
