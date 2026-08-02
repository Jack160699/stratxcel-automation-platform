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
  created_at: string;
  updated_at: string;
}

export interface MissionEventRow {
  id: string;
  mission_id: string;
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
