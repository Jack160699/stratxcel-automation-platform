import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requireAdmin } from "@/lib/social/admin-guard";
import { autoResolvePlatformTemplates } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("force") === "true";

  const resolution = await autoResolvePlatformTemplates(supabase, { forceRefresh });

  return Response.json(
    {
      templates: resolution.templates,
      senderStatus: resolution.senderStatus,
      source: resolution.source,
      lastVerifiedAt: resolution.lastVerifiedAt,
      metaAvailable: resolution.metaAvailable,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Explicit sync endpoint (triggers forceRefresh against Meta API).
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();

  try {
    const resolution = await autoResolvePlatformTemplates(supabase, { forceRefresh: true });
    return Response.json({
      synced: resolution.templates.length,
      templates: resolution.templates,
      senderStatus: resolution.senderStatus,
      source: resolution.source,
      lastVerifiedAt: resolution.lastVerifiedAt,
      metaAvailable: resolution.metaAvailable,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Template sync failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
