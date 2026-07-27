import { createSupabaseServiceClient } from "../../supabase/service";
import type { OwnerContext } from "../db-context";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export type AuditActorType = "USER" | "AGENT" | "SYSTEM";

/**
 * Health/audit/webhook tables are system-wide (not owner-scoped) with
 * SELECT-only admin policies in the stratxcel schema — writes always go
 * through service-role (matching how a cron job or webhook receiver has no
 * user session to write as), reads can go through either; using the owner
 * context for reads keeps things consistent with real RLS enforcement.
 */

export async function recordAudit(entry: {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  meta?: Record<string, unknown>;
}) {
  const service = createSupabaseServiceClient();
  await service.from("social_audit_events").insert({
    actor_type: entry.actorType,
    actor_id: entry.actorId ?? null,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    summary: entry.summary,
    meta: entry.meta ?? null,
  });
}

export async function listAuditEvents(ctx: OwnerContext, limit = 30) {
  const { data } = await ctx.supabase.from("social_audit_events").select("*").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function recordHealthChecks(
  service: ServiceClient,
  records: Array<{ component: string; status: string; latencyMs?: number; message: string }>
) {
  await service.from("social_health_checks").insert(
    records.map((r) => ({ component: r.component, status: r.status, latency_ms: r.latencyMs ?? null, message: r.message }))
  );
}

export async function listHealthChecks(ctx: OwnerContext) {
  const { data } = await ctx.supabase.from("social_health_checks").select("*").order("checked_at", { ascending: false }).limit(200);
  return data ?? [];
}

export async function recordWebhookEvent(
  service: ServiceClient,
  entry: { provider: string; eventType?: string; externalId?: string; payload: Record<string, unknown>; signatureValid: boolean }
) {
  await service.from("social_webhook_events").insert({
    provider: entry.provider,
    event_type: entry.eventType ?? null,
    external_id: entry.externalId ?? null,
    payload: entry.payload,
    signature_valid: entry.signatureValid,
    processing_status: entry.signatureValid ? "RECEIVED" : "IGNORED",
  });
}
