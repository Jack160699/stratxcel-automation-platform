import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createTenant, listMembershipsForUser } from "@/lib/tenants/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tenant bootstrap: this is what was missing before any of the other
 * /api/platform/* routes could be exercised by a real user — until now
 * there was no way for an authenticated person to actually create a
 * tenant and become its owner. GET lists the caller's own memberships
 * (used to build a tenant switcher); POST creates a new tenant with the
 * caller as owner.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { supabase: serviceClient } = getTenantServiceContext();
  const memberships = await listMembershipsForUser(serviceClient, user.id);
  return Response.json({ memberships }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await request.json()) as { slug?: string; name?: string };
  if (!body.slug || !body.name) return Response.json({ error: "slug and name are required" }, { status: 400 });
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    return Response.json({ error: "slug must be lowercase letters, numbers, and hyphens only" }, { status: 400 });
  }

  const { supabase: serviceClient } = getTenantServiceContext();

  try {
    const tenant = await createTenant(serviceClient, { slug: body.slug, name: body.name, ownerUserId: user.id });
    return Response.json({ tenant }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate key")) {
      return Response.json({ error: `Slug '${body.slug}' is already taken` }, { status: 409 });
    }
    throw err;
  }
}
