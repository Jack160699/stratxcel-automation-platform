import { createSupabaseServiceClient } from "../supabase/service.ts";
import type { AuditEventRow, RecordAuditEventInput } from "./types";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

const SECRET_KEY_PATTERN = /token|secret|password|key|credential|authorization/i;

/**
 * Defense in depth against accidentally auditing a raw token/secret: any
 * metadata key that looks credential-shaped gets its value redacted before
 * the write, regardless of what the caller passed in. The audit log is
 * meant to be readable by tenant members in a future UI, so it must never
 * become a secondary place secrets can leak from.
 */
export function sanitizeAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    sanitized[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : value;
  }
  return sanitized;
}

export async function recordAuditEvent(
  supabase: ServiceClient,
  input: RecordAuditEventInput
): Promise<AuditEventRow> {
  const { data, error } = await supabase
    .from("audit_events")
    .insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId ?? null,
      actor_kind: input.actorKind,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: sanitizeAuditMetadata(input.metadata ?? {}),
    })
    .select("*")
    .single();
  if (error) throw new Error(`recordAuditEvent: ${error.message}`);
  return data as AuditEventRow;
}

export async function listAuditEvents(
  supabase: ServiceClient,
  tenantId: string,
  limit = 100
): Promise<AuditEventRow[]> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listAuditEvents: ${error.message}`);
  return (data ?? []) as AuditEventRow[];
}
