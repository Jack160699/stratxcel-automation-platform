export type MissionState =
  | "DRAFT"
  | "ESTIMATING"
  | "AWAITING_FUNDS"
  | "READY"
  | "QUEUED"
  | "RUNNING"
  | "AWAITING_INPUT"
  | "AWAITING_APPROVAL"
  | "HUMAN_HANDOFF"
  | "RESUMED"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "BLOCKED";

export interface MissionRow {
  id: string;
  tenant_id: string;
  created_by: string | null;
  goal_text: string;
  service_key: string | null;
  state: MissionState;
  estimated_cost_cents: number | null;
  hermes_profile: string | null;
  hermes_run_id: string | null;
  brand_brain_version: number | null;
  version: number;
  idempotency_key: string | null;
  actual_cost_cents: number | null;
  /** Cache of the last RunStatusResponse.status seen for hermes_run_id — avoids a mission_events replay just to show current status. */
  last_hermes_status: string | null;
  last_event_at: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  transcript_backfill_cursor: string | null;
  created_at: string;
  updated_at: string;
}

export interface MissionEventRow {
  id: string;
  mission_id: string;
  /** Which Hermes run produced this event — null for non-Hermes events (state_changed, compiled, ...). */
  run_id: string | null;
  /** Source HermesExecutionEvent.sequence — null for non-Hermes events. Combined with run_id and event_type, makes insertion idempotent (see 20260804090000_hermes_run_tracking.sql). */
  sequence: number | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CompiledMission {
  goalText: string;
  serviceKey: string;
  hermesProfile: string;
  estimatedCostCents: number;
  matched: boolean;
}
