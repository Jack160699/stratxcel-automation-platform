import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createTenant, listMembershipsForUser } from "@/lib/tenants/repository";
import { saveBrandBrainVersion, type BrandBrainContent } from "@stratxcel/brand-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OnboardingRequestBody {
  business?: { name?: string; slug?: string; industry?: string };
  brand?: {
    businessName?: string;
    audience?: string;
    tone?: string;
    offers?: string[];
    restrictions?: string[];
  };
  goals?: string[];
  plan?: { tier?: string; note?: string } | null;
}

interface CreatedTenant {
  id: string;
  slug: string;
  name: string;
}

/**
 * Structured onboarding wizard's single write step. Lives outside app/app/
 * deliberately — that directory is enforced service-role-free by
 * lib/rbac/__tests__/client-app-shell.test.ts, so the tenant-creation +
 * Brand Brain seed + audit log sequence (all service-role, RLS has no
 * client insert policy for tenants/tenant_members/audit_events) has to run
 * here, same split every other tenant-scoped write in this build uses.
 *
 * Idempotency: re-derives membership from the session before creating
 * anything. A double-click or a retried response can never create a second
 * tenant for the same user — the second call just returns the tenant the
 * first call already created.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await listMembershipsForUser(supabase, user.id);
  if (existing.length > 0) {
    const first = existing[0];
    const tenant: CreatedTenant = { id: first.tenant.id, slug: first.tenant.slug, name: first.tenant.name };
    return Response.json({ tenant, created: false, brandBrainSaved: false, auditLogged: false }, { status: 200 });
  }

  const body = (await request.json()) as OnboardingRequestBody;
  const name = body.business?.name?.trim();
  const slug = body.business?.slug?.trim();
  if (!name || !slug) return Response.json({ error: "business name and slug are required" }, { status: 400 });
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return Response.json({ error: "slug must be lowercase letters, numbers, and hyphens only" }, { status: 400 });
  }

  const { supabase: serviceClient } = getTenantServiceContext();

  let tenant: CreatedTenant;
  try {
    tenant = await createTenant(serviceClient, { slug, name, ownerUserId: user.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate key")) {
      return Response.json({ error: `Slug '${slug}' is already taken` }, { status: 409 });
    }
    throw err;
  }

  let brandBrainSaved = false;
  const content: BrandBrainContent = {};
  if (body.brand?.businessName) content.business_name = body.brand.businessName;
  if (body.business?.industry) content.industry = body.business.industry;
  if (body.brand?.tone) content.tone_of_voice = body.brand.tone;
  if (body.brand?.audience) content.target_audience = body.brand.audience;
  if (body.brand?.offers?.length) content.products = body.brand.offers.map((o) => ({ name: o, description: "" }));
  if (body.brand?.restrictions?.length) content.rules = body.brand.restrictions;
  if (Object.keys(content).length > 0) {
    try {
      await saveBrandBrainVersion(serviceClient, { tenantId: tenant.id, content, createdBy: user.id });
      brandBrainSaved = true;
    } catch (err) {
      console.error("onboarding: failed to save Brand Brain seed", err);
    }
  }

  let auditLogged = false;
  const auditRows: { tenant_id: string; actor_user_id: string; action: string; target_type: string; target_id: string; metadata: Record<string, unknown> }[] = [];
  if (body.goals?.length) {
    auditRows.push({
      tenant_id: tenant.id,
      actor_user_id: user.id,
      action: "onboarding.goals_selected",
      target_type: "tenant",
      target_id: tenant.id,
      metadata: { goals: body.goals },
    });
  }
  if (body.plan?.tier || body.plan?.note) {
    auditRows.push({
      tenant_id: tenant.id,
      actor_user_id: user.id,
      action: "onboarding.plan_requested",
      target_type: "tenant",
      target_id: tenant.id,
      metadata: { tier: body.plan?.tier ?? null, note: body.plan?.note ?? null },
    });
  }
  if (auditRows.length > 0) {
    const { error: auditError } = await serviceClient.from("audit_events").insert(auditRows);
    if (auditError) {
      console.error("onboarding: failed to write audit_events", auditError.message);
    } else {
      auditLogged = true;
    }
  }

  return Response.json({ tenant, created: true, brandBrainSaved, auditLogged }, { status: 201 });
}
