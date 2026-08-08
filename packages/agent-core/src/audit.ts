import { recordAuditEvent } from "@stratxcel/audit";
import type { ServiceClient } from "./db.ts";
import type { AgentPrincipal } from "./principal.ts";

/**
 * Thin wrapper around @stratxcel/audit's recordAuditEvent (PHASE 25) —
 * reused verbatim, not reimplemented. recordAuditEvent already runs all
 * metadata through sanitizeAuditMetadata (redacts token/secret/password/
 * key/credential/authorization-shaped fields), so callers here don't
 * separately redact — they just must never put a pairing/confirmation
 * PLAINTEXT CODE into metadata in the first place (none of the functions
 * below accept one).
 */

const CHANNEL_ACTOR_KIND = "integration" as const; // closest fit in AuditActorKind for an agent-originated action

function tenantIdForAudit(principal: AgentPrincipal): string | null {
  return principal.tenantId;
}

export async function auditPrincipalLinked(
  supabase: ServiceClient,
  input: { authUserId: string; tenantId: string | null; principalType: "staff" | "client"; channel: string }
): Promise<void> {
  if (!input.tenantId) return; // recordAuditEvent requires a tenantId; staff-without-tenant links are covered by platform_admin_events-style logging in a follow-up if needed.
  await recordAuditEvent(supabase, {
    tenantId: input.tenantId,
    actorUserId: input.authUserId,
    actorKind: "user",
    action: "whatsapp_agent.linked",
    targetType: "whatsapp_channel_principal",
    metadata: { principalType: input.principalType, channel: input.channel },
  });
}

export async function auditPrincipalUnlinked(
  supabase: ServiceClient,
  input: { tenantId: string | null; actorUserId: string; principalId: string }
): Promise<void> {
  if (!input.tenantId) return;
  await recordAuditEvent(supabase, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actorKind: "user",
    action: "whatsapp_agent.unlinked",
    targetType: "whatsapp_channel_principal",
    targetId: input.principalId,
  });
}

export async function auditAgentRun(
  supabase: ServiceClient,
  principal: AgentPrincipal,
  input: { runId: string; status: string }
): Promise<void> {
  const tenantId = tenantIdForAudit(principal);
  if (!tenantId) return;
  await recordAuditEvent(supabase, {
    tenantId,
    actorUserId: principal.authUserId,
    actorKind: CHANNEL_ACTOR_KIND,
    action: "agent.run",
    targetType: "agent_run",
    targetId: input.runId,
    metadata: { channel: principal.channel, status: input.status, principalKind: principal.kind },
  });
}

export async function auditToolInvocation(
  supabase: ServiceClient,
  principal: AgentPrincipal,
  input: { runId: string; toolName: string; risk: string; mutating: boolean }
): Promise<void> {
  const tenantId = tenantIdForAudit(principal);
  if (!tenantId) return;
  await recordAuditEvent(supabase, {
    tenantId,
    actorUserId: principal.authUserId,
    actorKind: CHANNEL_ACTOR_KIND,
    action: "agent.tool_invoked",
    targetType: "agent_run",
    targetId: input.runId,
    metadata: { toolName: input.toolName, risk: input.risk, mutating: input.mutating },
  });
}

export async function auditConfirmationProposed(
  supabase: ServiceClient,
  principal: AgentPrincipal,
  input: { confirmationId: string; actionName: string }
): Promise<void> {
  const tenantId = tenantIdForAudit(principal);
  if (!tenantId) return;
  await recordAuditEvent(supabase, {
    tenantId,
    actorUserId: principal.authUserId,
    actorKind: CHANNEL_ACTOR_KIND,
    action: "agent.confirmation_proposed",
    targetType: "agent_action_confirmation",
    targetId: input.confirmationId,
    metadata: { actionName: input.actionName }, // never the plaintext code
  });
}

export async function auditConfirmationExecuted(
  supabase: ServiceClient,
  principal: AgentPrincipal,
  input: { confirmationId: string; actionName: string }
): Promise<void> {
  const tenantId = tenantIdForAudit(principal);
  if (!tenantId) return;
  await recordAuditEvent(supabase, {
    tenantId,
    actorUserId: principal.authUserId,
    actorKind: CHANNEL_ACTOR_KIND,
    action: "agent.confirmation_executed",
    targetType: "agent_action_confirmation",
    targetId: input.confirmationId,
    metadata: { actionName: input.actionName },
  });
}

export async function auditConfirmationCancelled(
  supabase: ServiceClient,
  principal: AgentPrincipal,
  input: { confirmationId: string }
): Promise<void> {
  const tenantId = tenantIdForAudit(principal);
  if (!tenantId) return;
  await recordAuditEvent(supabase, {
    tenantId,
    actorUserId: principal.authUserId,
    actorKind: CHANNEL_ACTOR_KIND,
    action: "agent.confirmation_cancelled",
    targetType: "agent_action_confirmation",
    targetId: input.confirmationId,
  });
}

export async function auditFailedAction(
  supabase: ServiceClient,
  principal: AgentPrincipal,
  input: { runId?: string; reason: string }
): Promise<void> {
  const tenantId = tenantIdForAudit(principal);
  if (!tenantId) return;
  await recordAuditEvent(supabase, {
    tenantId,
    actorUserId: principal.authUserId,
    actorKind: CHANNEL_ACTOR_KIND,
    action: "agent.failed",
    targetType: input.runId ? "agent_run" : undefined,
    targetId: input.runId,
    metadata: { reason: input.reason },
  });
}
