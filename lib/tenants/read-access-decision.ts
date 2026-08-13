import type { WorkspaceMode } from "../identity/staff-workspace";

export type TenantReadAccessDecision = "customer" | "staff_support" | "deny";

/**
 * Pure authorization decision shared by the server gate and boundary tests.
 * A real membership uses customer access unless admin intent is explicit.
 * Staff support requires both admin intent and an exact signed target.
 */
export function decideTenantReadAccess(input: {
  isStaff: boolean;
  hasMembership: boolean;
  workspaceMode: WorkspaceMode | null;
  staffWorkspaceTenantId: string | null;
  requestedTenantId: string;
}): TenantReadAccessDecision {
  if (input.hasMembership && (!input.isStaff || input.workspaceMode !== "admin")) {
    return "customer";
  }

  if (
    input.isStaff &&
    input.workspaceMode === "admin" &&
    input.staffWorkspaceTenantId === input.requestedTenantId
  ) {
    return "staff_support";
  }

  return "deny";
}
