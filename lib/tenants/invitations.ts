import { createHash } from "node:crypto";
import type { TenantRole } from "./types";

export const INVITE_ROLES = new Set<TenantRole>(["admin", "operator", "viewer"]);

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function assertInviteRole(role: string): role is TenantRole {
  return INVITE_ROLES.has(role as TenantRole);
}

export function countOwners(members: Array<{ role: string }>): number {
  return members.filter((member) => member.role === "owner").length;
}

export function canRemoveMember(input: {
  actorsRole: TenantRole;
  targetRole: string;
  ownerCount: number;
}): { ok: true } | { ok: false; reason: "LAST_OWNER" | "FORBIDDEN" } {
  if (input.actorsRole !== "owner") return { ok: false, reason: "FORBIDDEN" };
  if (input.targetRole === "owner" && input.ownerCount <= 1) return { ok: false, reason: "LAST_OWNER" };
  return { ok: true };
}

export function canChangeMemberRole(input: {
  actorsRole: TenantRole;
  currentRole: string;
  nextRole: string;
  ownerCount: number;
}): { ok: true } | { ok: false; reason: "LAST_OWNER" | "FORBIDDEN" | "INVALID_ROLE" } {
  if (input.actorsRole !== "owner") return { ok: false, reason: "FORBIDDEN" };
  if (input.nextRole === "owner") return { ok: false, reason: "FORBIDDEN" };
  if (!INVITE_ROLES.has(input.nextRole as TenantRole)) return { ok: false, reason: "INVALID_ROLE" };
  if (input.currentRole === "owner" && input.ownerCount <= 1) return { ok: false, reason: "LAST_OWNER" };
  return { ok: true };
}
