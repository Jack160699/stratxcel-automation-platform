import { requireTenantContext, requireTenantReadContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listFollowUpsForTenant, scheduleFollowUp } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantReadContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const followUps = await listFollowUpsForTenant(ctx.supabase, tenantId);
  return Response.json({ followUps }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId, leadId, conversationId, nextAction, dueAt, assignedTo } = body as {
    tenantId?: string;
    leadId?: string;
    conversationId?: string;
    nextAction?: string;
    dueAt?: string;
    assignedTo?: string;
  };
  if (!tenantId || !leadId || !nextAction || !dueAt) {
    return Response.json({ error: "tenantId, leadId, nextAction, and dueAt are required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "crm:manage");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const { data: lead } = await supabase.from("crm_leads").select("id").eq("id", leadId).eq("tenant_id", tenantId).maybeSingle();
  if (!lead) return Response.json({ error: "Lead not found in this workspace" }, { status: 404 });

  const followUp = await scheduleFollowUp(supabase, {
    tenantId,
    leadId,
    conversationId: conversationId ?? null,
    nextAction,
    dueAt: new Date(dueAt),
    assignedTo: assignedTo ?? ctx.userId,
  });
  return Response.json({ followUp }, { status: 201 });
}
