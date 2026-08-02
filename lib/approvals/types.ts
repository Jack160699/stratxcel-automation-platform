export type ApprovalKind = "content_publish" | "spend" | "deploy" | "other";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface ApprovalRow {
  id: string;
  tenant_id: string;
  mission_id: string | null;
  kind: ApprovalKind;
  status: ApprovalStatus;
  subject: Record<string, unknown>;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}
