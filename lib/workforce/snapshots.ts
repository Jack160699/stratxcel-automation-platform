/**
 * Server-side entitlement / integration / environment snapshots.
 * Callers must never manufacture these for production execution.
 */
import { getEntitlementSummary } from "@stratxcel/payments-and-wallet";
import type {
  CapabilityEntitlementView,
  CapabilityEnvironmentView,
  CapabilityIntegrationView,
} from "@stratxcel/workforce-core";
import { createSupabaseServiceClient } from "../supabase/service.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export async function loadCapabilityEntitlementSnapshot(
  tenantId: string,
  service: ServiceClient = createSupabaseServiceClient(),
): Promise<CapabilityEntitlementView> {
  const rows = await getEntitlementSummary(service as never, tenantId);
  const metrics: Record<string, number> = {};
  const remaining: Record<string, number> = {};
  const pausedMetrics: string[] = [];
  for (const row of rows) {
    metrics[row.metric] = row.limit;
    remaining[row.metric] = row.remaining;
    if (row.isPaused) pausedMetrics.push(row.metric);
  }
  return {
    tenantId,
    metrics,
    remaining,
    pausedMetrics,
  };
}

export async function loadCapabilityIntegrationSnapshot(
  tenantId: string,
  service: ServiceClient = createSupabaseServiceClient(),
): Promise<CapabilityIntegrationView> {
  const connected: string[] = [];

  const { data: socialAccounts } = await service
    .from("social_accounts")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .limit(20);
  if (
    (socialAccounts ?? []).some((a) =>
      ["connected", "active", "live"].includes(String(a.status).toLowerCase()),
    )
  ) {
    connected.push("social_account");
  }

  const { data: waBindings } = await service
    .from("whatsapp_phone_bindings")
    .select("id, status, outbound_enabled")
    .eq("tenant_id", tenantId)
    .limit(20);
  if (
    (waBindings ?? []).some(
      (b) =>
        String(b.status).toLowerCase() === "active" &&
        (b.outbound_enabled === true || b.outbound_enabled == null),
    )
  ) {
    connected.push("whatsapp_binding");
  }

  // analytics_property: only when a real tenant analytics connection exists.
  // Env keys alone do not count. Table may not exist yet — fail closed (omit).
  try {
    const { data: analyticsLinks, error: analyticsError } = await service
      .from("tenant_analytics_connections")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .limit(5);
    if (
      !analyticsError &&
      analyticsLinks &&
      analyticsLinks.some((r) =>
        ["connected", "active", "ready"].includes(String(r.status).toLowerCase()),
      )
    ) {
      connected.push("analytics_property");
    }
  } catch {
    // omit
  }

  return { tenantId, connected };
}

export function loadCapabilityEnvironmentView(): CapabilityEnvironmentView {
  const flag = (name: string): boolean => {
    const raw = process.env[name];
    if (raw == null) return true; // unset = enabled for existing capabilities that rely on flags
    return !["0", "false", "off", "disabled"].includes(String(raw).toLowerCase());
  };
  return {
    featureFlags: {
      social_scheduling: flag("FEATURE_SOCIAL_SCHEDULING"),
      social_publishing: flag("FEATURE_SOCIAL_PUBLISHING"),
      search_web: flag("FEATURE_SEARCH_WEB"),
      whatsapp_outbound: flag("FEATURE_WHATSAPP_OUTBOUND"),
    },
  };
}

export async function loadShadowAndKillSwitch(tenantId: string): Promise<{
  shadowMode: boolean;
  killSwitchActive: boolean;
}> {
  const globalShadow =
    process.env.STRATXCEL_SHADOW_MODE === "1" ||
    process.env.SOCIAL_SHADOW_MODE === "1" ||
    process.env.WHATSAPP_SHADOW_MODE === "1";
  const globalKill =
    process.env.STRATXCEL_KILL_SWITCH === "1" ||
    process.env.SOCIAL_PUBLISH_KILL_SWITCH === "1";

  // Tenant-scoped automation settings when present.
  try {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from("social_automation_settings")
      .select("shadow_mode, kill_switch")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return {
      shadowMode: globalShadow || data?.shadow_mode === true,
      killSwitchActive: globalKill || data?.kill_switch === true,
    };
  } catch {
    return { shadowMode: globalShadow, killSwitchActive: globalKill };
  }
}
