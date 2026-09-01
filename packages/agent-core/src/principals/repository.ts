import type { ServiceClient } from "../db.ts";
import type { AgentPrincipalResolution, AgentChannel, StaffAgentPrincipal, ClientAgentPrincipal } from "../principal.ts";
import type { TenantRole } from "../types-external.ts";

/**
 * Agent-core's own permission vocabulary for gating tool exposure. Deliberately
 * NOT the same union as lib/rbac/types.ts's Permission type (that lives in the
 * Next.js app and this package cannot import app code — see types-external.ts).
 * Client permissions here are intersected with tenant role at resolve time so a
 * viewer never gets mutation permissions regardless of what's listed.
 */
const STAFF_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  platform_owner: [
    "agent:read:clients", "agent:read:leads", "agent:read:conversations", "agent:read:missions",
    "agent:read:approvals", "agent:read:handoffs", "agent:read:operations", "agent:read:health",
    "agent:read:integrations", "agent:read:audit", "agent:read:finance", "agent:read:social",
    "agent:read:memory", "agent:mutate:memory", "agent:mutate:leads", "agent:mutate:missions", "agent:mutate:handoffs", "agent:mutate:conversations",
    // Real, one-to-one external WhatsApp outreach on Stratxcel's own behalf
    // (send_whatsapp_message_to_contact) -- "platform owner/admin = allowed,
    // at minimum" per the outbound-outreach brief. Never granted to a
    // narrower staff role by default.
    "agent:mutate:outreach",
  ],
  platform_admin: [
    "agent:read:clients", "agent:read:leads", "agent:read:conversations", "agent:read:missions",
    "agent:read:approvals", "agent:read:handoffs", "agent:read:operations", "agent:read:health",
    "agent:read:integrations", "agent:read:social",
    "agent:read:memory", "agent:mutate:memory", "agent:mutate:leads", "agent:mutate:missions", "agent:mutate:handoffs", "agent:mutate:conversations",
    "agent:mutate:outreach",
  ],
  audit_reviewer: ["agent:read:audit", "agent:read:clients", "agent:read:leads", "agent:read:memory", "agent:mutate:memory"],
  finance_reviewer: ["agent:read:finance", "agent:read:clients", "agent:read:memory", "agent:mutate:memory"],
};

const MEMORY_PERMISSIONS = ["agent:read:memory", "agent:mutate:memory"] as const;
export const STAFF_ACCESS_PROFILE_PERMISSIONS: Record<string, readonly string[]> = {
  role_default: [],
  full_owner: STAFF_ROLE_PERMISSIONS.platform_owner,
  administrator: STAFF_ROLE_PERMISSIONS.platform_admin,
  sales_crm: ["agent:read:clients", "agent:read:leads", "agent:read:conversations", "agent:mutate:leads", "agent:mutate:conversations", ...MEMORY_PERMISSIONS],
  marketing_social: ["agent:read:clients", "agent:read:social", "agent:read:integrations", ...MEMORY_PERMISSIONS],
  operations: ["agent:read:clients", "agent:read:missions", "agent:read:approvals", "agent:read:handoffs", "agent:read:operations", "agent:mutate:missions", "agent:mutate:handoffs", ...MEMORY_PERMISSIONS],
  finance: ["agent:read:clients", "agent:read:finance", ...MEMORY_PERMISSIONS],
  audit_read_only: ["agent:read:clients", "agent:read:audit", "agent:read:memory"],
  custom: [],
};

export interface StaffAgentAccessRow {
  department: string | null;
  access_profile: string;
  permission_grants: string[];
  permission_denials: string[];
}

/** Effective access is always bounded by the platform role ceiling. A profile
 * or custom grant can narrow a role, but can never mint authority the role lacks.
 * Department is deliberately absent from this calculation. */
export function resolveEffectiveStaffPermissions(role: string, access?: Partial<StaffAgentAccessRow> | null): readonly string[] {
  const ceiling = new Set(STAFF_ROLE_PERMISSIONS[role] ?? []);
  if (!access || !access.access_profile || access.access_profile === "role_default") return [...ceiling];
  const requested = access.access_profile === "custom"
    ? (access.permission_grants ?? [])
    : (STAFF_ACCESS_PROFILE_PERMISSIONS[access.access_profile] ?? []);
  const denied = new Set(access.permission_denials ?? []);
  return requested.filter((permission) => ceiling.has(permission) && !denied.has(permission));
}

const CLIENT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  owner: [
    "agent:read:workspace", "agent:read:missions", "agent:read:approvals", "agent:read:artifacts",
    "agent:read:reports", "agent:read:brand", "agent:read:leads", "agent:read:conversations",
    "agent:read:integrations", "agent:read:memory", "agent:mutate:memory", "agent:mutate:missions", "agent:mutate:handoffs",
  ],
  admin: [
    "agent:read:workspace", "agent:read:missions", "agent:read:approvals", "agent:read:artifacts",
    "agent:read:reports", "agent:read:brand", "agent:read:leads", "agent:read:conversations",
    "agent:read:integrations", "agent:read:memory", "agent:mutate:memory", "agent:mutate:missions", "agent:mutate:handoffs",
  ],
  operator: [
    "agent:read:workspace", "agent:read:missions", "agent:read:leads", "agent:read:conversations",
    "agent:read:memory", "agent:mutate:memory", "agent:mutate:handoffs",
  ],
  viewer: ["agent:read:workspace", "agent:read:missions", "agent:read:leads", "agent:read:memory"],
};

/**
 * Single source of truth for "what can this role do" — shared by every
 * channel (WhatsApp phone-link resolution below, and the admin/client web
 * Copilot resolvers in the Next.js app's lib/agent-core/web-principal.ts),
 * so a role's tool authorization can never silently drift between channels.
 */
export function resolveStaffPermissions(role: string): readonly string[] {
  return STAFF_ROLE_PERMISSIONS[role] ?? [];
}

export function resolveClientPermissions(role: string): readonly string[] {
  return CLIENT_ROLE_PERMISSIONS[role] ?? [];
}

export function buildStaffPrincipal(input: { authUserId: string; tenantId: string | null; role: string; channel: AgentChannel; access?: Partial<StaffAgentAccessRow> | null }): StaffAgentPrincipal {
  return {
    kind: "staff",
    channel: input.channel,
    authUserId: input.authUserId,
    tenantId: input.tenantId,
    role: input.role,
    department: input.access?.department ?? null,
    accessProfile: input.access?.access_profile ?? "role_default",
    permissions: resolveEffectiveStaffPermissions(input.role, input.access),
  };
}

export function buildClientPrincipal(input: { authUserId: string; tenantId: string; role: TenantRole; channel: AgentChannel }): ClientAgentPrincipal {
  return {
    kind: "client",
    channel: input.channel,
    authUserId: input.authUserId,
    tenantId: input.tenantId,
    role: input.role,
    permissions: resolveClientPermissions(input.role),
  };
}

interface PrincipalRow {
  id: string;
  normalized_phone: string;
  principal_type: "staff" | "client";
  auth_user_id: string;
  tenant_id: string | null;
  status: "active" | "revoked";
}

/**
 * Resolve a normalized WhatsApp phone number to an AgentPrincipal.
 *
 * Re-verifies the UNDERLYING authorization at resolution time (platform staff
 * roster / tenant membership), not just the whatsapp_channel_principals link —
 * a phone link surviving after someone is offboarded as staff or removed from a
 * tenant must not silently keep granting access. Returns "revoked" in that case
 * even if the link row itself still says status='active'.
 */
export async function resolveWhatsAppPrincipal(
  supabase: ServiceClient,
  normalizedPhone: string,
  channel: AgentChannel = "whatsapp"
): Promise<AgentPrincipalResolution> {
  const { data: row, error } = await supabase
    .from("whatsapp_channel_principals")
    .select("id, normalized_phone, principal_type, auth_user_id, tenant_id, status")
    .eq("normalized_phone", normalizedPhone)
    .eq("status", "active")
    .maybeSingle<PrincipalRow>();

  if (error) throw error;
  if (!row) return { status: "unlinked" };

  if (row.principal_type === "staff") {
    const { data: staff, error: staffErr } = await supabase
      .from("platform_staff_users")
      .select("role, is_active")
      .eq("user_id", row.auth_user_id)
      .maybeSingle<{ role: string; is_active: boolean }>();
    if (staffErr) throw staffErr;
    if (!staff || !staff.is_active) return { status: "revoked" };

    const { data: access, error: accessErr } = await supabase
      .from("platform_staff_agent_access")
      .select("department, access_profile, permission_grants, permission_denials")
      .eq("user_id", row.auth_user_id)
      .maybeSingle<StaffAgentAccessRow>();
    if (accessErr) throw accessErr;

    return {
      status: "resolved",
      principal: buildStaffPrincipal({ authUserId: row.auth_user_id, tenantId: row.tenant_id, role: staff.role, channel, access }),
    };
  }

  // client
  if (!row.tenant_id) return { status: "revoked" };
  const { data: membership, error: memberErr } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", row.tenant_id)
    .eq("user_id", row.auth_user_id)
    .maybeSingle<{ role: string }>();
  if (memberErr) throw memberErr;
  if (!membership) return { status: "revoked" };

  const clientPrincipal = buildClientPrincipal({ authUserId: row.auth_user_id, tenantId: row.tenant_id, role: membership.role as TenantRole, channel });
  return { status: "resolved", principal: clientPrincipal };
}

export interface ActivatePrincipalInput {
  normalizedPhone: string;
  principalType: "staff" | "client";
  authUserId: string;
  tenantId: string | null;
}

/**
 * Create/activate a phone->principal link. Any existing ACTIVE link for the
 * same phone is revoked first so a phone can never resolve to two active
 * principals (belt-and-braces alongside the DB partial unique index).
 */
export async function activateWhatsAppPrincipal(
  supabase: ServiceClient,
  input: ActivatePrincipalInput
): Promise<void> {
  if (input.principalType === "client" && !input.tenantId) {
    throw new Error("agent-core: cannot activate a client principal without tenantId");
  }

  const { error: revokeErr } = await supabase
    .from("whatsapp_channel_principals")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("normalized_phone", input.normalizedPhone)
    .eq("status", "active");
  if (revokeErr) throw revokeErr;

  const { error: insertErr } = await supabase.from("whatsapp_channel_principals").insert({
    normalized_phone: input.normalizedPhone,
    principal_type: input.principalType,
    auth_user_id: input.authUserId,
    tenant_id: input.tenantId,
    status: "active",
    verified_at: new Date().toISOString(),
  });
  if (insertErr) throw insertErr;
}

export async function revokeWhatsAppPrincipal(
  supabase: ServiceClient,
  principalId: string
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_channel_principals")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", principalId)
    .eq("status", "active");
  if (error) throw error;
}

export interface OwnPrincipalStatus {
  linked: boolean;
  principalType?: "staff" | "client";
  tenantId?: string | null;
  lastUsedAt?: string | null;
  verifiedAt?: string;
  /** Last 2 digits only, e.g. "•••••••77" — enough for the caller to
   *  recognize their own number, never enough to identify someone else's. */
  maskedPhone?: string;
}

function maskPhone(normalizedPhone: string): string {
  const visible = normalizedPhone.slice(-2);
  return "•".repeat(Math.max(normalizedPhone.length - 2, 0)) + visible;
}

/** Status lookup for an authenticated caller's OWN link — used by the
 *  status routes (PHASE 18). Never returns another user's phone number or
 *  principal row; scoped strictly to authUserId. The phone itself is always
 *  masked before it leaves this function — no call site ever sees or can
 *  forward the full number. */
export async function getOwnWhatsAppPrincipalStatus(
  supabase: ServiceClient,
  authUserId: string
): Promise<OwnPrincipalStatus> {
  const { data, error } = await supabase
    .from("whatsapp_channel_principals")
    .select("principal_type, tenant_id, last_used_at, verified_at, normalized_phone")
    .eq("auth_user_id", authUserId)
    .eq("status", "active")
    .maybeSingle<{ principal_type: "staff" | "client"; tenant_id: string | null; last_used_at: string | null; verified_at: string; normalized_phone: string }>();
  if (error) throw error;
  if (!data) return { linked: false };
  return {
    linked: true,
    principalType: data.principal_type,
    tenantId: data.tenant_id,
    lastUsedAt: data.last_used_at,
    verifiedAt: data.verified_at,
    maskedPhone: maskPhone(data.normalized_phone),
  };
}

/** Revokes the authenticated caller's OWN active link. Scoped to
 *  authUserId — a caller can never revoke someone else's link through this
 *  function (routes must never accept an arbitrary principalId from the
 *  client for this operation). */
export async function revokeOwnWhatsAppPrincipal(supabase: ServiceClient, authUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("whatsapp_channel_principals")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("auth_user_id", authUserId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function touchPrincipalLastUsed(
  supabase: ServiceClient,
  normalizedPhone: string
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_channel_principals")
    .update({ last_used_at: new Date().toISOString() })
    .eq("normalized_phone", normalizedPhone)
    .eq("status", "active");
  if (error) throw error;
}
