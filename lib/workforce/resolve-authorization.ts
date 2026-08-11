/**
 * Server-side authorization resolution.
 * Callers supply references / grants; this module proves authority.
 * Never trust caller-supplied approvalGranted / standingAuthorizationGranted booleans.
 */
import type { CapabilityAuthorizationContext } from "@stratxcel/workforce-core";
import { createSupabaseServiceClient } from "../supabase/service.ts";

export type HermesMissionToolGrant = {
  kind: "HERMES_MISSION_TOOL_GRANT";
  /** Must be create_crm_lead — only Hermes tool mapped to a CRM write. */
  toolName: "create_crm_lead";
  /**
   * Proven by the verified mission token allowlist at the Hermes dispatcher —
   * never model-supplied. When false, grant is rejected.
   */
  missionToolAllowed: boolean;
};

/**
 * Deterministic authorization references / actor intent from production callers.
 * Booleans like approvalGranted are intentionally absent.
 */
export interface CapabilityAuthorizationReferences {
  approvalId?: string | null;
  standingAuthorizationScopeId?: string | null;
  actorKind?: string | null;
  trustedSystemGrant?: HermesMissionToolGrant | null;
}

export interface ResolveCapabilityAuthorizationInput {
  tenantId: string;
  missionId: string;
  capability: string;
  /** Optional CRM operation for Hermes grant scoping. */
  operation?: string | null;
  references?: CapabilityAuthorizationReferences | null;
}

function capabilityMatchesApprovalSubject(
  capability: string,
  kind: string,
  subject: Record<string, unknown>,
): boolean {
  const subjectCapability =
    typeof subject.capability === "string"
      ? subject.capability
      : typeof subject.capabilityKey === "string"
        ? subject.capabilityKey
        : null;
  if (subjectCapability && subjectCapability === capability) return true;

  // Legacy approval kinds used by Social / website flows.
  if (kind === "content_publish") {
    return capability === "social.publish" || capability === "social.schedule";
  }
  if (kind === "deploy") {
    return capability === "website.deploy" || capability === "website.generate";
  }
  if (kind === "other" || kind === "spend") {
    return subjectCapability === capability;
  }
  return false;
}

async function resolveApproval(args: {
  approvalId: string;
  tenantId: string;
  missionId: string;
  capability: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("approvals")
    .select("id, tenant_id, mission_id, kind, status, subject, decided_at")
    .eq("id", args.approvalId)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "approval_not_found" };
  if (String(data.tenant_id) !== args.tenantId) {
    return { ok: false, reason: "approval_tenant_mismatch" };
  }
  if (data.mission_id != null && String(data.mission_id) !== args.missionId) {
    return { ok: false, reason: "approval_mission_mismatch" };
  }
  if (String(data.status).toUpperCase() !== "APPROVED") {
    return { ok: false, reason: "approval_not_approved" };
  }
  const subject =
    data.subject && typeof data.subject === "object" && !Array.isArray(data.subject)
      ? (data.subject as Record<string, unknown>)
      : {};
  if (!capabilityMatchesApprovalSubject(args.capability, String(data.kind), subject)) {
    return { ok: false, reason: "approval_capability_mismatch" };
  }
  // Soft expiry: subject.expiresAt or decided_at + 30d when subject.expiresAt set.
  const expiresAt =
    typeof subject.expiresAt === "string"
      ? Date.parse(subject.expiresAt)
      : typeof subject.expires_at === "string"
        ? Date.parse(subject.expires_at)
        : NaN;
  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    return { ok: false, reason: "approval_expired" };
  }
  if (subject.revoked === true || subject.superseded === true) {
    return { ok: false, reason: "approval_revoked_or_superseded" };
  }
  return { ok: true };
}

async function resolveStandingPackageAuth(args: {
  scopeId: string;
  tenantId: string;
  capability: string;
}): Promise<
  | {
      ok: true;
      authorizationKind: string;
      authorizationCapability: string;
      authorizationScopeId: string;
    }
  | { ok: false; reason: string }
> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("social_autopilot_authorizations")
    .select(
      "id, tenant_id, state, publishing_mode, starts_at, ends_at, revoked_at, period_number",
    )
    .eq("id", args.scopeId)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "standing_auth_not_found" };
  if (String(data.tenant_id) !== args.tenantId) {
    return { ok: false, reason: "standing_auth_tenant_mismatch" };
  }
  if (String(data.state).toUpperCase() !== "ACTIVE") {
    return { ok: false, reason: "standing_auth_inactive" };
  }
  if (data.revoked_at) return { ok: false, reason: "standing_auth_revoked" };

  const now = Date.now();
  if (data.starts_at && Date.parse(String(data.starts_at)) > now) {
    return { ok: false, reason: "standing_auth_not_started" };
  }
  if (data.ends_at && Date.parse(String(data.ends_at)) < now) {
    return { ok: false, reason: "standing_auth_ended" };
  }

  const mode = String(data.publishing_mode ?? "");
  if (args.capability === "social.publish") {
    if (mode !== "AUTO_PUBLISH") {
      return { ok: false, reason: "standing_auth_publish_mode_required" };
    }
    return {
      ok: true,
      authorizationKind: "PACKAGE_AUTO_PUBLISH",
      authorizationCapability: "social.publish",
      authorizationScopeId: String(data.id),
    };
  }
  if (args.capability === "social.schedule") {
    // Active package standing may schedule under AUTO_PUBLISH or REVIEW modes.
    if (mode !== "AUTO_PUBLISH" && mode !== "REVIEW_BEFORE_PUBLISH") {
      return { ok: false, reason: "standing_auth_schedule_mode_invalid" };
    }
    return {
      ok: true,
      authorizationKind: "PACKAGE_AUTO_SCHEDULE",
      authorizationCapability: "social.schedule",
      authorizationScopeId: String(data.id),
    };
  }
  return { ok: false, reason: "standing_auth_capability_unsupported" };
}

/**
 * Resolve caller references into a trusted CapabilityAuthorizationContext.
 * Shadow/kill are applied separately by the executor.
 */
export async function resolveCapabilityAuthorization(
  input: ResolveCapabilityAuthorizationInput,
): Promise<CapabilityAuthorizationContext> {
  const base: CapabilityAuthorizationContext = {
    trustedTenantId: input.tenantId,
    approvalGranted: false,
    standingAuthorizationGranted: false,
  };

  const refs = input.references;
  if (!refs) return base;

  // Hermes mission-tool grant — server-owned, create_crm_lead → crm.write:create_lead only.
  if (refs.trustedSystemGrant?.kind === "HERMES_MISSION_TOOL_GRANT") {
    const grant = refs.trustedSystemGrant;
    if (
      grant.toolName === "create_crm_lead" &&
      grant.missionToolAllowed === true &&
      input.capability === "crm.write" &&
      (input.operation == null || input.operation === "create_lead")
    ) {
      return {
        ...base,
        standingAuthorizationGranted: true,
        authorizationKind: "HERMES_MISSION_TOOL_GRANT",
        authorizationCapability: "crm.write",
        authorizationScopeId: "create_lead",
      };
    }
    // Invalid grant does not authorize.
    return base;
  }

  if (refs.approvalId) {
    const proved = await resolveApproval({
      approvalId: refs.approvalId,
      tenantId: input.tenantId,
      missionId: input.missionId,
      capability: input.capability,
    });
    if (proved.ok) {
      return {
        ...base,
        approvalGranted: true,
        authorizationKind: "EXPLICIT_APPROVAL",
        authorizationCapability: input.capability,
        authorizationScopeId: refs.approvalId,
      };
    }
  }

  if (refs.standingAuthorizationScopeId) {
    const standing = await resolveStandingPackageAuth({
      scopeId: refs.standingAuthorizationScopeId,
      tenantId: input.tenantId,
      capability: input.capability,
    });
    if (standing.ok) {
      return {
        ...base,
        standingAuthorizationGranted: true,
        authorizationKind: standing.authorizationKind,
        authorizationCapability: standing.authorizationCapability,
        authorizationScopeId: standing.authorizationScopeId,
      };
    }
  }

  return base;
}
