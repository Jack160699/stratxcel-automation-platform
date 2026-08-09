import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { getOwnWhatsAppPrincipalStatus } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Status of the authenticated staff caller's OWN WhatsApp agent link.
 *  Platform staff are not tenant-scoped, so identity is resolved directly
 *  from the Supabase session, never through tenant membership. Never
 *  returns another user's phone number or link status. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const staffAuth = await requirePlatformStaff(user.id);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase: serviceDb } = getTenantServiceContext();
  const status = await getOwnWhatsAppPrincipalStatus(serviceDb, user.id);
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
