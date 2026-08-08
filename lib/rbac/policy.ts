import type { Permission, TenantRole } from "./types";

/**
 * Closed role -> permission map. Every permission check in the platform
 * (missions, brand brain, wallet, approvals, human handoff) goes through
 * `can()` rather than an ad-hoc `role === "admin"` check, so the full set
 * of what each role can do lives in exactly one place.
 */
const ROLE_PERMISSIONS: Record<TenantRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "tenant:invite_member",
    "tenant:manage_members",
    "brand_brain:view",
    "brand_brain:edit",
    "mission:create",
    "mission:cancel",
    "mission:view",
    "approval:decide",
    "wallet:view",
    "wallet:topup",
    "wallet:spend",
    "human_handoff:assign",
    "human_handoff:resolve",
    "integration:configure",
    "whatsapp:send",
    "crm:manage",
  ]),
  admin: new Set<Permission>([
    "tenant:invite_member",
    "brand_brain:view",
    "brand_brain:edit",
    "mission:create",
    "mission:cancel",
    "mission:view",
    "approval:decide",
    "wallet:view",
    "wallet:topup",
    "wallet:spend",
    "human_handoff:assign",
    "human_handoff:resolve",
    "integration:configure",
    "whatsapp:send",
    "crm:manage",
  ]),
  operator: new Set<Permission>([
    "brand_brain:view",
    "mission:create",
    "mission:cancel",
    "mission:view",
    "wallet:view",
    "human_handoff:assign",
    "whatsapp:send",
    "crm:manage",
  ]),
  viewer: new Set<Permission>(["brand_brain:view", "mission:view", "wallet:view"]),
};

export function can(role: TenantRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export class PermissionDeniedError extends Error {
  readonly role: TenantRole;
  readonly permission: Permission;
  constructor(role: TenantRole, permission: Permission) {
    super(`Role '${role}' does not have permission '${permission}'`);
    this.name = "PermissionDeniedError";
    this.role = role;
    this.permission = permission;
  }
}

export function requirePermission(role: TenantRole, permission: Permission): void {
  if (!can(role, permission)) throw new PermissionDeniedError(role, permission);
}
