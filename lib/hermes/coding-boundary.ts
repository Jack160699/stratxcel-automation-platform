/**
 * Web Studio sandbox may generate customer website code.
 * It must never receive a writable mount of the Stratxcel core repository.
 */
export const WEB_STUDIO_ALLOWED_ROOTS = ["/tmp/stratxcel-web-studio", "/workspace/web-studio"];

export function assertWebStudioPathAllowed(targetPath: string): { ok: true } | { ok: false; reason: "WEB_STUDIO_CORE_WRITE_DENIED" } {
  const normalized = targetPath.replace(/\\/g, "/");
  if (normalized.includes("stratxcel-automation-platform") && !normalized.includes("web-studio")) {
    return { ok: false, reason: "WEB_STUDIO_CORE_WRITE_DENIED" };
  }
  if (WEB_STUDIO_ALLOWED_ROOTS.some((root) => normalized.startsWith(root))) {
    return { ok: true };
  }
  if (/apps\/(web|mission-worker|hermes-gateway|whatsapp-worker)/.test(normalized)) {
    return { ok: false, reason: "WEB_STUDIO_CORE_WRITE_DENIED" };
  }
  return { ok: false, reason: "WEB_STUDIO_CORE_WRITE_DENIED" };
}

export const HIGH_RISK_ACTIONS = [
  "charges",
  "subscriptions",
  "payment mutations",
  "destructive customer data",
  "production database migrations",
  "production secrets",
  "disabling security controls",
  "RLS changes",
  "destructive infrastructure",
] as const;

export function requiresOwnerApproval(action: string): boolean {
  const value = action.toLowerCase();
  return HIGH_RISK_ACTIONS.some((item) => value.includes(item.toLowerCase()));
}
