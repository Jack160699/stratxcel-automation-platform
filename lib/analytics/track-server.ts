import "server-only";

import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { sanitizeEventName, sanitizeTelemetryProperties } from "@/lib/analytics/telemetry-shared";
import type { FunnelEvent, FunnelProps } from "@/lib/analytics/events";

/**
 * Server-side counterpart to trackFunnel() (lib/analytics/events.ts) for
 * funnel events that originate inside a server route rather than a
 * browser click -- e.g. subscription_activated from the Razorpay webhook
 * (app/api/webhook/razorpay/route.ts). Writes directly to telemetry_events
 * via the service-role client instead of the caller round-tripping through
 * its own /api/telemetry over HTTP.
 *
 * Same fire-and-forget contract as trackFunnel(): never throws, and a
 * failure here must never fail or delay the caller's real work (payment
 * fulfilment, onboarding, etc.). Callers should call this without
 * `await`-blocking their response where possible; it is safe to await
 * directly since it never rejects.
 *
 * No ip_hash/user_agent -- server-originated events aren't attributable to
 * a specific browsing session's request, so those columns stay null and
 * ua_class defaults to 'unknown' at the DB level.
 */
export async function trackFunnelServer(
  event: FunnelEvent,
  props?: FunnelProps,
  context?: { tenantId?: string | null }
): Promise<void> {
  try {
    const eventName = sanitizeEventName(event);
    if (!eventName) return;
    const { supabase } = getTenantServiceContext();
    const { error } = await supabase.from("telemetry_events").insert({
      tenant_id: context?.tenantId ?? null,
      event_name: eventName,
      properties: sanitizeTelemetryProperties(props ?? {}),
    });
    if (error) {
      console.warn("[telemetry] server-side track failed (non-fatal)", error.message);
    }
  } catch (err) {
    console.warn("[telemetry] server-side track failed (non-fatal)", err instanceof Error ? err.message : err);
  }
}
