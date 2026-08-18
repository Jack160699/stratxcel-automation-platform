import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { recordAudit } from "@/lib/social/repositories/system";
import { disconnectGoogleConnection } from "@stratxcel/search-discovery";
import { getCurrentBrandBrain, saveBrandBrainVersion } from "@stratxcel/brand-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/integrations/disconnect
 *
 * Tenant-scoped disconnect endpoint for V1.5 Digital Presence and Connectors.
 * Gated by RBAC policy (integration:configure / owner / admin).
 * Revokes local tokens and marks database status DISCONNECTED with zero data leaks.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: string;
    provider?: string;
  };

  const { tenantId, provider } = body;
  if (!tenantId || typeof tenantId !== "string") {
    return Response.json({ error: "tenantId is required" }, { status: 400 });
  }
  if (!provider || typeof provider !== "string") {
    return Response.json({ error: "provider is required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase: service } = getTenantServiceContext();
  const normalizedProvider = provider.toLowerCase();
  const now = new Date().toISOString();

  if (["instagram", "facebook", "youtube", "google_business", "google"].includes(normalizedProvider)) {
    const platformKey = normalizedProvider === "google" ? "google_business" : normalizedProvider;

    // 1. Fetch matching account IDs
    const { data: accounts } = await service
      .from("social_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("platform", platformKey);

    const accountIds = (accounts ?? []).map((a) => a.id);

    // 2. Mark account DISCONNECTED
    await service
      .from("social_accounts")
      .update({
        status: "DISCONNECTED",
        token_health: "REVOKED",
        updated_at: now,
      })
      .eq("tenant_id", tenantId)
      .eq("platform", platformKey);

    // 3. Clear sensitive token ciphertexts
    if (accountIds.length > 0) {
      await service
        .from("social_tokens")
        .update({
          access_token_encrypted: "",
          refresh_token_encrypted: null,
          expires_at: null,
          updated_at: now,
        })
        .in("account_id", accountIds);
    }
  } else if (normalizedProvider === "google_search_console" || normalizedProvider === "google_analytics") {
    // search_google_connections holds ONE shared Google OAuth grant behind
    // TWO independently-disconnectable sub-connectors (Search Console site,
    // GA4 property). Clearing only this sub-connector's own field left
    // `status` untouched at 'connected', and the canonical resolver
    // (lib/connectors/canonical-status.ts) treats status==='connected' as
    // CONNECTED regardless of whether a property is selected -- so
    // "Disconnect" here was a no-op from the customer's point of view; the
    // card kept showing CONNECTED. Only drop status to 'disconnected' (and
    // revoke the shared refresh token) once BOTH sub-connectors are clear;
    // otherwise the sibling sub-connector legitimately keeps the shared
    // OAuth grant alive.
    const { data: current } = await service
      .from("search_google_connections")
      .select("search_console_site_url, ga4_property_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const clearingSearchConsole = normalizedProvider === "google_search_console";
    const siblingStillSet = clearingSearchConsole
      ? Boolean(current?.ga4_property_id)
      : Boolean(current?.search_console_site_url);

    await service
      .from("search_google_connections")
      .update({
        ...(clearingSearchConsole
          ? { search_console_site_url: null, search_console_last_synced_at: null }
          : { ga4_property_id: null, ga4_property_display_name: null, ga4_last_synced_at: null }),
        ...(siblingStillSet
          ? {}
          : { status: "disconnected", encrypted_refresh_token_ref: null, granted_scopes: [] }),
        updated_at: now,
      })
      .eq("tenant_id", tenantId);
  } else if (normalizedProvider === "whatsapp") {
    await service
      .from("whatsapp_phone_bindings")
      .update({
        status: "disabled",
        updated_at: now,
      })
      .eq("tenant_id", tenantId);
  } else if (normalizedProvider === "website") {
    try {
      const brain = await getCurrentBrandBrain(service, tenantId);
      if (brain?.content) {
        const nextContent = { ...(brain.content as Record<string, unknown>), website_url: "" };
        await saveBrandBrainVersion(service, {
          tenantId,
          content: nextContent,
          createdBy: ctx.userId,
        });
      }
    } catch {
      // Non-fatal
    }
  }

  await recordAudit({
    actorType: "USER",
    actorId: ctx.userId,
    action: "account.disconnect",
    targetType: "digital_presence_connection",
    summary: `Disconnected ${normalizedProvider} from workspace`,
    meta: { tenantId, provider: normalizedProvider },
  });

  return Response.json({
    disconnected: true,
    provider: normalizedProvider,
    tenantId,
    timestamp: now,
  });
}
