import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { findLegacyBotBinding, getWhatsAppMigrationMode, computeCutoverReadiness } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff-only, read-only migration/parity status for the admin UI. Never
 * returns credentials or the shared shadow-ingest secret. Live legacy-bot
 * health is a best-effort read-only probe of the bot's own public health
 * route — failures are reported as "unknown", never fabricated as healthy.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const binding = await findLegacyBotBinding(ctx.supabase);
  const migrationMode = getWhatsAppMigrationMode();

  let legacyBotHealth: "healthy" | "unhealthy" | "unknown" = "unknown";
  if (binding?.legacy_host) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`https://${binding.legacy_host}/webhook/health`, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeout);
      legacyBotHealth = res.ok ? "healthy" : "unhealthy";
    } catch {
      legacyBotHealth = "unknown";
    }
  }

  let mirroredEventsCount = 0;
  let lastMirroredEventAt: string | null = null;
  let comparableTurns = 0;
  let matchCount = 0;
  let mismatchCount = 0;
  let shadowErrors = 0;
  let recentMismatches: Array<{ legacyEventId: string; mismatchReason: string | null; comparedAt: string | null }> = [];

  if (binding) {
    const { count: eventsCount, data: recentEvents } = await ctx.supabase
      .from("whatsapp_shadow_events")
      .select("received_at", { count: "exact" })
      .eq("phone_binding_id", binding.id)
      .order("received_at", { ascending: false })
      .limit(1);
    mirroredEventsCount = eventsCount ?? 0;
    lastMirroredEventAt = recentEvents?.[0]?.received_at ?? null;

    const { data: parityRows } = await ctx.supabase
      .from("whatsapp_parity_records")
      .select("parity_category, legacy_event_id, mismatch_reason, compared_at")
      .eq("phone_binding_id", binding.id);

    for (const row of parityRows ?? []) {
      if (row.parity_category === "ERROR") shadowErrors += 1;
      else if (row.parity_category !== "NOT_COMPARABLE") {
        comparableTurns += 1;
        if (row.parity_category === "MATCH" || row.parity_category === "FUNCTIONAL_MATCH") matchCount += 1;
        else if (row.parity_category === "MISMATCH") mismatchCount += 1;
      }
    }
    recentMismatches = (parityRows ?? [])
      .filter((r) => r.parity_category === "MISMATCH")
      .slice(0, 5)
      .map((r) => ({ legacyEventId: r.legacy_event_id, mismatchReason: r.mismatch_reason, comparedAt: r.compared_at }));
  }

  const readiness = computeCutoverReadiness({
    bindingConfigured: Boolean(binding),
    migrationMode,
    comparableEventCount: comparableTurns,
    mismatchCount,
    workerHostAvailable: false, // known blocker this task — see Notion/final report
    metaCredentialsConfigured: Boolean(process.env.META_WHATSAPP_APP_ID && process.env.META_WHATSAPP_CONFIG_ID),
  });

  return Response.json(
    {
      legacyBot: binding
        ? {
            configured: true,
            wabaId: binding.waba_id,
            phoneNumberId: binding.phone_number_id,
            displayPhoneNumber: binding.display_phone_number,
            legacyHost: binding.legacy_host,
            status: binding.status,
            migrationStatus: binding.migration_status,
            health: legacyBotHealth,
          }
        : { configured: false },
      migrationMode,
      mirroredEventsCount,
      lastMirroredEventAt,
      comparableTurns,
      matchCount,
      mismatchCount,
      shadowErrors,
      recentMismatches,
      cutoverReadiness: readiness.readiness,
      cutoverRequirements: readiness.requirements,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
