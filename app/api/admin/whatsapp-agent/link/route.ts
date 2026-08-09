import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { revokeOwnWhatsAppPrincipal } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Revoke the authenticated staff caller's OWN WhatsApp agent link.
 *  Platform staff are not tenant-scoped, so identity is resolved directly
 *  from the Supabase session, never through tenant membership. Scoped
 *  strictly to the caller (revokeOwnWhatsAppPrincipal takes only an
 *  authUserId) — this route cannot revoke anyone else's link. */
export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const staffAuth = await requirePlatformStaff(user.id);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase: serviceDb } = getTenantServiceContext();
  const revoked = await revokeOwnWhatsAppPrincipal(serviceDb, user.id);
  return Response.json({ revoked }, { headers: { "Cache-Control": "no-store" } });
}
