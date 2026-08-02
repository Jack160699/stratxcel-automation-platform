export type AuditActorKind = "user" | "system" | "hermes" | "integration";

export interface AuditEventRow {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  actor_kind: AuditActorKind;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RecordAuditEventInput {
  tenantId: string;
  actorUserId?: string | null;
  actorKind: AuditActorKind;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}
