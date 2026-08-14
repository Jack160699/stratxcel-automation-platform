import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/integrations/access-requests
 * Records a customer request for connector testing access.
 * Server derives authenticated user, email, and tenant ID securely.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tenantId?: string;
    provider?: string;
    reason?: string;
  };

  const provider = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "";
  const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : null;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!provider) {
    return NextResponse.json({ error: "Provider is required" }, { status: 400 });
  }

  const { supabase: serviceClient } = getTenantServiceContext();

  // Record access request in audit_events
  const { error } = await serviceClient.from("audit_events").insert({
    tenant_id: tenantId ?? "00000000-0000-0000-0000-000000000000",
    actor_user_id: user.id,
    action: "connector.access_requested",
    target_type: "connector",
    target_id: provider,
    metadata: {
      provider,
      user_email: user.email ?? null,
      reason: reason || null,
      requested_at: new Date().toISOString(),
    },
  });

  if (error) {
    console.error("Failed to record connector access request:", error.message);
  }

  return NextResponse.json({
    ok: true,
    message: "Request received. We’ll notify you when testing access is enabled.",
  });
}
