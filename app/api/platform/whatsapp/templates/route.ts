import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { listTemplatesForTenant, resolvePlatformWhatsAppSender, syncTemplatesForBinding } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { supabase } = getTenantServiceContext();
  const platformSender = await resolvePlatformWhatsAppSender(supabase);
  if (!platformSender.ok) {
    return Response.json(
      { templates: [], senderStatus: "SENDER_NOT_CONFIGURED" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const templates = await listTemplatesForTenant(supabase, platformSender.sender.tenantId);
  return Response.json(
    { templates, senderStatus: "CONFIGURED" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Pulls the real, current template list from Meta — never fabricates
 * APPROVED status. A no-op (synced: 0) in disabled/shadow mode, or if the
 * the platform sender is unavailable, rather than a fake success.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId } = body as { tenantId?: string };
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const platformSender = await resolvePlatformWhatsAppSender(supabase);
  if (!platformSender.ok) {
    return Response.json({ error: "Stratxcel platform WhatsApp sender is not configured", code: "SENDER_NOT_CONFIGURED" }, { status: 409 });
  }

  try {
    const result = await syncTemplatesForBinding(supabase, {
      tenantId: platformSender.sender.tenantId,
      phoneBindingId: platformSender.sender.bindingId,
      wabaId: platformSender.sender.wabaId,
      phoneNumberId: platformSender.sender.phoneNumberId,
    });
    const templates = await listTemplatesForTenant(supabase, platformSender.sender.tenantId);
    return Response.json({ ...result, templates, senderStatus: "CONFIGURED" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Template sync failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}
