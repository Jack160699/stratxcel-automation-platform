import { createHash, randomBytes } from "node:crypto";
import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import type { TenantRole } from "@/lib/tenants/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITE_ROLES = new Set(["admin", "operator", "viewer"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { tenantId?: string; email?: string; role?: string };
  if (!body.tenantId || !body.email?.trim()) {
    return Response.json({ error: "tenantId and email are required" }, { status: 400 });
  }
  const role = (body.role ?? "viewer") as TenantRole;
  if (!INVITE_ROLES.has(role)) {
    return Response.json({ error: "Role must be admin, operator, or viewer." }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  try {
    requirePermission(ctx.role, "tenant:invite_member");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const { supabase } = getTenantServiceContext();
  const { data, error } = await supabase.from("tenant_invitations").insert({
    tenant_id: body.tenantId,
    email: body.email.trim().toLowerCase(),
    role,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: ctx.userId,
  }).select("id, expires_at").single();
  if (error) return Response.json({ error: "Could not create invite." }, { status: 500 });

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://www.stratxcel.in";
  return Response.json({
    inviteId: data.id,
    expiresAt: data.expires_at,
    inviteUrl: `${origin}/invite/${token}`,
  }, { status: 201 });
}
