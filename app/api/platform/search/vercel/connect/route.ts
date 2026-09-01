import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { connectVercelWebsite } from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/search/vercel/connect
 * Body: { tenantId, token, scope? }
 *
 * Real, tenant-authenticated, permission-gated (integration:configure --
 * same convention as every other connector in this codebase, e.g.
 * app/api/platform/search/google/connect/route.ts). The token is
 * validated against the real Vercel API and stored only via the real
 * AES-256-GCM vault (@stratxcel/byok) -- never persisted raw, never
 * echoed back in this response.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string; token?: string; scope?: "ANALYSIS_ONLY" | "AUTONOMOUS_WRITE" };

  if (!body.tenantId || !body.token || typeof body.token !== "string" || body.token.trim().length < 10) {
    return Response.json({ error: "SEARCH_VERCEL_INVALID_REQUEST", message: "tenantId and a real token are required." }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const result = await connectVercelWebsite(supabase, {
    tenantId: body.tenantId,
    connectedByUserId: ctx.userId,
    // Defensive trim server-side, independent of the client already
    // trimming (WebsiteConnectorCard.tsx) -- the length check three lines
    // up validates the trimmed length but this used to pass the raw,
    // untrimmed value through, an inconsistency worth closing regardless
    // of whether it was the reported 404's actual cause (this codebase's
    // established pattern: never trust client-side normalization alone).
    token: body.token.trim(),
    scope: body.scope === "AUTONOMOUS_WRITE" ? "AUTONOMOUS_WRITE" : "ANALYSIS_ONLY",
  });

  if (!result.ok) {
    return Response.json({ error: "SEARCH_VERCEL_CONNECT_FAILED", reason: result.reason }, { status: 400 });
  }

  return Response.json({ connected: true, accountName: result.accountName, diagnosticState: result.diagnosticState }, { status: 200 });
}
