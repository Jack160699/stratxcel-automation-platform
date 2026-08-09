import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { resolveAdminWebPrincipal } from "@/lib/agent-core/web-principal";
import { resetAgentSession } from "@stratxcel/agent-core";

export async function POST() {
  const auth = await resolveAdminWebPrincipal();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  await createSupabaseServerClient();
  const { supabase } = getTenantServiceContext();
  await resetAgentSession(supabase, { ...auth.principal, channel: "whatsapp" });
  return Response.json({ reset: true }, { headers: { "Cache-Control": "no-store" } });
}
