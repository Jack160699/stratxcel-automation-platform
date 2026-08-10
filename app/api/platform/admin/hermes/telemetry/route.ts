import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { collectHermesTelemetry } from "@/lib/hermes/mission-control";
import { requireReleaseAccessApi } from "@/lib/release/require-release-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hermes Mission Control telemetry — V2 API surface. */
export async function GET() {
  const release = await requireReleaseAccessApi("v2");
  if (!release.ok) return release.response;

  const session = await createSupabaseServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const auth = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin"]);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const telemetry = await collectHermesTelemetry(getTenantServiceContext().supabase);
  return Response.json(telemetry, {
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
