import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createEmbeddedSignupState } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Never fabricates a connection. If META_WHATSAPP_APP_ID/META_WHATSAPP_
 * CONFIG_ID aren't configured (they aren't anywhere in this repository —
 * WhatsApp Embedded Signup needs its own Meta Business app configuration,
 * separate from the currently-submitted social Meta App Review, which this
 * task does not touch), this returns a clear "not yet available" instead of
 * a URL that would fail downstream.
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

  const appId = process.env.META_WHATSAPP_APP_ID;
  const configId = process.env.META_WHATSAPP_CONFIG_ID;
  if (!appId || !configId) {
    return Response.json(
      { available: false, error: "WhatsApp Embedded Signup is not yet configured — connect a phone number manually below, or ask an operator to complete Meta setup." },
      { status: 503 }
    );
  }

  let state: string;
  try {
    state = createEmbeddedSignupState(tenantId);
  } catch (err) {
    return Response.json({ available: false, error: err instanceof Error ? err.message : "State signing is not configured" }, { status: 503 });
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stratxcel.in"}/api/platform/whatsapp/embedded-signup/callback`;
  const signupUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&config_id=${encodeURIComponent(configId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&response_type=code`;

  return Response.json({ available: true, signupUrl, state });
}
