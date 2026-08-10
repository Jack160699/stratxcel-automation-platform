import type { ServiceClient } from "@stratxcel/whatsapp";
import { can } from "../rbac/policy.ts";
import type { Permission, TenantRole } from "../rbac/types.ts";

/**
 * Safe tenant binding for existing Social Autopilot Brand Brains and
 * connected social accounts (nullable tenant_id columns added by the
 * package-autopilot migrations).
 *
 * Rules (fail closed):
 * - Never auto-bind ambiguous unbound data.
 * - Unbound → authorized target tenant is allowed.
 * - Already same tenant → idempotent success.
 * - Bound to another tenant → rejected (no cross-tenant reassignment).
 * - Random tenant members cannot claim arbitrary unbound UUIDs.
 * - Legitimate paths only: resource owner_id match + tenant RBAC, or
 *   Stratxcel staff (stratxcel_admins), never a weak boolean.
 */

export type AssignmentDenial =
  | "not_authorized"
  | "resource_not_found"
  | "cross_tenant_reassignment"
  | "ambiguous_candidate"
  | "tenant_already_has_brand"
  | "arbitrary_uuid_claim_rejected";

export interface AssignmentAuthority {
  actorUserId: string;
  isStaff: boolean;
  membershipRole: TenantRole | null;
}

export interface BrandAssignmentDecisionInput {
  authority: AssignmentAuthority;
  profile: { id: string; owner_id: string; tenant_id: string | null } | null;
  targetTenantId: string;
  /** True when the caller supplied an explicit brandProfileId. */
  explicitProfileId: boolean;
  /** True when this tenant already has a different bound brand. */
  tenantAlreadyHasOtherBrand: boolean;
}

export interface AccountAssignmentDecisionInput {
  authority: AssignmentAuthority;
  account: { id: string; owner_id: string; tenant_id: string | null; platform: string; status: string } | null;
  targetTenantId: string;
  /** True when the caller supplied an explicit accountId. */
  explicitAccountId: boolean;
}

export type AssignmentDecision =
  | { allow: true; idempotent: boolean }
  | { allow: false; reason: AssignmentDenial };

function hasTenantPermission(authority: AssignmentAuthority, permission: Permission): boolean {
  return authority.membershipRole != null && can(authority.membershipRole, permission);
}

/**
 * Pure Brand Brain assignment gate — unit-tested without Supabase.
 *
 * Staff may assign an explicit unbound/same-tenant profile.
 * Non-staff may only assign a profile they own (owner_id match) while holding
 * brand_brain:edit on the target tenant. Supplying an explicit UUID for a
 * profile the caller does not own is always rejected for non-staff.
 */
export function decideBrandAssignment(input: BrandAssignmentDecisionInput): AssignmentDecision {
  const { authority, profile, targetTenantId, explicitProfileId, tenantAlreadyHasOtherBrand } = input;
  if (!authority.isStaff && !hasTenantPermission(authority, "brand_brain:edit")) {
    return { allow: false, reason: "not_authorized" };
  }
  if (!profile) return { allow: false, reason: "resource_not_found" };

  const ownsProfile = profile.owner_id === authority.actorUserId;
  if (!authority.isStaff) {
    if (explicitProfileId && !ownsProfile) {
      return { allow: false, reason: "arbitrary_uuid_claim_rejected" };
    }
    if (!ownsProfile) return { allow: false, reason: "not_authorized" };
  }

  if (profile.tenant_id === targetTenantId) return { allow: true, idempotent: true };
  if (profile.tenant_id != null && profile.tenant_id !== targetTenantId) {
    return { allow: false, reason: "cross_tenant_reassignment" };
  }
  if (tenantAlreadyHasOtherBrand) return { allow: false, reason: "tenant_already_has_brand" };
  return { allow: true, idempotent: false };
}

/**
 * Pure social-account assignment gate — unit-tested without Supabase.
 *
 * Staff may assign an unbound/same-tenant account.
 * Non-staff require integration:configure on the target tenant AND
 * account.owner_id === actor (the person who connected the account).
 * Arbitrary UUID claims by ordinary tenant members are rejected.
 */
export function decideAccountAssignment(input: AccountAssignmentDecisionInput): AssignmentDecision {
  const { authority, account, targetTenantId, explicitAccountId } = input;
  if (!account) return { allow: false, reason: "resource_not_found" };

  const ownsAccount = account.owner_id === authority.actorUserId;
  if (authority.isStaff) {
    // staff path authorized
  } else if (ownsAccount && hasTenantPermission(authority, "integration:configure")) {
    // owner + integration permission
  } else {
    if (explicitAccountId && !ownsAccount) {
      return { allow: false, reason: "arbitrary_uuid_claim_rejected" };
    }
    return { allow: false, reason: "not_authorized" };
  }

  if (account.tenant_id === targetTenantId) return { allow: true, idempotent: true };
  if (account.tenant_id != null && account.tenant_id !== targetTenantId) {
    return { allow: false, reason: "cross_tenant_reassignment" };
  }
  return { allow: true, idempotent: false };
}

export async function resolveAssignmentAuthority(
  service: ServiceClient,
  actorUserId: string,
  tenantId: string
): Promise<AssignmentAuthority> {
  const [{ data: staff }, { data: membership }] = await Promise.all([
    service.from("stratxcel_admins").select("user_id").eq("user_id", actorUserId).maybeSingle(),
    service.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("user_id", actorUserId).maybeSingle(),
  ]);
  return {
    actorUserId,
    isStaff: Boolean(staff),
    membershipRole: (membership?.role as TenantRole | undefined) ?? null,
  };
}

function denialError(reason: AssignmentDenial): Error {
  return new Error(`assignment_${reason}`);
}

type BrandProfileCandidate = { id: string; owner_id: string; tenant_id: string | null; identity: unknown };
type SocialAccountCandidate = {
  id: string;
  owner_id: string;
  tenant_id: string | null;
  platform: string;
  status: string;
  display_name: string | null;
  username: string;
};

export async function assignBrandProfileToTenant(
  service: ServiceClient,
  input: {
    tenantId: string;
    actorUserId: string;
    /** Staff may pass an explicit id. Non-staff UUID claims for profiles they do not own are rejected. */
    brandProfileId?: string;
  }
) {
  const authority = await resolveAssignmentAuthority(service, input.actorUserId, input.tenantId);
  const explicitProfileId = Boolean(input.brandProfileId);

  let profile: BrandProfileCandidate | null = null;
  if (input.brandProfileId) {
    const { data } = await service
      .from("social_brand_profiles")
      .select("id, owner_id, tenant_id, identity")
      .eq("id", input.brandProfileId)
      .maybeSingle();
    profile = (data as BrandProfileCandidate | null) ?? null;
  } else {
    // Client-safe discovery: only profiles the actor owns. Never "any unbound".
    const { data: owned } = await service
      .from("social_brand_profiles")
      .select("id, owner_id, tenant_id, identity")
      .eq("owner_id", input.actorUserId)
      .or(`tenant_id.is.null,tenant_id.eq.${input.tenantId}`);
    const rows = (owned ?? []) as BrandProfileCandidate[];
    const unbound = rows.filter((row) => row.tenant_id == null);
    const sameTenant = rows.filter((row) => row.tenant_id === input.tenantId);
    if (sameTenant.length === 1) profile = sameTenant[0];
    else if (unbound.length === 1) profile = unbound[0];
    else if (unbound.length > 1) throw denialError("ambiguous_candidate");
  }

  const { data: existingBound } = await service
    .from("social_brand_profiles")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  const boundId = (existingBound as { id: string } | null)?.id;
  const tenantAlreadyHasOtherBrand = Boolean(boundId && profile && boundId !== profile.id);

  const decision = decideBrandAssignment({
    authority,
    profile,
    targetTenantId: input.tenantId,
    explicitProfileId,
    tenantAlreadyHasOtherBrand,
  });
  if (!decision.allow) throw denialError(decision.reason);
  if (decision.idempotent) return { id: profile!.id, tenant_id: input.tenantId, idempotent: true };

  const { data, error } = await service
    .from("social_brand_profiles")
    .update({ tenant_id: input.tenantId, updated_at: new Date().toISOString() })
    .eq("id", profile!.id)
    .is("tenant_id", null)
    .select("id, tenant_id")
    .maybeSingle();
  if (error || !data) throw new Error("brand_assignment_failed");

  const { recordAudit } = await import("./repositories/system.ts");
  await recordAudit({
    actorType: "USER",
    actorId: input.actorUserId,
    action: "social.package.brand_assigned",
    targetType: "social_brand_profile",
    targetId: data.id,
    summary: "Assigned Brand Brain to a client workspace",
    meta: { tenantId: input.tenantId, staff: authority.isStaff },
  });
  return { ...data, idempotent: false };
}

export async function assignSocialAccountToTenant(
  service: ServiceClient,
  input: {
    tenantId: string;
    actorUserId: string;
    /** Staff may pass an explicit id. Non-staff UUID claims for accounts they do not own are rejected. */
    accountId?: string;
    /** Client-safe resolver: assign the caller's owned CONNECTED unbound account for this platform. */
    platform?: string;
  }
) {
  const authority = await resolveAssignmentAuthority(service, input.actorUserId, input.tenantId);
  const explicitAccountId = Boolean(input.accountId);

  let account: SocialAccountCandidate | null = null;
  if (input.accountId) {
    const { data } = await service
      .from("social_accounts")
      .select("id, owner_id, tenant_id, platform, status, display_name, username")
      .eq("id", input.accountId)
      .maybeSingle();
    account = (data as SocialAccountCandidate | null) ?? null;
  } else if (input.platform) {
    const platform = input.platform.toLowerCase();
    const query = service
      .from("social_accounts")
      .select("id, owner_id, tenant_id, platform, status, display_name, username")
      .eq("platform", platform)
      .eq("status", "CONNECTED")
      .or(`tenant_id.is.null,tenant_id.eq.${input.tenantId}`);
    // Non-staff: only their own connected accounts. Staff may resolve by platform when unambiguous.
    const scoped = authority.isStaff ? query : query.eq("owner_id", input.actorUserId);
    const { data: rows } = await scoped;
    const list = (rows ?? []) as SocialAccountCandidate[];
    const sameTenant = list.filter((row) => row.tenant_id === input.tenantId);
    const unbound = list.filter((row) => row.tenant_id == null);
    if (sameTenant.length === 1) account = sameTenant[0];
    else if (unbound.length === 1) account = unbound[0];
    else if (unbound.length > 1) throw denialError("ambiguous_candidate");
  } else {
    throw denialError("resource_not_found");
  }

  const decision = decideAccountAssignment({
    authority,
    account,
    targetTenantId: input.tenantId,
    explicitAccountId,
  });
  if (!decision.allow) throw denialError(decision.reason);
  if (decision.idempotent) return { id: account!.id, tenant_id: input.tenantId, platform: account!.platform, idempotent: true };

  const { data, error } = await service
    .from("social_accounts")
    .update({ tenant_id: input.tenantId, updated_at: new Date().toISOString() })
    .eq("id", account!.id)
    .is("tenant_id", null)
    .select("id, tenant_id, platform")
    .maybeSingle();
  if (error || !data) throw new Error("account_assignment_failed");

  const { recordAudit } = await import("./repositories/system.ts");
  await recordAudit({
    actorType: "USER",
    actorId: input.actorUserId,
    action: "social.package.account_assigned",
    targetType: "social_account",
    targetId: data.id,
    summary: "Assigned a social destination to a client workspace",
    meta: { tenantId: input.tenantId, platform: data.platform, staff: authority.isStaff },
  });
  return { ...data, idempotent: false };
}

export interface AssignablePackageResources {
  brand: { available: boolean; label: string | null; alreadyBound: boolean };
  accounts: Array<{ platform: string; label: string; available: boolean; alreadyBound: boolean }>;
}

/**
 * Client/admin setup discovery. Never returns raw UUIDs — only human labels
 * and whether an assign action is available for this actor.
 */
export async function listAssignablePackageResources(
  service: ServiceClient,
  input: { tenantId: string; actorUserId: string }
): Promise<AssignablePackageResources> {
  const authority = await resolveAssignmentAuthority(service, input.actorUserId, input.tenantId);

  const { data: boundBrand } = await service
    .from("social_brand_profiles")
    .select("id, identity")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();

  let brandAvailable = false;
  let brandLabel: string | null = null;
  if (boundBrand) {
    brandLabel = brandLabelFromIdentity(boundBrand.identity) ?? "Brand Brain";
  } else if (authority.isStaff || hasTenantPermission(authority, "brand_brain:edit")) {
    const brandQuery = authority.isStaff
      ? service.from("social_brand_profiles").select("id, owner_id, identity").is("tenant_id", null).limit(5)
      : service.from("social_brand_profiles").select("id, owner_id, identity").eq("owner_id", input.actorUserId).is("tenant_id", null).limit(5);
    const { data: unboundBrands } = await brandQuery;
    const eligible = (unboundBrands ?? []).filter((row) => authority.isStaff || row.owner_id === input.actorUserId);
    if (eligible.length === 1) {
      brandAvailable = true;
      brandLabel = brandLabelFromIdentity(eligible[0].identity) ?? "Brand Brain";
    }
  }

  const accountQuery = authority.isStaff
    ? service.from("social_accounts").select("id, owner_id, platform, display_name, username, tenant_id, status").eq("status", "CONNECTED")
    : service.from("social_accounts").select("id, owner_id, platform, display_name, username, tenant_id, status").eq("status", "CONNECTED").eq("owner_id", input.actorUserId);
  const { data: accounts } = await accountQuery;
  const byPlatform = new Map<string, { available: boolean; alreadyBound: boolean; label: string }>();
  for (const row of accounts ?? []) {
    const platform = String(row.platform).toLowerCase();
    const label = (row.display_name as string | null) || (row.username as string) || platform;
    const boundHere = row.tenant_id === input.tenantId;
    const unbound = row.tenant_id == null;
    const canAssign =
      unbound &&
      (authority.isStaff ||
        (row.owner_id === input.actorUserId && hasTenantPermission(authority, "integration:configure")));
    const current = byPlatform.get(platform);
    if (boundHere) {
      byPlatform.set(platform, { available: false, alreadyBound: true, label });
    } else if (canAssign && !current?.alreadyBound) {
      // Ambiguous: more than one unbound candidate for the same platform → hide assign.
      if (current?.available) {
        byPlatform.set(platform, { available: false, alreadyBound: false, label: current.label });
      } else {
        byPlatform.set(platform, { available: true, alreadyBound: false, label });
      }
    } else if (!current) {
      byPlatform.set(platform, { available: false, alreadyBound: false, label });
    }
  }

  return {
    brand: {
      available: brandAvailable,
      label: brandLabel,
      alreadyBound: Boolean(boundBrand),
    },
    accounts: [...byPlatform.entries()].map(([platform, value]) => ({
      platform,
      label: value.label,
      available: value.available,
      alreadyBound: value.alreadyBound,
    })),
  };
}

function brandLabelFromIdentity(identity: unknown): string | null {
  if (!identity || typeof identity !== "object") return null;
  const name = (identity as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
