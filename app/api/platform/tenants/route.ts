import { requireOwnerContext } from "@/lib/social/db-context";
import { createAgencyTenant, listAgencyTenants } from "@/lib/tenants/admin-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Internal agency client listing. Customer membership is intentionally irrelevant here. */
export async function GET() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });
  const tenants = await listAgencyTenants();
  return Response.json({ tenants }, { headers: { "Cache-Control": "no-store" } });
}

/** Internal client creation creates the tenant only; staff are never added as fake customer owners. */
export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const body = (await request.json()) as { slug?: string; name?: string };
  if (!body.slug || !body.name) return Response.json({ error: "slug and name are required" }, { status: 400 });
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    return Response.json({ error: "slug must be lowercase letters, numbers, and hyphens only" }, { status: 400 });
  }

  try {
    const tenant = await createAgencyTenant({ slug: body.slug, name: body.name });
    return Response.json({ tenant: { id: tenant.tenantId, slug: tenant.slug, name: tenant.name } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate key")) {
      return Response.json({ error: `Slug '${body.slug}' is already taken` }, { status: 409 });
    }
    throw err;
  }
}
