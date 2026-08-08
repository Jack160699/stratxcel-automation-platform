import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { createPairingChallenge } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PHASE 18: authenticated server route for STAFF pairing-code generation.
 * Requires genuine platform staff auth (requirePlatformStaff) — tenant
 * membership alone is not enough. NOT a public/anonymous endpoint.
 *
 * The `tenantId` body field here is used ONLY to resolve the caller's
 * authenticated session (requireTenantContext's established pattern for
 * obtaining ctx.userId — see app/api/platform/admin/workers/health/route.ts
 * for the identical precedent). It is NOT stored as the staff principal's
 * tenantId — a staff whatsapp_channel_principals row always gets
 * tenant_id: null (platform staff are not scoped to one tenant).
 *
 * The plaintext code is returned exactly once, in this response, to the
 * authenticated caller. It is never persisted or logged — only its hash is
 * stored (see @stratxcel/agent-core's createPairingChallenge).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { tenantId?: string } | null;
  if (!body?.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase } = getTenantServiceContext();
  const challenge = await createPairingChallenge(supabase, {
    authUserId: ctx.userId,
    principalType: "staff",
    tenantId: null,
  });

  return Response.json(
    { code: challenge.code, expiresAt: challenge.expiresAt },
    { headers: { "Cache-Control": "no-store" } }
  );
}
