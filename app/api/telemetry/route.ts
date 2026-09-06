import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  classifyUserAgent,
  extractClientIp,
  hashTelemetryIp,
  sanitizeEventName,
  sanitizeTelemetryProperties,
  sanitizeUserAgent,
} from "@/lib/analytics/telemetry-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENTS_PER_WINDOW = 120;

// Best-effort, in-memory, per-server-instance throttle -- purely to blunt a
// flood of scripted hits against this public endpoint. Not durable and not
// shared across serverless instances, the same limitation the
// public-audit-requests route's own memory fallback already accepts (see
// app/api/public/audit-requests/route.ts). Telemetry is inherently
// best-effort, so no new RPC/table is introduced just to rate-limit it.
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ipHash: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ipHash) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_EVENTS_PER_WINDOW) {
    rateLimitMap.set(ipHash, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(ipHash, timestamps);
  return false;
}

/**
 * Best-effort tenant resolution for an authenticated visitor. Deliberately
 * never trusts a client-supplied tenant id -- resolved server-side from the
 * session cookie only (one indexed tenant_members lookup, not the fuller
 * listMyTenants() join resolveCanonicalIdentity() does), and any failure
 * here must never block the write.
 */
async function resolveTenantId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    return data?.tenant_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Permanent, bot-filterable telemetry sink alongside Vercel Analytics --
 * called from lib/analytics/events.ts' trackFunnel() on every funnel event.
 * Fire-and-forget by contract: the caller never awaits or inspects this
 * response meaningfully, so every failure path below still returns 202
 * rather than surfacing an error a caller might act on. Anonymous by
 * default (no auth required); when a session cookie is present the
 * visitor's tenant is attached server-side.
 */
export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return Response.json({ ok: true }, { status: 202 });
    }

    const rawIp = extractClientIp(request.headers);
    const ipHash = hashTelemetryIp(rawIp);
    if (isRateLimited(ipHash)) {
      return Response.json({ ok: true }, { status: 202 });
    }

    const body = await request.json().catch(() => null);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;

    const eventName = sanitizeEventName(record?.event);
    if (!eventName) {
      return Response.json({ ok: true }, { status: 202 });
    }

    const properties = sanitizeTelemetryProperties(record?.properties);
    const userAgent = sanitizeUserAgent(request.headers.get("user-agent"));
    const uaClass = classifyUserAgent(userAgent);
    const tenantId = await resolveTenantId();

    const { supabase } = getTenantServiceContext();
    const { error } = await supabase.from("telemetry_events").insert({
      tenant_id: tenantId,
      event_name: eventName,
      properties,
      ip_hash: ipHash,
      user_agent: userAgent,
      ua_class: uaClass,
    });

    if (error) {
      console.warn("[telemetry] insert failed (non-fatal)", error.message);
    }

    return Response.json({ ok: true }, { status: 202 });
  } catch (err) {
    console.warn("[telemetry] request failed (non-fatal)", err instanceof Error ? err.message : err);
    return Response.json({ ok: true }, { status: 202 });
  }
}
