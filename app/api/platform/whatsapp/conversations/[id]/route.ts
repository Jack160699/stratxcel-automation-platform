import { requireTenantContext, requireTenantReadContext, requireAdminAggregateReadContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { listMessagesForConversation, markConversationRead, setConversationAutomationMode } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  let clientSupabase: any;
  let isCustomer = false;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    clientSupabase = createSupabaseServiceClient();
  } else {
    const ctx = await requireTenantReadContext(tenantId);
    if (ctx.ok) {
      clientSupabase = ctx.supabase;
      isCustomer = ctx.accessMode === "customer";
    } else {
      // Support staff admin aggregate mode (Admin CRM at /admin/leads)
      const agg = await requireAdminAggregateReadContext();
      if (!agg.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
      clientSupabase = agg.supabase;
    }
  }

  const messages = await listMessagesForConversation(clientSupabase, tenantId, id);
  if (isCustomer) await markConversationRead(clientSupabase, tenantId, id).catch(() => {});
  return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
}

const VALID_MODES = ["automated", "human_only", "paused", "handoff"];

/** Staff taking explicit ownership of a conversation (or releasing it back to automation). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { tenantId, automationMode, assignedStaff } = body as { tenantId?: string; automationMode?: string; assignedStaff?: string | null };
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (automationMode && !VALID_MODES.includes(automationMode)) {
    return Response.json({ error: `automationMode must be one of ${VALID_MODES.join(", ")}` }, { status: 400 });
  }

  let callerUserId: string | null = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader === `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    callerUserId = "service-role";
  } else {
    const ctx = await requireTenantContext(tenantId);
    if (ctx.ok) {
      callerUserId = ctx.userId;
    } else {
      const agg = await requireAdminAggregateReadContext();
      if (agg.ok) {
        callerUserId = agg.userId;
      } else {
        return Response.json({ error: ctx.error }, { status: ctx.status });
      }
    }
  }

  const { supabase } = getTenantServiceContext();
  const { data: current, error: fetchErr } = await supabase
    .from("whatsapp_conversations")
    .select("automation_mode, assigned_staff")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (fetchErr || !current) return Response.json({ error: "Conversation not found" }, { status: 404 });

  const conversation = await setConversationAutomationMode(supabase, {
    tenantId,
    conversationId: id,
    mode: (automationMode as "automated" | "human_only" | "paused" | "handoff" | undefined) ?? current.automation_mode,
    assignedStaff: assignedStaff !== undefined ? assignedStaff : (current.assigned_staff ?? callerUserId),
  });
  return Response.json({ conversation });
}
