import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server.ts";
import {
  readWorkspaceMode,
  setWorkspaceModeCookie,
  clearStaffWorkspaceCookie,
  type WorkspaceMode,
} from "./staff-workspace.ts";

export type AccountContext = "user" | "admin";

export interface AvailableAccountContexts {
  userId: string;
  email: string | null;
  contexts: AccountContext[];
  activeContext: AccountContext;
  isStaff: boolean;
}

export interface ContextAuditEvent {
  userId: string;
  action: "context_selected" | "context_switched" | "context_switch_rejected";
  fromContext?: AccountContext | null;
  toContext: AccountContext;
  isStaff: boolean;
  reason?: string;
}

/**
 * Structured telemetry for account context selection and switching.
 * Strictly avoids logging secrets or sensitive credentials.
 */
export function recordContextAuditEvent(event: ContextAuditEvent): void {
  const payload = {
    tag: "AccountContextAudit",
    timestamp: new Date().toISOString(),
    userId: event.userId,
    action: event.action,
    fromContext: event.fromContext ?? null,
    toContext: event.toContext,
    isStaff: event.isStaff,
    ...(event.reason ? { reason: event.reason } : {}),
  };

  if (event.action === "context_switch_rejected") {
    console.warn("[AccountContext:WARN]", JSON.stringify(payload));
  } else {
    console.log("[AccountContext:INFO]", JSON.stringify(payload));
  }
}

/**
 * Resolves available account contexts for the currently authenticated user
 * by independently querying server-side role truth (stratxcel_admins).
 */
export async function getAvailableAccountContexts(): Promise<AvailableAccountContexts | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: adminRow } = await supabase
    .from("stratxcel_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isStaff = Boolean(adminRow);
  const contexts: AccountContext[] = isStaff ? ["user", "admin"] : ["user"];

  const cookieMode = await readWorkspaceMode(user.id);
  const activeContext: AccountContext =
    cookieMode === "admin" && isStaff ? "admin" : "user";

  return {
    userId: user.id,
    email: user.email ?? null,
    contexts,
    activeContext,
    isStaff,
  };
}

/**
 * Server-authorized account context switch.
 *
 * Security:
 * - Independently verifies server-side staff authorization for "admin" context.
 * - Non-staff accounts attempting to enter "admin" context fail closed to "user".
 * - Persists context via signed HMAC-SHA256 cookie.
 */
export async function switchAccountContext(
  targetContext: AccountContext
): Promise<{ ok: boolean; redirect: string; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, redirect: "/login", error: "Not authenticated" };
  }

  const { data: adminRow } = await supabase
    .from("stratxcel_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const isStaff = Boolean(adminRow);
  const currentCookieMode = await readWorkspaceMode(user.id);
  const fromContext: AccountContext =
    currentCookieMode === "admin" && isStaff ? "admin" : "user";

  if (targetContext === "admin" && !isStaff) {
    recordContextAuditEvent({
      userId: user.id,
      action: "context_switch_rejected",
      fromContext,
      toContext: "admin",
      isStaff: false,
      reason: "User lacks stratxcel_admins membership",
    });

    // Fail closed: enforce customer/user mode
    await setWorkspaceModeCookie(user.id, "customer");
    return {
      ok: false,
      redirect: "/app",
      error: "You are not authorized to enter Admin context.",
    };
  }

  const targetWorkspaceMode: WorkspaceMode =
    targetContext === "admin" ? "admin" : "customer";

  await setWorkspaceModeCookie(user.id, targetWorkspaceMode);

  if (targetWorkspaceMode === "customer") {
    await clearStaffWorkspaceCookie();
  }

  recordContextAuditEvent({
    userId: user.id,
    action: fromContext === targetContext ? "context_selected" : "context_switched",
    fromContext,
    toContext: targetContext,
    isStaff,
  });

  return {
    ok: true,
    redirect: targetContext === "admin" ? "/admin" : "/app",
  };
}
