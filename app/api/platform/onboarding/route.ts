import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { createTenant, listMembershipsForUser } from "@/lib/tenants/repository";
import { saveBrandBrainVersion, type BrandBrainContent } from "@stratxcel/brand-brain";
import { resolveCanonicalIdentity } from "@/lib/identity/resolve-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONBOARDING_METADATA_KEY = "stratxcel_onboarding_draft_v1";
const MAX_STEP = 5;

interface OnboardingRequestBody {
  business?: { name?: string; slug?: string; industry?: string; website?: string; location?: string };
  brand?: {
    businessName?: string;
    description?: string;
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

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function sanitizeDraft(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const business = source.business && typeof source.business === "object" ? (source.business as Record<string, unknown>) : {};
  const brand = source.brand && typeof source.brand === "object" ? (source.brand as Record<string, unknown>) : {};
  const plan = source.plan && typeof source.plan === "object" ? (source.plan as Record<string, unknown>) : {};
  return {
    business: {
      name: text(business.name, 120),
      slug: text(business.slug, 80),
      slugTouched: business.slugTouched === true,
      industry: text(business.industry, 120),
      website: text(business.website, 500),
      location: text(business.location, 200),
    },
    goals: Array.isArray(source.goals) ? source.goals.filter((goal): goal is string => typeof goal === "string").slice(0, 12).map((goal) => goal.slice(0, 100)) : [],
    brand: {
      businessName: text(brand.businessName, 120),
      description: text(brand.description, 2_000),
      audience: text(brand.audience, 1_000),
      tone: text(brand.tone, 500),
      offers: text(brand.offers, 4_000),
      restrictions: text(brand.restrictions, 4_000),
    },
    plan: { tier: text(plan.tier, 40) || null, note: text(plan.note, 1_000) },
  };
}

async function authenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Cross-device draft recovery without a new table or service-role write. */
export async function GET() {
  const { user } = await authenticatedUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const saved = user.user_metadata?.[ONBOARDING_METADATA_KEY] ?? null;
  return Response.json({ saved }, { headers: { "Cache-Control": "no-store" } });
}

/** Saves only bounded, non-secret setup fields in the authenticated user's metadata. */
export async function PATCH(request: Request) {
  const { supabase, user } = await authenticatedUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { step?: unknown; draft?: unknown };
  const step = typeof body.step === "number" ? Math.min(Math.max(Math.floor(body.step), 1), MAX_STEP) : 1;
  const saved = { version: 1, step, draft: sanitizeDraft(body.draft), updatedAt: new Date().toISOString() };
  const { error } = await supabase.auth.updateUser({ data: { [ONBOARDING_METADATA_KEY]: saved } });
  if (error) return Response.json({ error: "Could not save onboarding progress." }, { status: 500 });
  return Response.json({ saved }, { headers: { "Cache-Control": "no-store" } });
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
  const identity = await resolveCanonicalIdentity();
  if (identity.state === "NO_SESSION") {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (identity.state === "INTERNAL_STAFF" || identity.state === "STAFF_VIEWING_CLIENT") {
    return Response.json({ error: "Staff accounts must create clients from the Admin workspace" }, { status: 403 });
  }
  const { supabase, user } = await authenticatedUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const existing = await listMembershipsForUser(supabase, user.id);
  if (existing.length > 0) {
    const first = existing[0];
    const tenant: CreatedTenant = { id: first.tenant.id, slug: first.tenant.slug, name: first.tenant.name };
    await supabase.auth.updateUser({ data: { [ONBOARDING_METADATA_KEY]: null } });
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
  if (body.brand?.businessName || name) content.business_name = body.brand?.businessName || name;
  if (body.business?.website) content.website_url = body.business.website;
  if (body.business?.location) content.location = body.business.location;
  if (body.business?.industry) content.industry = body.business.industry;
  if (body.brand?.description) content.description = body.brand.description;
  if (body.brand?.tone) content.tone_of_voice = body.brand.tone;
  if (body.brand?.audience) content.target_audience = body.brand.audience;
  if (body.brand?.offers?.length) content.products = body.brand.offers.map((o) => ({ name: o, description: "" }));
  if (body.brand?.restrictions?.length) content.rules = body.brand.restrictions;
  if (body.goals?.length) content.goals = body.goals;

  if (Object.keys(content).length > 0) {
    try {
      await saveBrandBrainVersion(serviceClient, { tenantId: tenant.id, content, createdBy: user.id });
      brandBrainSaved = true;
    } catch (err) {
      console.error("onboarding: failed to save Brand Brain seed", err);
    }
  }

  // Sync initial CRM lead for the newly created tenant
  try {
    const contactEmail = user.email ?? null;
    const contactName = user.user_metadata?.full_name ?? name;
    await serviceClient.from("crm_leads").insert({
      tenant_id: tenant.id,
      source: "website",
      contact_name: contactName,
      contact_email: contactEmail,
      status: "new",
      metadata: {
        kind: "CUSTOMER_ONBOARDING_PRIMARY_CONTACT",
        businessName: name,
        websiteUrl: body.business?.website ?? null,
        industry: body.business?.industry ?? null,
        goals: body.goals ?? [],
        planRequested: body.plan?.tier ?? null,
      },
    });
  } catch (crmErr) {
    console.warn("onboarding: non-fatal crm lead sync trace", crmErr);
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

  await supabase.auth.updateUser({ data: { [ONBOARDING_METADATA_KEY]: null } });
  return Response.json({ tenant, created: true, brandBrainSaved, auditLogged }, { status: 201 });
}
