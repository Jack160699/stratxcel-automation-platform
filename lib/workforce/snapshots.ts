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

function isSocialCapability(capability: string): boolean {
  return capability.startsWith("social.");
}

function isWhatsAppCapability(capability: string): boolean {
  return capability.startsWith("whatsapp.");
}

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
    .select("id, status, outbound_enabled, source")
    .eq("tenant_id", tenantId)
    .limit(20);
  // Must match WhatsApp outbound preflight: active + outbound_enabled === true.
  if (
    (waBindings ?? []).some((b) => {
      if (String(b.status).toLowerCase() !== "active") return false;
      if (b.outbound_enabled !== true) return false;
      // Legacy verified bot bindings are prohibited from live outbound.
      const source = String(b.source ?? "").toLowerCase();
      if (source === "legacy_verified_bot") return false;
      return true;
    })
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

/**
 * Capability-scoped shadow / kill switches.
 * Social and WhatsApp env flags must not bleed into unrelated capabilities.
 */
export async function loadShadowAndKillSwitch(args: {
  tenantId: string;
  capability: string;
}): Promise<{
  shadowMode: boolean;
  killSwitchActive: boolean;
}> {
  const { tenantId, capability } = args;
  const globalShadow = process.env.STRATXCEL_SHADOW_MODE === "1";
  const globalKill = process.env.STRATXCEL_KILL_SWITCH === "1";

  const socialShadow =
    isSocialCapability(capability) && process.env.SOCIAL_SHADOW_MODE === "1";
  const whatsappShadow =
    isWhatsAppCapability(capability) && process.env.WHATSAPP_SHADOW_MODE === "1";

  const socialPublishKill =
    capability === "social.publish" && process.env.SOCIAL_PUBLISH_KILL_SWITCH === "1";

  let tenantSocialShadow = false;
  let tenantSocialKill = false;
  if (isSocialCapability(capability)) {
    try {
      const service = createSupabaseServiceClient();
      const { data } = await service
        .from("social_automation_settings")
        .select("shadow_mode, kill_switch")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      tenantSocialShadow = data?.shadow_mode === true;
      // Tenant social kill applies to social.publish (and schedule) defense-in-depth.
      tenantSocialKill =
        data?.kill_switch === true &&
        (capability === "social.publish" || capability === "social.schedule");
    } catch {
      // omit
    }
  }

  let tenantKillSwitch = false;
  try {
    const service = createSupabaseServiceClient();
    const { isKillSwitchActive } = await import("@stratxcel/queue");
    const kill = await isKillSwitchActive(service as never, [
      { scope: "tenant", scopeId: tenantId },
    ]);
    // Tenant kill_switches rows are global to the tenant when enabled.
    tenantKillSwitch = kill.active === true;
  } catch {
    // Fail open on unreadable table here — queue workers still fail closed.
    // Capability executor must not block all capabilities on a missing table
    // in local/test; env + social settings remain authoritative.
  }

  return {
    shadowMode: globalShadow || socialShadow || whatsappShadow || tenantSocialShadow,
    killSwitchActive:
      globalKill || socialPublishKill || tenantSocialKill || tenantKillSwitch,
  };
}
