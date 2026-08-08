import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createPairingChallenge } from "@stratxcel/agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PHASE 18: authenticated server route for CLIENT pairing-code generation.
 * Requires genuine tenant membership (requireTenantContext) with the
 * "integration:configure" permission — reusing the existing tenant RBAC
 * permission model rather than inventing a parallel one. tenantId is always
 * taken from the verified membership context, never trusted from the
 * request body for the value that gets stored on the pairing row.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { tenantId?: string } | null;
  if (!body?.tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const challenge = await createPairingChallenge(supabase, {
    authUserId: ctx.userId,
    principalType: "client",
    tenantId: ctx.tenantId,
  });

  return Response.json(
    { code: challenge.code, expiresAt: challenge.expiresAt },
    { headers: { "Cache-Control": "no-store" } }
  );
}
