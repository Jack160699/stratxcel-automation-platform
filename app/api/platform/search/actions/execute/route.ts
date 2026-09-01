import { getTenantServiceContext, requireTenantContext } from "@/lib/tenants/tenant-context";
import { can } from "@/lib/rbac/policy";
import { isPlanTier } from "@stratxcel/payments-and-wallet";
import {
  executeSearchAction,
  createFixtureWordPressProvider,
  createStratxcelNativeCMSProvider,
  createVercelCMSProvider,
  resolveVercelWriteCapability,
} from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    tenantId?: string;
    actionId?: string;
    idempotencyKey?: string;
  };

  if (!body.tenantId || !body.actionId) {
    return Response.json({ error: "INVALID_REQUEST", message: "Missing tenantId or actionId" }, { status: 400 });
  }

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  // 1. RBAC Check
  if (!can(ctx.role, "mission:create")) {
    return Response.json({ error: "PERMISSION_DENIED", message: "User does not have permission to execute missions" }, { status: 403 });
  }

  const { supabase } = getTenantServiceContext();

  // 2. Server-Side Subscription / Entitlement Check (Free tier strictly blocked)
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_tier, status")
    .eq("tenant_id", body.tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tier = subscription?.plan_tier;
  if (!tier || tier === "free" || !isPlanTier(tier) || subscription?.status !== "active") {
    return Response.json(
      {
        error: "SUBSCRIPTION_REQUIRED",
        message: "Active Search Growth OS subscription (Starter, Growth, or Business) is required to execute actions.",
      },
      { status: 402 }
    );
  }

  // 3. Resolve Connected CMS Provider using Canonical Resolver
  const { data: cmsConn } = await supabase
    .from("search_cms_connections")
    .select("*")
    .eq("tenant_id", body.tenantId)
    .maybeSingle();

  const siteUrl = cmsConn?.site_url || process.env.NEXT_PUBLIC_APP_URL || "https://www.stratxcel.in";

  const vercelWriteResult = await resolveVercelWriteCapability({
    tenantId: body.tenantId,
    db: supabase,
    siteUrl,
  });

  const cmsProvider = cmsConn?.cms_type === "wordpress"
    ? createFixtureWordPressProvider({ siteUrl: cmsConn.site_url, writeEnabled: cmsConn.write_enabled })
    : cmsConn?.cms_type === "vercel" || cmsConn?.cms_type === "nextjs" || !cmsConn
    ? createVercelCMSProvider({
        siteUrl,
        projectId: cmsConn?.config?.projectId || process.env.VERCEL_PROJECT_ID || "prj_81j5A5rArsPVVNspwSPGGfuhg9NZ",
        teamId: cmsConn?.config?.teamId || process.env.VERCEL_TEAM_ID || "team_UWCzHaOLdAOtezWqRxYNxdYf",
        token: cmsConn?.vault_secret_id || undefined,
        writeEnabled: vercelWriteResult.writeEnabled,
      })
    : createStratxcelNativeCMSProvider({
        siteProjectId: "native_site",
        tenantId: body.tenantId,
        propertyUrl: siteUrl,
      });

  // 4. Execute Action
  const result = await executeSearchAction(
    {
      db: supabase,
      cmsProvider,
    },
    {
      tenantId: body.tenantId,
      actionId: body.actionId,
      actorUserId: ctx.userId,
      idempotencyKey: body.idempotencyKey,
    }
  );

  const statusCode = result.status === "VERIFIED" || result.status === "COMPLETED" ? 200 : result.status === "BLOCKED" ? 403 : 500;
  return Response.json(result, { status: statusCode });
}
