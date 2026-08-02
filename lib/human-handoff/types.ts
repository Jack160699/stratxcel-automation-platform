export type HumanHandoffStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "RETURNED_TO_MISSION";

export interface HumanHandoffRow {
  id: string;
  tenant_id: string;
  mission_id: string | null;
  reason: string;
  status: HumanHandoffStatus;
  context_snapshot: Record<string, unknown>;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
}
