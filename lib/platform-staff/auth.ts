import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

export type PlatformStaffRole = "platform_owner" | "platform_admin" | "audit_reviewer" | "finance_reviewer";

export interface PlatformStaffUser {
  id: string;
  userId: string;
  role: PlatformStaffRole;
  isActive: boolean;
  createdAt: string;
}

export type PlatformStaffAuthResult =
  | { ok: true; staff: PlatformStaffUser }
  | { ok: false; status: number; error: string };

export async function requirePlatformStaff(
  userId: string,
  allowedRoles?: PlatformStaffRole[]
): Promise<PlatformStaffAuthResult> {
  if (!userId) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  const { data: staff, error } = await serviceDb
    .from("platform_staff_users")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !staff) {
    return { ok: false, status: 403, error: "Platform staff authorization required" };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(staff.role as PlatformStaffRole)) {
    return {
      ok: false,
      status: 403,
      error: `Platform role '${staff.role}' is not authorized. Allowed roles: ${allowedRoles.join(", ")}`,
    };
  }

  return {
    ok: true,
    staff: {
      id: staff.id,
      userId: staff.user_id,
      role: staff.role as PlatformStaffRole,
      isActive: staff.is_active,
      createdAt: staff.created_at,
    },
  };
}
