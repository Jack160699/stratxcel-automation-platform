export type IdentityState = "NO_SESSION" | "INTERNAL_STAFF" | "CUSTOMER_MEMBER" | "NEW_CUSTOMER" | "STAFF_VIEWING_CLIENT";

export function decideIdentityState(input: {
  hasSession: boolean;
  isStaff: boolean;
  membershipCount: number;
  hasValidStaffWorkspace: boolean;
  workspaceMode: "customer" | "admin" | null;
}): IdentityState {
  if (!input.hasSession) return "NO_SESSION";
  if (input.isStaff && input.hasValidStaffWorkspace) return "STAFF_VIEWING_CLIENT";
  if (input.isStaff && input.workspaceMode === "customer" && input.membershipCount > 0) {
    return "CUSTOMER_MEMBER";
  }
  if (input.isStaff) return "INTERNAL_STAFF";
  return input.membershipCount > 0 ? "CUSTOMER_MEMBER" : "NEW_CUSTOMER";
}

export function defaultDestination(state: IdentityState): "/" | "/admin" | "/app" {
  if (state === "NO_SESSION") return "/";
  if (state === "INTERNAL_STAFF") return "/admin";
  return "/app";
}
