import { getTenantServiceContext, requireTenantContext } from "@/lib/tenants/tenant-context";
import { can } from "@/lib/rbac/policy";
import { isPlanTier } from "@stratxcel/payments-and-wallet";
import {
  executeSearchAction,
  createFixtureWordPressProvider,
  createStratxcelNativeCMSProvider,
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

  // 3. Resolve Connected CMS Provider
  //
  // Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
  // search_cms_connections does not exist in the real production database
  // (its migration, 20260820050000_search_action_execution_and_cms.sql,
  // was never applied -- confirmed directly against the live schema, not
  // assumed). This query's error was previously discarded (`const { data:
  // cmsConn }`), so the real query failure silently looked identical to
  // "tenant has no CMS connection configured", and the code fell through
  // to a HARDCODED PLACEHOLDER property URL
  // ("https://client-site.stratxcel.in") and executed the mutation
  // against it anyway -- a real, live, PAID action route silently
  // targeting a fake site while reporting success. Fixed to fail closed
  // on a real query error, and to fail closed (not fall back to a
  // fabricated URL) when a tenant genuinely has no CMS connection row
  // either -- both cases now return an honest error instead of a false
  // success.
  const { data: cmsConn, error: cmsConnError } = await supabase
    .from("search_cms_connections")
    .select("*")
    .eq("tenant_id", body.tenantId)
    .maybeSingle();

  if (cmsConnError) {
    return Response.json(
      { error: "SEARCH_CMS_LOOKUP_FAILED", message: "Could not look up this workspace's connected CMS. No action was executed." },
      { status: 500 },
    );
  }

  if (!cmsConn) {
    return Response.json(
      { error: "SEARCH_CMS_NOT_CONNECTED", message: "No website/CMS is connected for this workspace yet. Connect one before executing actions." },
      { status: 409 },
    );
  }

  const cmsProvider = cmsConn.cms_type === "wordpress"
    ? createFixtureWordPressProvider({ siteUrl: cmsConn.site_url, writeEnabled: cmsConn.write_enabled })
    : createStratxcelNativeCMSProvider({
        siteProjectId: "native_site",
        tenantId: body.tenantId,
        propertyUrl: cmsConn.site_url,
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
