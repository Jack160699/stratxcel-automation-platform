/**
 * Server-side authorization resolution.
 * Callers supply references / grants; this module proves authority against
 * the exact trusted execution scope.
 *
 * Never trust caller-supplied approvalGranted / standingAuthorizationGranted.
 * Never trust model-supplied "approvedArtifactId" as authority — use the
 * executor's canonical inputArtifactIds / expectedArtifactVersions / input
 * destination fields instead.
 */
import type { CapabilityAuthorizationContext } from "@stratxcel/workforce-core";
import { createSupabaseServiceClient } from "../supabase/service.ts";

export type HermesMissionToolGrant = {
  kind: "HERMES_MISSION_TOOL_GRANT";
  toolName: "create_crm_lead";
  missionToolAllowed: boolean;
};

/**
 * Deterministic authorization references from production callers.
 * Booleans like approvalGranted are intentionally absent.
 */
export interface CapabilityAuthorizationReferences {
  approvalId?: string | null;
  /**
   * @deprecated Bare authorization row IDs never grant standing auth.
   * Use standingAuthorizationQueueItemId. Passing only this fails closed.
   */
  standingAuthorizationScopeId?: string | null;
  /** Preferred: package queue item that binds auth + variant + account. */
  standingAuthorizationQueueItemId?: string | null;
  actorKind?: string | null;
  trustedSystemGrant?: HermesMissionToolGrant | null;
}

/**
 * Trusted execution details from executeWorkforceCapabilityServer —
 * never model-forged approval subject claims alone.
 */
export interface TrustedExecutionScope {
  inputArtifactIds?: readonly string[];
  expectedArtifactVersions?: Readonly<Record<string, string>>;
  operation?: string | null;
  accountId?: string | null;
  variantId?: string | null;
  /** Canonical artifact for Social publish/schedule when known. */
  artifactId?: string | null;
  actionFingerprint?: string | null;
  destinationId?: string | null;
  idempotencyKey?: string | null;
}

export interface ResolveCapabilityAuthorizationInput {
  tenantId: string;
  missionId: string;
  capability: string;
  operation?: string | null;
  execution?: TrustedExecutionScope | null;
  references?: CapabilityAuthorizationReferences | null;
}

export type ApprovalRecord = {
  id: string;
  tenant_id: string;
  mission_id: string | null;
  kind: string;
  status: string;
  subject: Record<string, unknown>;
  decided_at?: string | null;
};

export type PackageQueueItemRecord = {
  id: string;
  authorization_id: string;
  tenant_id: string;
  variant_id: string | null;
  account_id: string;
  status: string;
};

export type PackageAuthorizationRecord = {
  id: string;
  tenant_id: string;
  state: string;
  publishing_mode: string;
  starts_at: string | null;
  ends_at: string | null;
  revoked_at: string | null;
  subscription_id: string;
  entitlement_id: string;
  allowed_platforms: string[] | null;
  content_scope: Record<string, unknown> | null;
};

export type SubscriptionRecord = {
  id: string;
  tenant_id: string;
  status: string;
  current_period_end: string | null;
};

export type EntitlementRecord = {
  id: string;
  tenant_id: string;
  subscription_id: string;
  metric: string;
  is_paused: boolean;
  limit_amount: number;
  current_usage: number;
};

export type SocialAccountRecord = {
  id: string;
  tenant_id: string;
  platform: string;
  status: string;
};

export interface ResolveAuthorizationDeps {
  loadApproval?: (approvalId: string) => Promise<ApprovalRecord | null>;
  loadQueueItem?: (queueItemId: string) => Promise<PackageQueueItemRecord | null>;
  loadPackageAuthorization?: (
    authorizationId: string,
  ) => Promise<PackageAuthorizationRecord | null>;
  loadSubscription?: (
    subscriptionId: string,
    tenantId: string,
  ) => Promise<SubscriptionRecord | null>;
  loadEntitlement?: (
    entitlementId: string,
    tenantId: string,
    subscriptionId: string,
  ) => Promise<EntitlementRecord | null>;
  loadSocialAccount?: (
    accountId: string,
    tenantId: string,
  ) => Promise<SocialAccountRecord | null>;
}

const EXTERNAL_MUTATION_CAPS = new Set([
  "social.publish",
  "social.schedule",
  "crm.write",
  "whatsapp.send",
  "website.deploy",
  "ads.publish",
]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function subjectStringList(subject: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const raw = subject[key];
    if (typeof raw === "string" && raw.trim()) out.push(raw.trim());
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
      }
    }
  }
  return [...new Set(out)];
}

function subjectHasField(subject: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((k) => {
    const v = subject[k];
    if (typeof v === "string" && v.trim()) return true;
    if (Array.isArray(v) && v.length > 0) return true;
    return false;
  });
}

/**
 * Normalize approvals.subject into comparable scope fields.
 */
export function readApprovalSubjectScope(subject: Record<string, unknown>): {
  capability: string | null;
  operation: string | null;
  artifactIds: string[];
  artifactVersion: string | null;
  variantId: string | null;
  accountId: string | null;
  destinationId: string | null;
  actionFingerprint: string | null;
  expiresAt: string | null;
  revoked: boolean;
  superseded: boolean;
} {
  const capability =
    asString(subject.capability) ?? asString(subject.capabilityKey) ?? null;
  return {
    capability,
    operation: asString(subject.operation) ?? asString(subject.crmOperation) ?? null,
    artifactIds: subjectStringList(subject, [
      "artifactId",
      "artifactIds",
      "canonicalArtifactId",
      "socialArtifactId",
    ]),
    artifactVersion:
      asString(subject.artifactVersion) ?? asString(subject.version) ?? null,
    variantId: asString(subject.variantId) ?? null,
    accountId: asString(subject.accountId) ?? asString(subject.destinationAccountId) ?? null,
    destinationId: asString(subject.destinationId) ?? asString(subject.accountId) ?? null,
    actionFingerprint:
      asString(subject.actionFingerprint) ??
      asString(subject.exactPayloadFingerprint) ??
      asString(subject.payloadFingerprint) ??
      null,
    expiresAt: asString(subject.expiresAt) ?? asString(subject.expires_at) ?? null,
    revoked: subject.revoked === true,
    superseded: subject.superseded === true,
  };
}

function resolveCanonicalArtifactId(execution: TrustedExecutionScope | null | undefined): string | null {
  if (!execution) return null;
  if (execution.artifactId && execution.artifactId.trim()) return execution.artifactId.trim();
  const ids = execution.inputArtifactIds ?? [];
  if (ids.length === 1 && ids[0]) return ids[0];
  // Prefer explicit input.artifactId already mapped; else first input artifact.
  return ids[0] ?? null;
}

function matchScopedId(
  subjectValues: string[],
  requested: string | null | undefined,
  fieldPresent: boolean,
): { ok: true } | { ok: false; reason: string } {
  if (!fieldPresent) return { ok: true }; // subject did not constrain this field
  if (!requested) return { ok: false, reason: "approval_scope_missing_request_value" };
  if (!subjectValues.includes(requested)) {
    return { ok: false, reason: "approval_scope_mismatch" };
  }
  return { ok: true };
}

/**
 * Exact execution-scope match for an approval subject.
 * Legacy broad content_publish with ambiguous subject fails closed for
 * external mutations.
 */
export function matchApprovalExecutionScope(args: {
  capability: string;
  kind: string;
  subject: Record<string, unknown>;
  execution?: TrustedExecutionScope | null;
}): { ok: true } | { ok: false; reason: string } {
  const scope = readApprovalSubjectScope(args.subject);
  const execution = args.execution ?? null;
  const external = EXTERNAL_MUTATION_CAPS.has(args.capability);

  // Capability: prefer explicit subject.capability; never let schedule approve publish.
  if (scope.capability) {
    if (scope.capability !== args.capability) {
      return { ok: false, reason: "approval_capability_mismatch" };
    }
  } else if (args.kind === "content_publish") {
    // Ambiguous legacy — fail closed for external mutations.
    if (external) return { ok: false, reason: "approval_scope_ambiguous" };
  } else if (args.kind === "deploy") {
    if (args.capability !== "website.deploy" && args.capability !== "website.generate") {
      return { ok: false, reason: "approval_capability_mismatch" };
    }
    if (args.capability === "website.deploy" && external && !subjectHasField(args.subject, ["artifactId", "artifactIds"])) {
      // deploy without artifact scope fails closed
      return { ok: false, reason: "approval_scope_ambiguous" };
    }
  } else if (args.kind === "other" || args.kind === "spend") {
    return { ok: false, reason: "approval_capability_mismatch" };
  } else if (external) {
    return { ok: false, reason: "approval_scope_ambiguous" };
  }

  if (scope.revoked || scope.superseded) {
    return { ok: false, reason: "approval_revoked_or_superseded" };
  }
  if (scope.expiresAt) {
    const ts = Date.parse(scope.expiresAt);
    if (Number.isFinite(ts) && ts < Date.now()) {
      return { ok: false, reason: "approval_expired" };
    }
  }

  // CRM: operation must match when constrained (create_lead ≠ update_lead_status).
  if (args.capability === "crm.write") {
    if (scope.operation) {
      const requestedOp = execution?.operation ?? null;
      if (!requestedOp || requestedOp !== scope.operation) {
        return { ok: false, reason: "approval_operation_mismatch" };
      }
    } else if (external) {
      // External CRM write without operation scope fails closed.
      return { ok: false, reason: "approval_scope_ambiguous" };
    }
  }

  // Social publish / schedule: require deterministic artifact + destination scope.
  if (args.capability === "social.publish" || args.capability === "social.schedule") {
    const hasArtifactScope = scope.artifactIds.length > 0;
    const hasAccountScope = Boolean(scope.accountId || scope.destinationId);
    if (!hasArtifactScope || !hasAccountScope) {
      return { ok: false, reason: "approval_scope_ambiguous" };
    }

    const canonicalArtifact = resolveCanonicalArtifactId(execution);
    const art = matchScopedId(scope.artifactIds, canonicalArtifact, true);
    if (!art.ok) return art;

    const accountRequested =
      execution?.accountId ?? execution?.destinationId ?? null;
    const accountValues = [
      ...subjectStringList(args.subject, ["accountId", "destinationAccountId", "destinationId"]),
    ];
    const acct = matchScopedId(accountValues, accountRequested, true);
    if (!acct.ok) return { ok: false, reason: "approval_destination_mismatch" };

    if (scope.variantId) {
      const variantRequested = execution?.variantId ?? null;
      if (!variantRequested || variantRequested !== scope.variantId) {
        return { ok: false, reason: "approval_variant_mismatch" };
      }
    }

    if (scope.artifactVersion && canonicalArtifact) {
      const expected =
        execution?.expectedArtifactVersions?.[canonicalArtifact] ?? null;
      if (!expected || expected !== scope.artifactVersion) {
        return { ok: false, reason: "approval_artifact_version_mismatch" };
      }
    }

    if (scope.actionFingerprint) {
      const fp = execution?.actionFingerprint ?? null;
      if (!fp || fp !== scope.actionFingerprint) {
        return { ok: false, reason: "approval_fingerprint_mismatch" };
      }
    }
  }

  // WhatsApp / other external: if subject constrains artifact/account, match.
  if (args.capability === "whatsapp.send") {
    if (scope.artifactIds.length > 0) {
      const art = matchScopedId(
        scope.artifactIds,
        resolveCanonicalArtifactId(execution),
        true,
      );
      if (!art.ok) return art;
    } else if (external) {
      // Allow whatsapp approvals scoped by lead/destination in subject.
      const dest = scope.destinationId ?? scope.accountId;
      if (!dest) return { ok: false, reason: "approval_scope_ambiguous" };
      const requested = execution?.destinationId ?? execution?.accountId ?? null;
      if (!requested || requested !== dest) {
        return { ok: false, reason: "approval_destination_mismatch" };
      }
    }
  }

  return { ok: true };
}

async function defaultLoadApproval(approvalId: string): Promise<ApprovalRecord | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("approvals")
    .select("id, tenant_id, mission_id, kind, status, subject, decided_at")
    .eq("id", approvalId)
    .maybeSingle();
  if (error || !data) return null;
  const subject =
    data.subject && typeof data.subject === "object" && !Array.isArray(data.subject)
      ? (data.subject as Record<string, unknown>)
      : {};
  return {
    id: String(data.id),
    tenant_id: String(data.tenant_id),
    mission_id: data.mission_id == null ? null : String(data.mission_id),
    kind: String(data.kind),
    status: String(data.status),
    subject,
    decided_at: data.decided_at == null ? null : String(data.decided_at),
  };
}

async function defaultLoadQueueItem(queueItemId: string): Promise<PackageQueueItemRecord | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("social_autopilot_queue_items")
    .select("id, authorization_id, tenant_id, variant_id, account_id, status")
    .eq("id", queueItemId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    authorization_id: String(data.authorization_id),
    tenant_id: String(data.tenant_id),
    variant_id: data.variant_id == null ? null : String(data.variant_id),
    account_id: String(data.account_id),
    status: String(data.status),
  };
}

async function defaultLoadPackageAuthorization(
  authorizationId: string,
): Promise<PackageAuthorizationRecord | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("social_autopilot_authorizations")
    .select(
      "id, tenant_id, state, publishing_mode, starts_at, ends_at, revoked_at, subscription_id, entitlement_id, allowed_platforms, content_scope",
    )
    .eq("id", authorizationId)
    .maybeSingle();
  if (error || !data) return null;
  const contentScope =
    data.content_scope && typeof data.content_scope === "object" && !Array.isArray(data.content_scope)
      ? (data.content_scope as Record<string, unknown>)
      : null;
  return {
    id: String(data.id),
    tenant_id: String(data.tenant_id),
    state: String(data.state),
    publishing_mode: String(data.publishing_mode ?? ""),
    starts_at: data.starts_at == null ? null : String(data.starts_at),
    ends_at: data.ends_at == null ? null : String(data.ends_at),
    revoked_at: data.revoked_at == null ? null : String(data.revoked_at),
    subscription_id: String(data.subscription_id),
    entitlement_id: String(data.entitlement_id),
    allowed_platforms: Array.isArray(data.allowed_platforms)
      ? (data.allowed_platforms as string[])
      : [],
    content_scope: contentScope,
  };
}

async function defaultLoadSubscription(
  subscriptionId: string,
  tenantId: string,
): Promise<SubscriptionRecord | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("subscriptions")
    .select("id, tenant_id, status, current_period_end")
    .eq("id", subscriptionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    tenant_id: String(data.tenant_id),
    status: String(data.status),
    current_period_end:
      data.current_period_end == null ? null : String(data.current_period_end),
  };
}

async function defaultLoadEntitlement(
  entitlementId: string,
  tenantId: string,
  subscriptionId: string,
): Promise<EntitlementRecord | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("usage_entitlements")
    .select("id, tenant_id, subscription_id, metric, is_paused, limit_amount, current_usage")
    .eq("id", entitlementId)
    .eq("tenant_id", tenantId)
    .eq("subscription_id", subscriptionId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    tenant_id: String(data.tenant_id),
    subscription_id: String(data.subscription_id),
    metric: String(data.metric),
    is_paused: data.is_paused === true,
    limit_amount: Number(data.limit_amount ?? 0),
    current_usage: Number(data.current_usage ?? 0),
  };
}

async function defaultLoadSocialAccount(
  accountId: string,
  tenantId: string,
): Promise<SocialAccountRecord | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("social_accounts")
    .select("id, tenant_id, platform, status")
    .eq("id", accountId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String(data.id),
    tenant_id: String(data.tenant_id),
    platform: String(data.platform ?? "").toLowerCase(),
    status: String(data.status ?? ""),
  };
}

export async function resolveApproval(args: {
  approvalId: string;
  tenantId: string;
  missionId: string;
  capability: string;
  execution?: TrustedExecutionScope | null;
  deps?: ResolveAuthorizationDeps;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const load = args.deps?.loadApproval ?? defaultLoadApproval;
  const data = await load(args.approvalId);
  if (!data) return { ok: false, reason: "approval_not_found" };
  if (data.tenant_id !== args.tenantId) {
    return { ok: false, reason: "approval_tenant_mismatch" };
  }
  if (data.mission_id != null && data.mission_id !== args.missionId) {
    return { ok: false, reason: "approval_mission_mismatch" };
  }
  if (String(data.status).toUpperCase() !== "APPROVED") {
    return { ok: false, reason: "approval_not_approved" };
  }
  return matchApprovalExecutionScope({
    capability: args.capability,
    kind: data.kind,
    subject: data.subject,
    execution: args.execution,
  });
}

const QUEUE_STATES_FOR_PUBLISH = new Set(["PREPARED", "SCHEDULED"]);
const QUEUE_STATES_FOR_SCHEDULE = new Set([
  "PLANNED",
  "PREPARED",
  "REVIEW_REQUIRED",
  "SCHEDULED",
]);

/**
 * Prove package standing auth via queue item → authorization →
 * subscription/entitlement/platform scope. Read-only — does not claim.
 */
export async function resolveStandingPackageAuth(args: {
  queueItemId: string;
  tenantId: string;
  capability: string;
  execution?: TrustedExecutionScope | null;
  deps?: ResolveAuthorizationDeps;
}): Promise<
  | {
      ok: true;
      authorizationKind: string;
      authorizationCapability: string;
      authorizationScopeId: string;
    }
  | { ok: false; reason: string }
> {
  if (args.capability !== "social.publish" && args.capability !== "social.schedule") {
    return { ok: false, reason: "standing_auth_capability_unsupported" };
  }

  const loadItem = args.deps?.loadQueueItem ?? defaultLoadQueueItem;
  const loadAuth = args.deps?.loadPackageAuthorization ?? defaultLoadPackageAuthorization;
  const loadSub = args.deps?.loadSubscription ?? defaultLoadSubscription;
  const loadEnt = args.deps?.loadEntitlement ?? defaultLoadEntitlement;
  const loadAccount = args.deps?.loadSocialAccount ?? defaultLoadSocialAccount;

  const item = await loadItem(args.queueItemId);
  if (!item) return { ok: false, reason: "queue_item_not_found" };
  if (item.tenant_id !== args.tenantId) {
    return { ok: false, reason: "queue_item_tenant_mismatch" };
  }

  const allowedStates =
    args.capability === "social.publish" ? QUEUE_STATES_FOR_PUBLISH : QUEUE_STATES_FOR_SCHEDULE;
  if (!allowedStates.has(String(item.status).toUpperCase())) {
    return { ok: false, reason: "queue_item_status_not_allowed" };
  }

  const requestedVariant = args.execution?.variantId ?? null;
  const requestedAccount = args.execution?.accountId ?? args.execution?.destinationId ?? null;
  if (!requestedVariant || item.variant_id !== requestedVariant) {
    return { ok: false, reason: "queue_item_variant_mismatch" };
  }
  if (!requestedAccount || item.account_id !== requestedAccount) {
    return { ok: false, reason: "queue_item_account_mismatch" };
  }

  const auth = await loadAuth(item.authorization_id);
  if (!auth) return { ok: false, reason: "standing_auth_not_found" };
  if (auth.tenant_id !== args.tenantId) {
    return { ok: false, reason: "standing_auth_tenant_mismatch" };
  }
  if (String(auth.state).toUpperCase() !== "ACTIVE") {
    return { ok: false, reason: "standing_auth_inactive" };
  }
  if (auth.revoked_at) return { ok: false, reason: "standing_auth_revoked" };

  const now = Date.now();
  if (auth.starts_at && Date.parse(auth.starts_at) > now) {
    return { ok: false, reason: "standing_auth_not_started" };
  }
  if (auth.ends_at && Date.parse(auth.ends_at) <= now) {
    return { ok: false, reason: "standing_auth_ended" };
  }

  const mode = String(auth.publishing_mode ?? "");
  if (args.capability === "social.publish" && mode !== "AUTO_PUBLISH") {
    return { ok: false, reason: "standing_auth_publish_mode_required" };
  }
  if (
    args.capability === "social.schedule" &&
    mode !== "AUTO_PUBLISH" &&
    mode !== "REVIEW_BEFORE_PUBLISH"
  ) {
    return { ok: false, reason: "standing_auth_schedule_mode_invalid" };
  }

  // Subscription / entitlement — same product truth as claim_social_package_post (read-only).
  const sub = await loadSub(auth.subscription_id, args.tenantId);
  if (!sub || sub.tenant_id !== args.tenantId) {
    return { ok: false, reason: "subscription_inactive" };
  }
  if (String(sub.status).toLowerCase() !== "active") {
    return { ok: false, reason: "subscription_inactive" };
  }
  if (sub.current_period_end && Date.parse(sub.current_period_end) <= now) {
    return { ok: false, reason: "subscription_inactive" };
  }

  const ent = await loadEnt(auth.entitlement_id, args.tenantId, auth.subscription_id);
  if (!ent) return { ok: false, reason: "entitlement_paused_or_exhausted" };
  const scopeMetric =
    typeof auth.content_scope?.metric === "string" ? auth.content_scope.metric : "social_posts";
  if (ent.metric !== "social_posts" || scopeMetric !== "social_posts") {
    return { ok: false, reason: "entitlement_metric_mismatch" };
  }
  if (ent.is_paused || ent.current_usage >= ent.limit_amount) {
    return { ok: false, reason: "entitlement_paused_or_exhausted" };
  }

  const account = await loadAccount(item.account_id, args.tenantId);
  if (!account) return { ok: false, reason: "destination_outside_scope" };
  const allowed = (auth.allowed_platforms ?? []).map((p) => String(p).toLowerCase());
  if (!allowed.includes(account.platform.toLowerCase())) {
    return { ok: false, reason: "destination_outside_scope" };
  }

  return {
    ok: true,
    authorizationKind:
      args.capability === "social.publish" ? "PACKAGE_AUTO_PUBLISH" : "PACKAGE_AUTO_SCHEDULE",
    authorizationCapability: args.capability,
    authorizationScopeId: item.id,
  };
}

/**
 * Resolve caller references into a trusted CapabilityAuthorizationContext.
 * Shadow/kill are applied separately by the executor.
 */
export async function resolveCapabilityAuthorization(
  input: ResolveCapabilityAuthorizationInput,
  deps: ResolveAuthorizationDeps = {},
): Promise<CapabilityAuthorizationContext> {
  const base: CapabilityAuthorizationContext = {
    trustedTenantId: input.tenantId,
    approvalGranted: false,
    standingAuthorizationGranted: false,
  };

  const refs = input.references;
  if (!refs) return base;

  const execution: TrustedExecutionScope = {
    ...(input.execution ?? {}),
    operation: input.execution?.operation ?? input.operation ?? null,
  };

  // Hermes mission-tool grant — create_crm_lead → crm.write:create_lead only.
  if (refs.trustedSystemGrant?.kind === "HERMES_MISSION_TOOL_GRANT") {
    const grant = refs.trustedSystemGrant;
    if (
      grant.toolName === "create_crm_lead" &&
      grant.missionToolAllowed === true &&
      input.capability === "crm.write" &&
      (execution.operation == null || execution.operation === "create_lead")
    ) {
      return {
        ...base,
        standingAuthorizationGranted: true,
        authorizationKind: "HERMES_MISSION_TOOL_GRANT",
        authorizationCapability: "crm.write",
        authorizationScopeId: "create_lead",
      };
    }
    return base;
  }

  if (refs.approvalId) {
    const proved = await resolveApproval({
      approvalId: refs.approvalId,
      tenantId: input.tenantId,
      missionId: input.missionId,
      capability: input.capability,
      execution,
      deps,
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

  // HARD: bare authorization row IDs never grant standing auth for manual missions.
  // Only queue-item scoped references authorize package standing auth.
  if (refs.standingAuthorizationQueueItemId) {
    const standing = await resolveStandingPackageAuth({
      queueItemId: refs.standingAuthorizationQueueItemId,
      tenantId: input.tenantId,
      capability: input.capability,
      execution,
      deps,
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
