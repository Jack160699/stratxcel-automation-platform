import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { listKillSwitches, setKillSwitch, type KillSwitchScope } from "@stratxcel/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operational kill-switch control — smallest existing appropriate scopes
 * (global_hermes / worker_type / tenant / mission). Only platform staff can
 * read or set these; there is no tenant-facing path to this route at all.
 * Setting a switch never destroys queued work — see @stratxcel/queue's
 * isKillSwitchActive/requeueDeadLetter for how workers respect it.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase } = getTenantServiceContext();
  const switches = await listKillSwitches(supabase);
  return Response.json({ switches }, { headers: { "Cache-Control": "no-store" } });
}

const VALID_SCOPES: KillSwitchScope[] = ["global_hermes", "worker_type", "tenant", "mission"];
const VALID_WORKER_TYPES = ["mission-worker", "whatsapp-worker", "hermes-gateway"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId, scope, scopeId, enabled, reason } = body as {
    tenantId?: string;
    scope?: string;
    scopeId?: string;
    enabled?: boolean;
    reason?: string;
  };

  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  if (!scope || !VALID_SCOPES.includes(scope as KillSwitchScope)) {
    return Response.json({ error: `scope must be one of: ${VALID_SCOPES.join(", ")}` }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return Response.json({ error: "enabled (boolean) is required" }, { status: 400 });
  }
  if (scope === "worker_type" && !VALID_WORKER_TYPES.includes(scopeId ?? "")) {
    return Response.json({ error: `worker_type scope requires scopeId to be one of: ${VALID_WORKER_TYPES.join(", ")}` }, { status: 400 });
  }
  if ((scope === "tenant" || scope === "mission") && !scopeId) {
    return Response.json({ error: `scope '${scope}' requires a scopeId` }, { status: 400 });
  }

  const { supabase } = getTenantServiceContext();
  await setKillSwitch(supabase, {
    scope: scope as KillSwitchScope,
    scopeId: scope === "global_hermes" ? null : scopeId,
    enabled,
    reason,
    createdBy: ctx.userId,
  });

  return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
