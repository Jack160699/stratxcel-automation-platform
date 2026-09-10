import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getFounderNotifications,
  resolveFounderRequirement,
} from "@/lib/notifications/founder-notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId") || undefined;

  const { supabase } = getTenantServiceContext();
  const summary = await getFounderNotifications(supabase, tenantId);

  return Response.json(summary, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    requirementId?: string;
    action?: string;
  };

  if (!body.requirementId) {
    return Response.json({ error: "requirementId is required" }, { status: 400 });
  }

  const result = resolveFounderRequirement(body.requirementId);
  return Response.json(result);
}
